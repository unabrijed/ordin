import { Readable } from 'node:stream';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { encodeFunctionData, erc20Abi, formatUnits, isAddress, keccak256, parseEther, toHex, verifyMessage, type Address, type Hex, type WalletClient, type Transport, type Chain, type Account } from 'viem';
import { approveTokenCall, cancelPolicyTypedData, cancelSignedPolicyCall, collectCall, createPolicyTypedData, inspectPolicy, ordinAbi, paymentEvents, policyId, readNonce, registerSignedPolicyCall, type PolicyTerms } from '../../sdk/index.ts';
import { serverConfiguration } from './config.ts';
import { TransactionQueue } from './queue.ts';
import { paymentReference } from './billing.ts';
import { createRuntime, type Runtime } from './runtime.ts';
import { renderCard } from './render.ts';

const stringify=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
const assert: (condition:unknown,message:string,status?:number)=>asserts condition = (condition,message,status=400)=>{if(!condition)throw new HttpError(status,message);};
const termsFrom=(t:any):PolicyTerms=>({...t,amount:BigInt(t.amount),interval:BigInt(t.interval),start:BigInt(t.start),expiry:BigInt(t.expiry)});

export async function createMerchantApp(runtime:Runtime, database=':memory:', publicOrigin?:string) {
 const r=runtime, client=r.client;
 const signer=r.merchant as WalletClient<Transport,Chain,Account>;
 const db=new DatabaseSync(database);
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, owner TEXT, expires INTEGER);
 CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, owner TEXT, message TEXT, expires INTEGER);
 CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, owner TEXT, kind TEXT, payload TEXT, expires INTEGER);
 CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, owner TEXT, created INTEGER);
 CREATE TABLE IF NOT EXISTS receipts (hash TEXT PRIMARY KEY, kind TEXT, policy TEXT, block TEXT);
 CREATE TABLE IF NOT EXISTS usage (owner TEXT, policy TEXT, period TEXT, count INTEGER, PRIMARY KEY(owner,policy,period));
 CREATE TABLE IF NOT EXISTS keys (digest TEXT PRIMARY KEY, owner TEXT, prefix TEXT, created INTEGER);
 CREATE TABLE IF NOT EXISTS budget (job TEXT PRIMARY KEY, day TEXT, cost TEXT);
 CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);`);
 const identity=`${r.chainId}:${r.contract.toLowerCase()}:${r.merchant.account.address.toLowerCase()}:${r.treasury.toLowerCase()}`;
 const previous=db.prepare('SELECT value FROM metadata WHERE key=?').get('identity') as any;
 if(previous&&previous.value!==identity)throw new Error('Database belongs to a different chain, contract or merchant. Use a separate FRAME_DATABASE.');
 db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('identity',identity);
 const queue=new TransactionQueue(database===':memory:'?':memory:':database+'.queue.sqlite');
 let tail:Promise<unknown>=Promise.resolve();
 const exclusive=<T>(fn:()=>Promise<T>)=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 let lastTick=0, workerError='',closing=false;
 const states=new Map<string,string>();
 const attempts: {at:number;policy:string;status:string}[]=[];
 const report=(id:string,status:string)=>{if(states.get(id)!==status){attempts.unshift({at:Date.now(),policy:id,status});attempts.splice(50);}states.set(id,status);};
 const transactionState=async(h:Hex)=>{
  let receipt;
  try{receipt=await client.getTransactionReceipt({hash:h});}catch(e:any){if(e.name==='TransactionReceiptNotFoundError')return 'pending' as const;throw e;}
  const head=await client.getBlockNumber({cacheTime:0});
  if(head<receipt.blockNumber+BigInt(r.confirmations-1))return 'pending' as const;
  return receipt.status==='success'?'success' as const:'reverted' as const;
 };
 const transport=(prepare:()=>Promise<Hex>)=>({prepare,broadcast:async(raw:Hex)=>{
  try{await client.sendRawTransaction({serializedTransaction:raw});}catch(e:any){
   // An accepted transaction may have outlived its HTTP response. Reconcile its hash first.
   try { await client.getTransaction({hash:keccak256(raw)}); } catch { throw new Error('Broadcast unresolved; the worker will retry the saved transaction'); }
  }
 },receipt:transactionState});
 async function reconcile() {
  for(const entry of queue.pending()) await queue.execute(entry.job,transport(async()=>{throw new Error('Missing persisted transaction');}));
 }
 async function send(job:string,call:{to:Address;data:Hex},kind:string,id:Hex) {
  const t=transport(async()=>{
   await client.call({account:r.merchant.account.address,...call});
   const request=await signer.prepareTransactionRequest({...call});
   if(r.mode==='whitechain'){
    const day=new Date().toISOString().slice(0,10);
    const rows=db.prepare('SELECT cost FROM budget WHERE day=?').all(day) as {cost:string}[];
    const used=rows.reduce((sum,row)=>sum+BigInt(row.cost),0n);
    const cost=request.gas*(request.maxFeePerGas??request.gasPrice??0n);
    assert(used+cost<=parseEther(process.env.RELAYER_DAILY_GAS_BUDGET_WBT||'0.05'),'Sponsorship budget exhausted; try later',503);
    db.prepare('INSERT OR IGNORE INTO budget VALUES (?,?,?)').run(job,day,cost.toString());
   }
   return signer.signTransaction(request);
  });
  const submission=await queue.execute(job,t);
  db.prepare('INSERT OR IGNORE INTO receipts VALUES (?,?,?,?)').run(submission.hash,kind,id,'');receiptCache=undefined;
  // Local mining is immediate. Live requests return the hash without waiting on finality.
  if(r.mode==='local')await queue.execute(job,t);
  return submission.hash;
 }
 async function tick() {
  await client.getBlockNumber({cacheTime:0});
  if(r.mode==='whitechain'&&await client.getBalance({address:r.merchant.account.address})===0n)throw new Error('Merchant gas funding exhausted');
  await reconcile();
  const subscriptions=db.prepare('SELECT id FROM subscriptions').all() as {id:Hex}[];
  for(const {id} of subscriptions){
   try{
    const s=await inspectPolicy(client,r.contract,id);
    if(!s.policy){report(id,'registration_pending');continue;}
    if(!s.canCollect){report(id,s.status==='collectible'?'payment_needs_attention':s.status);continue;}
    if(s.policy.terms.spender.toLowerCase()!==r.merchant.account.address.toLowerCase())continue;
    const reference=paymentReference(r.chainId,r.contract,id,s.period);
    await send(`collect:${id}:${s.period}`,collectCall(r.contract,id,reference),'payment',id);
    report(id,'payment_submitted');
   }catch{report(id,'retry_required');}
  }
  lastTick=Date.now();workerError='';
 }
 async function policies(owner?:string){
  const rows=(owner?db.prepare('SELECT * FROM subscriptions WHERE owner=? ORDER BY created DESC').all(owner):db.prepare('SELECT * FROM subscriptions ORDER BY created DESC').all()) as {id:Hex;owner:Address}[];
  const block=await client.getBlock();
  const confirmedBlock=block.number>=BigInt(r.confirmations-1)?block.number-BigInt(r.confirmations-1):0n;
  const result=[];
  for(const row of rows){
   const s=await inspectPolicy(client,r.contract,row.id);
   let paidThrough=0n,paidPeriod:bigint|null=null;
   try{
    const confirmed=await client.readContract({address:r.contract,abi:ordinAbi,functionName:'getPolicy',args:[row.id],blockNumber:confirmedBlock});
    if(confirmed.lastPaidPeriodPlusOne>0n){paidPeriod=confirmed.lastPaidPeriodPlusOne-1n;paidThrough=confirmed.terms.start+confirmed.lastPaidPeriodPlusOne*confirmed.terms.interval;
     if(confirmed.terms.expiry&&paidThrough>confirmed.terms.expiry)paidThrough=confirmed.terms.expiry;}
   }catch{/* Not registered at the confirmation block yet. */}
   result.push({id:row.id,owner:row.owner,...s,paidThrough,paidPeriod,access:paidThrough>block.timestamp,worker:states.get(row.id)||'waiting',chainTime:block.timestamp});
  }
  return result;
 }
 const getSession=(req:IncomingMessage)=>{
  const bearer=req.headers.authorization?.replace(/^Bearer /,'');assert(bearer,'Connect your wallet first',401);
  const session=db.prepare('SELECT owner,expires FROM sessions WHERE digest=?').get(hash(bearer)) as any;
  assert(session&&session.expires>Date.now(),'Session expired. Reconnect your wallet.',401);return session.owner as Address;
 };
 const newSession=(owner:Address)=>{const value=token();db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(value),owner.toLowerCase(),Date.now()+3600_000);return {token:value,owner};};
 let receiptCache:{time:number;rows:any[]}|undefined;
 async function receiptList(){
  if(receiptCache&&Date.now()-receiptCache.time<2000)return receiptCache.rows;
  const head=await client.getBlockNumber({cacheTime:0});
  const rows=db.prepare('SELECT * FROM receipts ORDER BY rowid DESC LIMIT 20').all() as any[];
  const result=await Promise.all(rows.map(async row=>{
   try{const receipt=await client.getTransactionReceipt({hash:row.hash});const status=head<receipt.blockNumber+BigInt(r.confirmations-1)?'pending':receipt.status;
    return {...row,status,block:receipt.blockNumber,gasUsed:receipt.gasUsed,events:paymentEvents(r.contract,receipt.logs).map(e=>e.args)};
   }catch{return {...row,status:'pending',events:[]};}
  }));
  receiptCache={time:Date.now(),rows:result};return result;
 }
 async function body(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;assert(raw.length<=16_384,'Request too large',413);}try{return JSON.parse(raw||'{}');}catch{throw new HttpError(400,'Invalid JSON');}}
 const limits=new Map<string,{time:number;count:number}>();
 async function handle(req:IncomingMessage,res:ServerResponse){
  const json=(value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(stringify(value));};
  try{
   const host=req.headers.host??'';
   if(r.mode==='local'&&!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))throw new HttpError(403,'Use localhost for the local demo');
   const allowed=publicOrigin||process.env.FRAME_ORIGIN||`http://${host}`;
   const origin=req.headers.origin;
   if(origin&&origin!==allowed)throw new HttpError(403,'Origin not allowed');
   if(origin)res.setHeader('Access-Control-Allow-Origin',allowed);
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});res.end();return;}
   const path=new URL(req.url||'/','http://localhost').pathname;
   const method=req.method||'GET';
   if(path.startsWith('/api/')&&method!=='GET'){
    const ip=req.socket.remoteAddress||'unknown',now=Date.now();const limit=limits.get(ip);
    if(!limit||now-limit.time>60_000)limits.set(ip,{time:now,count:1});else {limit.count++;assert(limit.count<=90,'Too many requests; try again in a minute',429);}
   }
   if(path==='/api/config'){json({mode:r.mode,chainId:r.chainId,contract:r.contract,token:r.token,spender:r.merchant.account.address,treasury:r.treasury,interval:r.interval,amount:'1000000',cycles:3,explorer:r.mode==='whitechain'?'https://explorer.testnet.whitechain.io':'',localOwner:r.local?.accounts[0].address});return;}
   if(path==='/api/health'){json({ok:true,mode:r.mode});return;}
   if(path==='/api/ready'){const ready=lastTick>0&&!workerError&&Date.now()-lastTick<60000;json({ok:ready,lastTick,workerError,mode:r.mode,chainId:r.chainId,contract:r.contract},ready?200:503);return;}
   if(path==='/api/merchant'&&method==='GET'){
    const [list,receipts,balance]=await Promise.all([policies(),receiptList(),client.readContract({address:r.token,abi:erc20Abi,functionName:'balanceOf',args:[r.treasury]})]);
    json({policies:list,receipts,balance,attempts,lastTick,workerError});return;
   }
   if(path==='/api/auth/local'&&method==='POST'){assert(r.local,'Demo wallet is only available on the local chain',404);json(newSession(r.local.accounts[0].address));return;}
   if(path==='/api/auth/challenge'&&method==='POST'){
    const b=await body(req);assert(isAddress(b.owner),'Invalid wallet');const id=token();
    const message=`Frame wallet login\nOrigin: ${allowed}\nChain: ${r.chainId}\nWallet: ${b.owner}\nNonce: ${id}\nExpires: ${new Date(Date.now()+300_000).toISOString()}\nThis signature only signs you into Frame; it does not authorize payments.`;
    db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(id,b.owner.toLowerCase(),message,Date.now()+300_000);json({id,message});return;
   }
   if(path==='/api/auth/verify'&&method==='POST'){
    const b=await body(req);const c=db.prepare('SELECT * FROM challenges WHERE id=?').get(b.id) as any;assert(c&&c.expires>Date.now(),'Login challenge expired');
    assert(await verifyMessage({address:c.owner,message:c.message,signature:b.signature}),'Invalid login signature',401);
    assert(db.prepare('DELETE FROM challenges WHERE id=?').run(b.id).changes===1,'Challenge already used',401);json(newSession(c.owner));return;
   }
   if(path==='/api/me'&&method==='GET'){
    const owner=getSession(req);const [list,balance,allowance]=await Promise.all([policies(owner),client.readContract({address:r.token,abi:erc20Abi,functionName:'balanceOf',args:[owner]}),client.readContract({address:r.token,abi:erc20Abi,functionName:'allowance',args:[owner,r.contract]})]);
    json({owner,policies:list,balance,allowance,keys:db.prepare('SELECT prefix,created FROM keys WHERE owner=?').all(owner)});return;
   }
   if(path==='/api/approval'&&method==='POST'){
    const owner=getSession(req);const b=await body(req);const amount=b.reset?0n:3_000_000n;const call=approveTokenCall(r.token,r.contract,amount);
    if(r.local){assert(owner===r.local.accounts[0].address.toLowerCase(),'Not the demo wallet',403);const receipt=await exclusive(()=>r.local!.send(0,call));db.prepare('INSERT OR IGNORE INTO receipts VALUES (?,?,?,?)').run(receipt.transactionHash,'approval','',receipt.blockNumber.toString());json({hash:receipt.transactionHash});}
    else json({call});return;
   }
   if(path==='/api/checkout/prepare'&&method==='POST'){
    const owner=getSession(req);
    await exclusive(async()=>{
     const list=await policies(owner);assert(!list.some(p=>!['cancelled','expired'].includes(p.status)),'Cancel or finish your existing subscription first');
     assert(owner.toLowerCase()!==r.treasury.toLowerCase(),'Use a customer wallet different from the merchant treasury');
     const balance=await client.readContract({address:r.token,abi:erc20Abi,functionName:'balanceOf',args:[owner]});
     const allowance=await client.readContract({address:r.token,abi:erc20Abi,functionName:'allowance',args:[owner,r.contract]});
     assert(balance>=1_000_000n&&allowance>=3_000_000n,'Add test USDT and approve 3 USDT before subscribing');
     const start=(await client.getBlock()).timestamp,nonce=await readNonce(client,r.contract,owner),deadline=start+60n;
     const terms:PolicyTerms={token:r.token,spender:r.merchant.account.address,recipient:r.treasury,amount:1_000_000n,interval:r.interval,start,expiry:start+3n*r.interval};
     const id=token(),payload={owner,terms,nonce,deadline};db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?)').run(id,owner,'create',stringify(payload),Date.now()+60_000);
     json({id,typedData:createPolicyTypedData(r.contract,r.chainId,owner,terms,nonce,deadline)});
    });return;
   }
   if(path==='/api/checkout/submit'&&method==='POST'){
    const owner=getSession(req),b=await body(req);
    await exclusive(async()=>{
     const q=db.prepare("SELECT * FROM quotes WHERE id=? AND owner=? AND kind='create'").get(b.id,owner) as any;assert(q&&q.expires>Date.now(),'Checkout expired; prepare again');
     const p=JSON.parse(q.payload),terms=termsFrom(p.terms),nonce=BigInt(p.nonce),deadline=BigInt(p.deadline);
     const id=policyId(owner,nonce),typed=createPolicyTypedData(r.contract,r.chainId,owner,terms,nonce,deadline);
     const signature=r.local?await r.local.wallets[0].signTypedData(typed):b.signature;
     assert(await client.verifyTypedData({...typed,address:owner,signature}),'Invalid authorization');
     assert(await readNonce(client,r.contract,owner)===nonce,'Authorization nonce changed; prepare again');
     const call=registerSignedPolicyCall(r.contract,owner,terms,nonce,deadline,signature);
     await client.call({account:r.merchant.account.address,...call});
     db.prepare('INSERT OR IGNORE INTO subscriptions VALUES (?,?,?)').run(id,owner,Date.now());
     let tx:Hex;
     try{tx=await send(`create:${id}`,call,'registration',id);}catch(error){
      if(!queue.pending().some(job=>job.job===`create:${id}`))db.prepare('DELETE FROM subscriptions WHERE id=?').run(id);
      throw error;
     }
     db.prepare('DELETE FROM quotes WHERE id=?').run(b.id);
     await tick();json({id,hash:tx});
    });return;
   }
   if(path==='/api/cancel/prepare'&&method==='POST'){
    const owner=getSession(req),b=await body(req);const row=db.prepare('SELECT id FROM subscriptions WHERE id=? AND owner=?').get(b.policyId,owner);assert(row,'Subscription not found',404);
    const nonce=await readNonce(client,r.contract,owner),deadline=(await client.getBlock()).timestamp+60n,id=token();
    db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?)').run(id,owner,'cancel',stringify({policyId:b.policyId,nonce,deadline}),Date.now()+60_000);
    json({id,typedData:cancelPolicyTypedData(r.contract,r.chainId,owner,b.policyId,nonce,deadline)});return;
   }
   if(path==='/api/cancel/submit'&&method==='POST'){
    const owner=getSession(req),b=await body(req);await exclusive(async()=>{
     const q=db.prepare("SELECT * FROM quotes WHERE id=? AND owner=? AND kind='cancel'").get(b.id,owner) as any;assert(q&&q.expires>Date.now(),'Cancellation expired; prepare again');
     const p=JSON.parse(q.payload),nonce=BigInt(p.nonce),deadline=BigInt(p.deadline);
     const typed=cancelPolicyTypedData(r.contract,r.chainId,owner,p.policyId,nonce,deadline);
     const signature=r.local?await r.local.wallets[0].signTypedData(typed):b.signature;
     assert(await client.verifyTypedData({...typed,address:owner,signature}),'Invalid cancellation signature');
     const tx=await send(`cancel:${p.policyId}:${nonce}`,cancelSignedPolicyCall(r.contract,p.policyId,nonce,deadline,signature),'cancellation',p.policyId);
     db.prepare('DELETE FROM quotes WHERE id=?').run(b.id);json({hash:tx});
    });return;
   }
   if(path==='/api/local/control'&&method==='POST'){
    assert(r.local,'Local controls are disabled on Whitechain',404);getSession(req);const b=await body(req);
    await exclusive(async()=>{
     if(b.action==='advance'){
      const mine=await policies(r.local!.accounts[0].address.toLowerCase());const next=mine.find(p=>p.status==='paid'&&p.nextDueAt>0n);
      assert(next,'No upcoming renewal. Subscribe first or wait for payment.');await r.local!.time(next.nextDueAt);
     }else if(b.action==='fund'){const {artifact}=await import('../../scripts/local.ts');await r.local!.send(0,{to:r.token,data:encodeFunctionData({abi:artifact('TestToken').abi,functionName:'mint',args:[r.local!.accounts[0].address,10_000_000n]})});}
     else if(b.action==='empty'){
      const balance=await client.readContract({address:r.token,abi:erc20Abi,functionName:'balanceOf',args:[r.local!.accounts[0].address]});
      await r.local!.send(0,{to:r.token,data:encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[r.local!.accounts[3].address,balance]})});
     }else if(b.action==='check'){
      const list=await policies(r.local!.accounts[0].address.toLowerCase());assert(list[0],'Subscribe first');
      try{await client.simulateContract({address:r.contract,abi:ordinAbi,functionName:'collect',args:[list[0].id,toHex(0,{size:32})],account:r.merchant.account.address});json({ok:true,message:'Collection is currently eligible. No transaction sent.'});}
      catch{json({ok:true,message:'Collection rejected by the contract. No funds moved and no gas spent on this simulation.'});}return;
     }else if(b.action==='retry'){}else throw new HttpError(400,'Unknown action');
     await tick();json({ok:true});
    });return;
   }
   if(path==='/api/keys'&&method==='POST'){
    const owner=getSession(req);const value=`fr_${token()}`;db.prepare('DELETE FROM keys WHERE owner=?').run(owner);db.prepare('INSERT INTO keys VALUES (?,?,?,?)').run(hash(value),owner,value.slice(0,10),Date.now());json({key:value});return;
   }
   if(path==='/api/keys'&&method==='DELETE'){const owner=getSession(req);db.prepare('DELETE FROM keys WHERE owner=?').run(owner);json({ok:true});return;}
   if((path==='/api/render'||path==='/api/preview')&&method==='POST'){
    const b=await body(req);assert(typeof b.title==='string'&&b.title.length>0&&b.title.length<=60,'Title must be 1–60 characters');
    assert(/^[\x20-\x7E]+$/.test(b.title),'Use Latin letters, numbers and basic punctuation');
    assert(typeof b.subtitle==='string'&&b.subtitle.length<=40,'Subtitle must be at most 40 characters');
    assert(['cobalt','paper','midnight'].includes(b.template),'Unknown template');
    if(path==='/api/render'){
     const bearer=req.headers.authorization?.replace(/^Bearer /,'')||'';const key=db.prepare('SELECT owner FROM keys WHERE digest=?').get(hash(bearer)) as any;
     const owner=key?.owner||getSession(req);
     await exclusive(async()=>{
      const list=await policies(owner);const paid=list.find(p=>p.access&&p.paidPeriod!==null);assert(paid,'subscription_required: a confirmed payment is needed',402);
      const row=db.prepare('SELECT count FROM usage WHERE owner=? AND policy=? AND period=?').get(owner,paid.id,paid.paidPeriod!.toString()) as any;
      assert((row?.count||0)<100,'Render allowance used for this billing window',429);
      const png=renderCard(b.title,b.subtitle,b.template,true);
      db.prepare('INSERT INTO usage VALUES (?,?,?,1) ON CONFLICT(owner,policy,period) DO UPDATE SET count=count+1').run(owner,paid.id,paid.paidPeriod!.toString());
      res.writeHead(200,{'content-type':'image/png','cache-control':'no-store','content-disposition':'attachment; filename="frame.png"'});res.end(png);
     });
    }else {res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});res.end(renderCard(b.title,b.subtitle,'cobalt',false));}return;
   }
   const files:Record<string,[string,string]>={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/checkout.js':['checkout.js','text/javascript'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/social-preview.png':['social-preview.png','image/png'],'/site.webmanifest':['site.webmanifest','application/manifest+json'],'/robots.txt':['robots.txt','text/plain']};
   if(method==='GET'&&files[path]){const [file,type]=files[path];res.writeHead(200,{'content-type':type,'cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(readFileSync(new URL(`../../examples/frame/${file}`,import.meta.url)));return;}
   throw new HttpError(404,'Not found');
  }catch(error){json({error:error instanceof HttpError?error.message:'Request could not complete. Check worker status and retry; no success is assumed.'},error instanceof HttpError?error.status:503);}
 }
 const server=createServer((req,res)=>void handle(req,res));
 let timer:ReturnType<typeof setInterval>|undefined;
 return {server, async inject(path:string, options:{method?:string;body?:unknown;token?:string;origin?:string}={}) {
  const request=Readable.from(options.body===undefined?[]:[Buffer.from(stringify(options.body))]) as IncomingMessage;
  request.url=path;request.method=options.method||(options.body===undefined?'GET':'POST');
  request.headers={host:'localhost:3210',...(options.token?{authorization:`Bearer ${options.token}`} :{}),...(options.origin?{origin:options.origin}:{})};
  Object.defineProperty(request,'socket',{value:{remoteAddress:'127.0.0.1'}});
  let status=200;const headers:Record<string,string>={};let output:Buffer=Buffer.alloc(0);
  const response={setHeader(name:string,value:string){headers[name]=value;},writeHead(code:number,h:Record<string,string>){status=code;Object.assign(headers,h);},end(value:Buffer|string){output=Buffer.isBuffer(value)?value:Buffer.from(value||'');}} as unknown as ServerResponse;
  await handle(request,response);
  return {status,headers,body:output,json:()=>JSON.parse(output.toString())};
 },tick:()=>exclusive(tick),startWorker(){if(timer)return;let scheduled=false;const run=()=>{if(closing||scheduled)return;scheduled=true;void exclusive(async()=>{if(r.local)await r.local.connection.provider.request({method:'evm_mine',params:[]});await tick();}).catch(()=>{workerError='RPC, signer funding, or transaction temporarily unavailable';}).finally(()=>{scheduled=false;});};run();timer=setInterval(run,r.mode==='local'?2000:5000);},async close(){closing=true;if(timer)clearInterval(timer);await tail;await new Promise<void>(done=>server.listening?server.close(()=>done()):done());queue.close();db.close();await r.close();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(existsSync('.env'))process.loadEnvFile('.env');
  const config=serverConfiguration(process.argv.slice(2));
  const runtime=await createRuntime(config.mode);
  if(config.database!==':memory:')mkdirSync(dirname(config.database),{recursive:true});
  const app=await createMerchantApp(runtime,config.database,config.origin);
  await new Promise<void>((done,reject)=>{app.server.once('error',reject);app.server.listen(config.port,config.host,done);});
  app.startWorker();
  console.log(`Frame: ${config.origin||`http://localhost:${config.port}`} (${config.mode==='local'?'LOCAL EVM — mock USDT, ephemeral state':'WHITECHAIN SEPOLIA — official test USDT'})`);
  const shutdown=()=>{void app.close().then(()=>process.exit(0));};process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 }catch(error){
  // Viem/HTTP error strings may include sensitive RPC credentials. Do not print raw causes.
  console.error(error instanceof Error&&error.constructor===Error?error.message:'Frame could not start. Check Whitechain connectivity, deployment configuration and merchant WBT funding.');
  process.exitCode=1;
 }
}
