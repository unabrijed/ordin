import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, isAddress, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient, type Transport, type Chain, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { localFixture } from '../../scripts/local.ts';
import { deploymentAddress } from './config.ts';
import { whitechainSepolia, WHITECHAIN_USDT, ordinAbi } from '../../sdk/index.ts';

export type Runtime = {mode:'local'|'whitechain'; client:PublicClient; merchant:WalletClient<Transport,Chain,Account>; contract:Address;token:Address;treasury:Address;chainId:number;interval:bigint;confirmations:number;local:Awaited<ReturnType<typeof localFixture>>|undefined;close():Promise<void>};

export async function createRuntime(mode: 'local' | 'whitechain'):Promise<Runtime> {
 if(mode==='local') {
  const {localFixture,artifact}=await import('../../scripts/local.ts');
  const f=await localFixture();
  await f.send(0,{to:f.token,data:encodeFunctionData({abi:artifact('TestToken').abi,functionName:'mint',args:[f.accounts[0].address,10_000_000n]})});
  return {mode,client:f.client,merchant:f.wallets[1],contract:f.contract,token:f.token,
   treasury:f.accounts[2].address,chainId:31337,interval:30n,confirmations:1,local:f,
   close:()=>f.connection.close()};
 }
 const address=deploymentAddress();
 const key=process.env.MERCHANT_PRIVATE_KEY;
 const treasury=process.env.MERCHANT_TREASURY;
 if(!address || !isAddress(address) || address===zeroAddress || !key || !/^0x[\da-fA-F]{64}$/.test(key) || !treasury || !isAddress(treasury) || treasury===zeroAddress)
  throw new Error('Whitechain requires ORDIN_ADDRESS (or .ordin/sepolia.json), MERCHANT_PRIVATE_KEY and MERCHANT_TREASURY. Configure them in .env or hosting secrets. No local fallback is used.');
 const client=createPublicClient({chain:whitechainSepolia,transport:http(process.env.WHITECHAIN_RPC_URL||'https://rpc.testnet.whitechain.io',{timeout:10000,retryCount:1,batch:true})});
 if(await client.getChainId()!==1874)throw new Error('Only Whitechain Sepolia is supported');
 const contract=address as Address, token=WHITECHAIN_USDT;
 if(!await client.getCode({address:contract}))throw new Error('No Ordin contract at configured address');
 const domain=await client.readContract({address:contract,abi:ordinAbi,functionName:'eip712Domain'});
 if(domain[1]!=='Ordin'||domain[2]!=='1'||domain[3]!==1874n||domain[4].toLowerCase()!==contract.toLowerCase())throw new Error('Unexpected contract domain');
 if(await client.readContract({address:token,abi:erc20Abi,functionName:'decimals'})!==6)throw new Error('Unexpected USDT decimals');
 let account;try{account=privateKeyToAccount(key as Hex);}catch{throw new Error('MERCHANT_PRIVATE_KEY is not a valid signing key.');}
 if(await client.getBalance({address:account.address})===0n)throw new Error(`Merchant ${account.address} has no testnet WBT for sponsored transactions. Fund this address before starting Frame.`);
 const merchant=createWalletClient({account,chain:whitechainSepolia,transport:http(process.env.WHITECHAIN_RPC_URL||'https://rpc.testnet.whitechain.io',{timeout:10000,retryCount:1,batch:true})});
 return {mode,client,merchant,contract,token,treasury:treasury as Address,chainId:1874,interval:120n,confirmations:2,local:undefined,close:async()=>{}};
}
