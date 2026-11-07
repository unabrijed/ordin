import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverConfiguration } from '../services/merchant/config.ts';

test('Frame defaults to Whitechain and requires explicit local mode',()=>{
 assert.equal(serverConfiguration([],{}).mode,'whitechain');
 assert.equal(serverConfiguration(['--local'],{}).mode,'local');
 assert.throws(()=>serverConfiguration(['--local'],{NODE_ENV:'production'}),/disabled/);
 assert.throws(()=>serverConfiguration(['--local','--whitechain'],{}),/either/);
 assert.throws(()=>serverConfiguration([],{FRAME_DATABASE:':memory:'}),/persistent/);
});
test('hosted Frame uses Railway port, HTTPS origin and persistent volume',()=>{
 const env={NODE_ENV:'production',RAILWAY_PROJECT_ID:'frame',RAILWAY_VOLUME_MOUNT_PATH:'/data',RAILWAY_PUBLIC_DOMAIN:'frame.example.com',PORT:'8090',FRAME_PORT:'3210'};
 const config=serverConfiguration([],env);
 assert.equal(config.mode,'whitechain');assert.equal(config.host,'0.0.0.0');assert.equal(config.port,8090);assert.equal(config.origin,'https://frame.example.com');assert.equal(config.database,'/data/frame.sqlite');
 assert.throws(()=>serverConfiguration([],{...env,RAILWAY_VOLUME_MOUNT_PATH:undefined}),/persistent Railway volume/);
 assert.throws(()=>serverConfiguration([],{...env,FRAME_DATABASE:'/tmp/frame.sqlite'}),/inside/);
 assert.throws(()=>serverConfiguration([],{...env,FRAME_DATABASE:'/data/../tmp/frame.sqlite'}),/inside/);
 assert.throws(()=>serverConfiguration([],{...env,FRAME_ORIGIN:'http://frame.example.com'}),/HTTPS/);
 assert.throws(()=>serverConfiguration([],{...env,RAILWAY_PUBLIC_DOMAIN:undefined}),/public domain/);
 assert.throws(()=>serverConfiguration([],{PORT:'NaN'}),/PORT/);
});
