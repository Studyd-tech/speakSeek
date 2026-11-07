import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {makeApp} from '../src/server.js';
import {Model} from '../src/model.js';
import {Notify} from '../src/notify.js';
import {setup,event} from './helpers.js';
// Exercise the actual HTTP handler with real request streams, without needing a network socket.
function http(){const c=setup();const app=makeApp({store:c.store,model:new Model({}),notify:new Notify(async()=>({code:3,body:null,error:'credentials'})),ingestToken:'test-token',webDir:join(process.cwd(),'dist/web'),outputDir:join(c.dir,'demo-output')});
 async function request(path:string,method='GET',data?:unknown,headers:Record<string,string>={},raw?:string){
 const chunks=method==='POST'?[Buffer.from(raw??JSON.stringify(data))]:[];
 const req=Readable.from(chunks) as IncomingMessage;req.url=path;req.method=method;req.headers={host:'127.0.0.1:0',...(method==='POST'?{'content-type':'application/json'}:{}),...headers};
 const response={status:200,headers:{} as Record<string,unknown>,data:'',setHeader(k:string,v:unknown){this.headers[k.toLowerCase()]=v},writeHead(status:number,h:Record<string,unknown>){this.status=status;Object.assign(this.headers,h)},end(v:string|Buffer){this.data=String(v)}};
 await app.handle(req,response as unknown as ServerResponse);
 return {...response,json(){return JSON.parse(response.data)}};
 }
 return {...c,app,request,post:(path:string,data:unknown,headers:Record<string,string>={})=>request(path,'POST',data,headers),close(){c.cleanup()}}}
test('HTTP handler rejects absent/invalid auth, malformed JSON/schema, oversize, and replay changes',async()=>{const c=http();try{assert.equal((await c.post('/api/events',event())).status,401);assert.equal((await c.post('/api/events',event(),{authorization:'Bearer wrong'})).status,401);const h={authorization:'Bearer test-token'};assert.equal((await c.post('/api/events',{invalid:true},h)).status,400);assert.equal((await c.post('/api/events',event({summary:'x'.repeat(9000)}),h)).status,413);assert.equal((await c.request('/api/events','POST',null,h,'{oops')).status,400);assert.equal((await c.post('/api/events',event(),h)).status,201);assert.equal((await c.post('/api/events',event(),h)).status,200);assert.equal((await c.post('/api/events',event({summary:'changed'}),h)).status,409);assert.equal((await c.request('/api/health')).status,200);const ui=await c.request('/');assert.equal(ui.status,200);assert.match(ui.data,/SpeakSeek/);assert.equal((await c.request('/.env')).status,404)}finally{c.close()}});
test('browser mutations require CSRF session; cross origin/host blocked; typed question uses selected session',async()=>{const c=http();try{assert.equal((await c.post('/api/question',{sessionId:'session-one',question:'status'})).status,403);const init=await c.request('/api/bootstrap');const {csrf}=init.json();const cookie=String(init.headers['set-cookie']).split(';')[0]!;const h={cookie,'x-agentpulse-csrf':csrf};assert.equal((await c.post('/api/question',{sessionId:'missing',question:'status'},h)).status,404);const answer=await c.post('/api/question',{sessionId:'session-one',question:'How is it?'},h);assert.equal(answer.status,200);assert.match(answer.json().answer,/unknown/);assert.equal((await c.post('/api/decisions',{sessionId:'session-one',simulated:true,action:'rm'},h)).status,400);assert.equal((await c.post('/api/question',{sessionId:'session-one',question:'status'},{...h,origin:'https://evil.example'})).status,403);assert.equal((await c.request('/api/bootstrap','GET',undefined,{host:'evil.example'})).status,403);const d=await c.post('/api/decisions',{sessionId:'session-one',simulated:false},h);assert.equal(d.status,201);await Promise.all(c.app.inFlight);assert.equal(c.app.approvals.list('session-one')[0]!.state,'failed');assert.equal((await c.post('/api/notifications',{enabled:true},h)).status,200)}finally{c.close()}});
