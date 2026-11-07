import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createPublicClient, http, type Hex } from 'viem';
import { runChain } from './chain.ts';
import { deploymentAddress } from '../services/merchant/config.ts';
import { whitechainSepolia } from '../sdk/index.ts';

if(existsSync('.env'))process.loadEnvFile('.env');
try{
 const existing=deploymentAddress();
 if(existing){console.log(`Using existing deployment: ${existing}\nRun yarn frame:check to verify live configuration. No deployment sent.`);}
 else{
  const key=process.env.DEPLOYER_PRIVATE_KEY||process.env.PRIVATE_KEY||process.env.MERCHANT_PRIVATE_KEY;
  if(!key||!/^0x[\da-fA-F]{64}$/.test(key))throw new Error('Set a funded DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) in .env before deploying the shared Ordin contract. Keep the key local; do not send it in chat.');
  mkdirSync('.ordin',{recursive:true});
  const pendingPath='.ordin/frame-deployment-pending.json';
  const statePath='.ordin/sepolia.json';
  if(existsSync(pendingPath)){
   const pending=JSON.parse(readFileSync(pendingPath,'utf8'));
   const client=createPublicClient({chain:whitechainSepolia,transport:http(process.env.WHITECHAIN_RPC_URL||whitechainSepolia.rpcUrls.default.http[0],{timeout:10000,retryCount:0})});
   if(await client.getChainId()!==1874)throw new Error('Wrong chain; refusing to reconcile the deployment.');
   let receipt;try{receipt=await client.getTransactionReceipt({hash:pending.transactionHash as Hex});}catch{throw new Error(`Previous deployment is unresolved: https://explorer.testnet.whitechain.io/tx/${pending.transactionHash}. No new deployment sent.`);}
   if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Previous deployment reverted. Review its receipt before deliberately clearing the pending record.');
   writeFileSync(statePath,JSON.stringify({chainId:1874,address:receipt.contractAddress,deploymentBlock:receipt.blockNumber.toString(),transactionHash:receipt.transactionHash,compiler:pending.compiler},null,2)+'\n');
   unlinkSync(pendingPath);console.log(`Recovered deployment: https://explorer.testnet.whitechain.io/address/${receipt.contractAddress}`);
  }else{
   const artifact=JSON.parse(readFileSync('artifacts/Ordin.json','utf8'));
   writeFileSync('.ordin/compiler-input.json',readFileSync('artifacts/compiler-input.json'));
   await runChain(['deploy','--send'],{env:{...process.env,PRIVATE_KEY:key},log(message){
    const match=/^Transaction: .*\/tx\/(0x[\da-fA-F]{64})$/.exec(message);
    if(match)writeFileSync(pendingPath,JSON.stringify({chainId:1874,transactionHash:match[1],compiler:artifact.compiler},null,2)+'\n');
    console.log(message);
   }});
   if(existsSync(statePath)&&existsSync(pendingPath))unlinkSync(pendingPath);
  }
  console.log('Shared Ordin deployment saved. Verify its source using .ordin/compiler-input.json. Every merchant integration can use this same contract address.');
 }
}catch(error){
 console.error(error instanceof Error&&error.constructor===Error?error.message:'Deployment did not complete. Check network connectivity and WBT funding. Any known submitted hash is saved under .ordin; do not assume failure means no transaction was sent.');
 process.exitCode=1;
}
