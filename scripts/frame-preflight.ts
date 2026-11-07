import { existsSync } from 'node:fs';
import { formatEther, formatUnits, erc20Abi, isAddress } from 'viem';
import { createRuntime } from '../services/merchant/runtime.ts';
import { serverConfiguration, deploymentAddress } from '../services/merchant/config.ts';

if(existsSync('.env'))process.loadEnvFile('.env');
try {
 const missing=[];
 if(!deploymentAddress())missing.push('ORDIN_ADDRESS (or run yarn frame:deploy to create .ordin/sepolia.json)');
 if(!process.env.MERCHANT_PRIVATE_KEY)missing.push('MERCHANT_PRIVATE_KEY');
 if(!process.env.MERCHANT_TREASURY)missing.push('MERCHANT_TREASURY');
 if(missing.length)throw new Error(`Missing live configuration:\n- ${missing.join('\n- ')}\nSet these in the local .env or hosting secrets. Never paste private keys in chat.`);
 const config=serverConfiguration(['--whitechain']);
 const r=await createRuntime('whitechain');
 const [head,gas]=await Promise.all([r.client.getBlock(),r.client.getBalance({address:r.merchant.account.address})]);
 const report:Record<string,unknown>={network:'Whitechain Sepolia',chainId:r.chainId,block:head.number.toString(),contract:r.contract,contractExplorer:`https://explorer.testnet.whitechain.io/address/${r.contract}`,token:r.token,merchant:r.merchant.account.address,merchantWBT:formatEther(gas),treasury:r.treasury,database:config.database,publicOrigin:config.origin||'not hosted yet',billing:'1 USDT per 120 seconds, three windows maximum'};
 if(process.env.WALLET_ADDRESS&&isAddress(process.env.WALLET_ADDRESS)){
  const owner=process.env.WALLET_ADDRESS;
  const [wbt,usdt]=await Promise.all([r.client.getBalance({address:owner}),r.client.readContract({address:r.token,abi:erc20Abi,functionName:'balanceOf',args:[owner]})]);
  report.customer={address:owner,WBT:formatEther(wbt),USDT:formatUnits(usdt,6),differentFromTreasury:owner.toLowerCase()!==r.treasury.toLowerCase()};
 }
 console.log(JSON.stringify(report,null,2));
 console.log('Live chain configuration is reachable. This check does not claim source verification, successful payments or public hosting.');
 await r.close();
}catch(error){
 console.error(error instanceof Error&&error.constructor===Error?error.message:'Whitechain preflight failed. Check RPC reachability, the deployed contract, official USDT and merchant gas funding.');
 process.exitCode=1;
}
