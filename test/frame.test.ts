import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../services/merchant/runtime.ts';
import { createMerchantApp } from '../services/merchant/server.ts';

test('Frame HTTP lifecycle: gated PNG, real approval/signature, automatic renewal, cancellation and keys', async t=>{
 const runtime=await createRuntime('local');
 const app=await createMerchantApp(runtime);t.after(()=>app.close());
 const config=(await app.inject('/api/config')).json();assert.equal(config.mode,'local');
 assert.equal((await app.inject('/api/ready')).status,503);await app.tick();assert.equal((await app.inject('/api/ready')).status,200);
 assert.equal((await app.inject('/')).status,200);
 assert.equal((await app.inject('/api/auth/local',{body:{},origin:'https://evil.invalid'})).status,403);
 const session=(await app.inject('/api/auth/local',{body:{}})).json();const token=session.token;
 const call=(path:string,body?:unknown,method?:string)=>app.inject(path,{token,body,method});
 const input={title:'Ship something great',subtitle:'Made with Frame',template:'midnight'};
 assert.equal((await call('/api/render',input)).status,402);
 const preview=await call('/api/preview',input);assert.equal(preview.status,200);assert.equal(preview.body.readUInt32BE(16),600);
 assert.equal((await call('/api/checkout/prepare',{})).status,400);
 assert.equal((await call('/api/approval',{})).status,200);
 const quote=(await call('/api/checkout/prepare',{})).json();assert.ok(quote.id);
 const subscription=await call('/api/checkout/submit',{id:quote.id});assert.equal(subscription.status,200,subscription.body.toString());
 const id=subscription.json().id;
 const me=(await call('/api/me')).json();assert.equal(me.balance,'9000000');assert.equal(me.policies[0].access,true);
 assert.equal((await call('/api/checkout/submit',{id:quote.id})).status,400);
 const png=await call('/api/render',input);assert.equal(png.status,200);assert.equal(png.body.readUInt32BE(16),1200);assert.equal(png.body.readUInt32BE(20),630);
 const key=(await call('/api/keys',{})).json().key;
 assert.equal((await app.inject('/api/render',{token:key,body:input})).status,200);
 const check=(await call('/api/local/control',{action:'check'})).json();assert.match(check.message,/rejected/);
 assert.equal((await call('/api/local/control',{action:'advance'})).status,200);
 const renewed=(await call('/api/me')).json();assert.equal(renewed.balance,'8000000');assert.equal(renewed.policies[0].paidPeriod,'1');
 const cancel=(await call('/api/cancel/prepare',{policyId:id})).json();
 assert.equal((await call('/api/cancel/submit',{id:cancel.id})).status,200);
 const cancelled=(await call('/api/me')).json();assert.equal(cancelled.policies[0].status,'cancelled');assert.equal(cancelled.policies[0].access,true);
 await runtime.local!.time(BigInt(cancelled.policies[0].paidThrough));await app.tick();
 assert.equal((await call('/api/render',input)).status,402);
 const merchant=(await call('/api/merchant')).json();assert.equal(merchant.balance,'2000000');assert.equal(merchant.receipts.filter((r:any)=>r.kind==='payment').length,2);
 assert.equal((await call('/api/keys',undefined,'DELETE')).status,200);
 assert.equal((await app.inject('/api/render',{token:key,body:input})).status,401);
});

test('Frame retries a missed payment after replenishment without charging arrears',async t=>{
 const runtime=await createRuntime('local');const app=await createMerchantApp(runtime);t.after(()=>app.close());
 const token=(await app.inject('/api/auth/local',{body:{}})).json().token;
 const call=(path:string,body?:unknown)=>app.inject(path,{token,body});
 await call('/api/approval',{});const q=(await call('/api/checkout/prepare',{})).json();await call('/api/checkout/submit',{id:q.id});
 await call('/api/local/control',{action:'empty'});await call('/api/local/control',{action:'advance'});
 let me=(await call('/api/me')).json();assert.equal(me.policies[0].worker,'payment_needs_attention');assert.equal(me.policies[0].access,false);
 await call('/api/local/control',{action:'fund'});me=(await call('/api/me')).json();assert.equal(me.policies[0].access,true);assert.equal(me.balance,'9000000');
});

test('external-wallet path verifies signatures, blocks replay and waits for L2 confirmations',async t=>{
 const local=await createRuntime('local');
 // Exercise the external-wallet branches with the local EVM as the transport.
 const runtime={...local,mode:'whitechain' as const,local:undefined,confirmations:2};
 const app=await createMerchantApp(runtime);t.after(()=>app.close());
 assert.equal((await app.inject('/api/auth/local',{body:{}})).status,404);
 const owner=local.local!.accounts[0].address;
 const challenge=(await app.inject('/api/auth/challenge',{body:{owner}})).json();
 const signature=await local.local!.wallets[0].signMessage({message:challenge.message});
 const auth=await app.inject('/api/auth/verify',{body:{id:challenge.id,signature}});assert.equal(auth.status,200);
 assert.equal((await app.inject('/api/auth/verify',{body:{id:challenge.id,signature}})).status,400);
 const token=auth.json().token;const call=(path:string,body?:unknown)=>app.inject(path,{token,body});
 assert.equal((await call('/api/local/control',{action:'fund'})).status,404);
 const approval=(await call('/api/approval',{})).json();await local.local!.send(0,approval.call);
 const q=(await call('/api/checkout/prepare',{})).json();
 const typed=q.typedData;
 const signed=await local.local!.wallets[0].signTypedData(typed);
 const forged=await call('/api/checkout/submit',{id:q.id,signature:'0x'+'00'.repeat(65)});assert.notEqual(forged.status,200);
 const result=await call('/api/checkout/submit',{id:q.id,signature:signed});assert.equal(result.status,200,result.body.toString());
 assert.equal((await call('/api/me')).json().policies[0].access,false);
 await local.local!.connection.provider.request({method:'evm_mine',params:[]});await app.tick();
 assert.equal((await call('/api/me')).json().policies[0].access,false);
 await local.local!.connection.provider.request({method:'evm_mine',params:[]});await app.tick();
 assert.equal((await call('/api/me')).json().policies[0].access,true);
});
