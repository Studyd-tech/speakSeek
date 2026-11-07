import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {join} from 'node:path';
import {makeApp} from '../src/server.js';
import {Model} from '../src/model.js';
import {Notify} from '../src/notify.js';
import {setup,event} from './helpers.js';
test('actual loopback HTTP smoke and persistence across server restart',async(t)=>{const c=setup();const build=()=>makeApp({store:c.store,model:new Model({}),notify:new Notify(async()=>({code:3,body:null,error:'credentials'})),ingestToken:'test-token',webDir:join(process.cwd(),'dist/web'),outputDir:join(c.dir,'demo-output')});let app=build();let running=false;try{
 app.server.listen(0,'127.0.0.1');try{await once(app.server,'listening');running=true}catch(e){if((e as NodeJS.ErrnoException).code==='EPERM'){t.skip('Environment forbids loopback sockets (EPERM); HTTP transport unverified');return}throw e}
 let port=(app.server.address() as {port:number}).port;let base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'},body:JSON.stringify(event())})).status,201);
 await new Promise<void>(r=>app.server.close(()=>r()));running=false;app=build();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');running=true;port=(app.server.address() as {port:number}).port;base=`http://127.0.0.1:${port}`;assert.equal((await (await fetch(base+'/api/sessions/session-one')).json()).eventCount,1);
 }finally{if(running)await new Promise<void>(r=>app.server.close(()=>r()));c.cleanup()}});
