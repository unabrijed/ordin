import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localFixture, artifact } from '../../scripts/local.ts';
import { whitechainSepolia, WHITECHAIN_USDT, ordinAbi } from '../../sdk/index.ts';

export async function createRuntime(mode: 'local' | 'whitechain') {
 if(mode==='local') {
  const f=await localFixture();
  await f.send(0,{to:f.token,data:encodeFunctionData({abi:artifact('TestToken').abi,functionName:'mint',args:[f.accounts[0].address,10_000_000n]})});
  return {mode,client:f.client,merchant:f.wallets[1],contract:f.contract,token:f.token,
   treasury:f.accounts[2].address,chainId:31337,interval:30n,confirmations:1,local:f,
   close:()=>f.connection.close()};
 }
 const address=process.env.ORDIN_ADDRESS;
 const key=process.env.MERCHANT_PRIVATE_KEY;
 const treasury=process.env.MERCHANT_TREASURY;
 if(!address || !/^0x[\da-fA-F]{40}$/.test(address) || !key || !/^0x[\da-fA-F]{64}$/.test(key) || !treasury || !/^0x[\da-fA-F]{40}$/.test(treasury))
  throw new Error('Whitechain mode needs ORDIN_ADDRESS, MERCHANT_PRIVATE_KEY and MERCHANT_TREASURY in .env');
 const client=createPublicClient({chain:whitechainSepolia,transport:http(process.env.WHITECHAIN_RPC_URL||'https://rpc.testnet.whitechain.io')});
 if(await client.getChainId()!==1874)throw new Error('Only Whitechain Sepolia is supported');
 const contract=address as Address, token=WHITECHAIN_USDT;
 if(!await client.getCode({address:contract}))throw new Error('No Ordin contract at configured address');
 const domain=await client.readContract({address:contract,abi:ordinAbi,functionName:'eip712Domain'});
 if(domain[1]!=='Ordin'||domain[2]!=='1'||domain[3]!==1874n||domain[4].toLowerCase()!==contract.toLowerCase())throw new Error('Unexpected contract domain');
 if(await client.readContract({address:token,abi:erc20Abi,functionName:'decimals'})!==6)throw new Error('Unexpected USDT decimals');
 const account=privateKeyToAccount(key as Hex);
 const merchant=createWalletClient({account,chain:whitechainSepolia,transport:http(process.env.WHITECHAIN_RPC_URL||'https://rpc.testnet.whitechain.io')});
 return {mode,client,merchant,contract,token,treasury:treasury as Address,chainId:1874,interval:120n,confirmations:2,local:undefined,close:async()=>{}};
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
