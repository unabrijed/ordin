import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export function serverConfiguration(args: string[], env: NodeJS.ProcessEnv = process.env) {
  if(args.includes('--local')&&args.includes('--whitechain'))throw new Error('Choose either --local or --whitechain.');
  const mode=args.includes('--local')?'local' as const:'whitechain' as const;
  const hosted=Boolean(env.RAILWAY_ENVIRONMENT_ID||env.RAILWAY_PROJECT_ID||env.NODE_ENV==='production');
  if(mode==='local'&&hosted)throw new Error('Local demo mode is disabled in hosted deployments.');
  const port=Number(env.PORT||env.FRAME_PORT||3210);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT or FRAME_PORT must be between 1 and 65535.');
  const origin=env.FRAME_ORIGIN||(env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:undefined);
  if(origin){
    let url:URL;try{url=new URL(origin);}catch{throw new Error('FRAME_ORIGIN must be an absolute URL.');}
    if(url.origin!==origin||url.username||url.password||!['http:','https:'].includes(url.protocol))throw new Error('FRAME_ORIGIN must contain only the scheme and host, with no trailing slash or path.');
    if(hosted&&url.protocol!=='https:')throw new Error('The public Frame origin must use HTTPS.');
  }
  if(hosted&&!origin)throw new Error('Set FRAME_ORIGIN or generate the Railway public domain before starting Frame.');
  const mount=env.RAILWAY_VOLUME_MOUNT_PATH;
  if((env.RAILWAY_PROJECT_ID||env.RAILWAY_ENVIRONMENT_ID)&&!mount)throw new Error('Attach a persistent Railway volume before starting the billing service.');
  const database=mode==='local'?':memory:':env.FRAME_DATABASE||join(mount||'.ordin','frame.sqlite');
  if(mode==='whitechain'&&database===':memory:')throw new Error('Whitechain billing requires a persistent database.');
  if(mount&&env.FRAME_DATABASE&&!resolve(env.FRAME_DATABASE).startsWith(resolve(mount)+sep))throw new Error('FRAME_DATABASE must be located inside the attached Railway volume.');
  return {mode,port,origin,database,host:mode==='local'?'127.0.0.1':env.FRAME_HOST||(hosted?'0.0.0.0':'127.0.0.1')};
}

export function deploymentAddress(env:NodeJS.ProcessEnv=process.env,statePath='.ordin/sepolia.json') {
  if(env.ORDIN_ADDRESS)return env.ORDIN_ADDRESS;
  if(!existsSync(statePath))return undefined;
  const saved=JSON.parse(readFileSync(statePath,'utf8'));
  if(saved.chainId!==1874)throw new Error('Saved Ordin deployment is not on Whitechain Sepolia.');
  return saved.address as string;
}
