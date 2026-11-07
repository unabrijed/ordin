import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { deploymentAddress } from '../services/merchant/config.ts';

// Exact selectors prevent accidentally changing an unrelated linked Railway project.
if(existsSync('.env'))process.loadEnvFile('.env');
try{
 const {values}=parseArgs({options:{project:{type:'string'},service:{type:'string'},environment:{type:'string'}},strict:true});
 if(!values.project||!values.service||!values.environment)throw new Error('Usage: yarn frame:host-secrets --project PROJECT_ID --service SERVICE_ID --environment ENVIRONMENT_ID');
 const settings:Record<string,string|undefined>={ORDIN_ADDRESS:deploymentAddress(),MERCHANT_PRIVATE_KEY:process.env.MERCHANT_PRIVATE_KEY,MERCHANT_TREASURY:process.env.MERCHANT_TREASURY,WHITECHAIN_RPC_URL:process.env.WHITECHAIN_RPC_URL||'https://rpc.testnet.whitechain.io',RELAYER_DAILY_GAS_BUDGET_WBT:process.env.RELAYER_DAILY_GAS_BUDGET_WBT||'0.05'};
 const missing=Object.entries(settings).filter(([,v])=>!v).map(([k])=>k);
 if(missing.length)throw new Error(`Missing .env values: ${missing.join(', ')}`);
 for(const [name,value] of Object.entries(settings)){
  await new Promise<void>((done,reject)=>{
   const p=spawn('railway',['variable','set',name,'--stdin','--skip-deploys','--project',values.project!,'--service',values.service!,'--environment',values.environment!],{stdio:['pipe','ignore','ignore']});
   p.on('error',()=>reject(new Error(`Cannot run Railway CLI for ${name}`)));
   p.on('close',code=>code===0?done():reject(new Error(`Could not set ${name}. Check Railway authentication and project access. Secret output was suppressed.`)));
   p.stdin.on('error',()=>{});p.stdin.end(value);
  });
  console.log(`Configured ${name} (value hidden).`);
 }
 console.log('Hosting secrets configured. No deployment was triggered. Attach /data, generate a public domain, then railway up to the same exact project/service/environment.');
}catch(error){console.error(error instanceof Error?error.message:'Hosting configuration failed');process.exitCode=1;}
