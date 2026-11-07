import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {makeApp} from '../src/server.js';
import {Model} from '../src/model.js';
import {Notify} from '../src/notify.js';
import {deterministic} from '../src/core.js';
import {setup,event} from './helpers.js';
function run(args:string[]){return new Promise<{status:number|null;stdout:string;stderr:string}>(resolve=>{const child=spawn(process.execPath,['scripts/status-line.mjs',...args],{cwd:process.cwd()});let stdout='',stderr='';child.stdout.on('data',d=>{stdout+=d});child.stderr.on('data',d=>{stderr+=d});child.on('close',status=>resolve({status,stdout,stderr}))})}
test('status line refuses every target except loopback and never speaks on this machine',async()=>{const bad=await run(['--base','http://example.com:5177','--session','session-one']);assert.notEqual(bad.status,0);assert.match(bad.stderr,/127\.0\.0\.1/);assert.equal(bad.stdout,'');const user=await run(['--base','http://alice:secret@127.0.0.1:5177','--session','session-one']);assert.notEqual(user.status,0);assert.equal(user.stdout,'')});
test('status line reads one recorded session and does not create a decision',async(t)=>{const c=setup();const app=makeApp({store:c.store,model:new Model({}),notify:new Notify(async()=>{throw new Error('status line must not call Notify')}),ingestToken:'test-token',webDir:join(process.cwd(),'dist/web'),outputDir:join(c.dir,'demo-output')});let running=false;try{
 c.store.ingest(event({summary:'Checks passed for the retry change'}));
 app.server.listen(0,'127.0.0.1');try{await once(app.server,'listening');running=true}catch(e){if((e as NodeJS.ErrnoException).code==='EPERM'){t.skip('Environment forbids loopback sockets');return}throw e}
 const port=(app.server.address() as {port:number}).port;const base=`http://127.0.0.1:${port}`;
 const listed=await run(['--base',base]);assert.equal(listed.status,0);assert.match(listed.stdout,/session-one\tTest task/);
 const spoken=await run(['--base',base,'--label','Test task','--speak']);assert.equal(spoken.status,0);assert.equal(spoken.stdout.trim(),deterministic(c.store.snapshot('session-one')));assert.match(spoken.stderr,/macOS/);assert.match(spoken.stdout,/Checks passed for the retry change/);
 assert.equal((c.store.db.prepare('SELECT COUNT(*) n FROM decisions').get() as {n:number}).n,0);
}finally{if(running)await new Promise<void>(r=>app.server.close(()=>r()));c.cleanup()}});
