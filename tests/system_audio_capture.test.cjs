'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const {NativeSystemAudio}=require('../system_audio_capture.cjs');

function fakeSpawn(callbacks){
 const child=new EventEmitter();
 child.stdout=new EventEmitter();
 child.stderr=new EventEmitter();
 child.killed=false;
 child.kill=(signal)=>{
  assert.equal(signal,'SIGTERM');
  child.killed=true;
  child.emit('exit',0,signal);
 };
 return {
  child,
  spawn(_path,args,opts){
   callbacks.args=args;
   callbacks.options=opts;
   setImmediate(()=>child.emit('spawn'));
   return child;
  }
 };
}
test('16 kHz mono native PCM starts on actual samples, never launches a server request',async()=>{
 const received=[],log={};
 const stub=fakeSpawn(log);
 const native=new NativeSystemAudio({
  binary:__filename,
  spawnProcess:stub.spawn,
  onPCM:part=>received.push(Buffer.from(part,'base64'))
 });
 const started=native.start();
 assert.deepEqual(log.args,['--sample-rate','16000','--chunk-duration','0.2']);
 const env=log.options.env;
 assert.equal(env.CONTACT_SMTP_PASSWORD,undefined);
 stub.child.stdout.emit('data',Buffer.from([0,1,2,3,4,5]));
 const info=await started;
 assert.equal(info.format,'s16le');
 assert.equal(info.sampleRate,16000);
 assert.equal(received[0].length,6);
 native.stop();
 assert.equal(stub.child.killed,true);
});
test('odd stdout chunks never corrupt 16-bit sample boundaries',async()=>{
 const received=[],stub=fakeSpawn({});
 const engine=new NativeSystemAudio({
  binary:__filename,spawnProcess:stub.spawn,
  onPCM:part=>received.push(Buffer.from(part,'base64'))
 });
 const started=engine.start();
 stub.child.stdout.emit('data',Buffer.from([0x01]));
 stub.child.stdout.emit('data',Buffer.from([0x02,0x03]));
 stub.child.stdout.emit('data',Buffer.from([0x04]));
 await started;
 assert.deepEqual(Buffer.concat(received),Buffer.from([1,2,3,4]));
 engine.stop();
});
test('native process failure rejects and stops cleanly',async()=>{
 const stub=fakeSpawn({});
 const engine=new NativeSystemAudio({binary:__filename,spawnProcess:stub.spawn});
 const started=engine.start();
 stub.child.emit('error',Error('private path to helper'));
 await assert.rejects(started,/Нативный захват звука недоступен/);
 assert.equal(engine.proc,null);
});
test('no arbitrary external binary if bundled resource is missing',async()=>{
 const engine=new NativeSystemAudio({binary:'/no/such/native/binary'});
 assert.equal(engine.available(),false);
 await assert.rejects(engine.start(),/0\.6\.5/);
});
