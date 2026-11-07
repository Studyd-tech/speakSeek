import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {Store} from './store.js';
import {Model} from './model.js';
import {Notify,Notifications} from './notify.js';
import {Approvals} from './approval.js';
import {AppError,assert,equal,identifier} from './core.js';
export interface ServerOptions {store:Store;model:Model;notify:Notify;ingestToken:string;webDir:string;outputDir:string;notifications?:boolean}
export function makeApp(o:ServerOptions){
 const csrf=randomBytes(32).toString('hex'),browserSession=randomBytes(32).toString('hex');
 const approvals=new Approvals(o.store,o.notify,o.outputDir),notifications=new Notifications(o.store,o.notify,o.notifications);
 const inFlight=new Set<Promise<unknown>>();let activeQuestions=0;
 const background=(p:Promise<unknown>)=>{inFlight.add(p);void p.catch(()=>{}).finally(()=>inFlight.delete(p))};
 function json(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
 async function body(req:IncomingMessage){
 assert(req.headers['content-type']?.split(';')[0]==='application/json','Content-Type must be application/json',415);
 assert(Number(req.headers['content-length']??0)<=8192,'Payload exceeds 8 KiB',413);
 return new Promise<Record<string,any>>((resolve,reject)=>{
 let size=0,done=false;const chunks:Buffer[]=[];
 req.on('data',(chunk:Buffer)=>{if(done)return;size+=chunk.length;if(size>8192){done=true;reject(new AppError(413,'Payload exceeds 8 KiB'));return}chunks.push(chunk)});
 req.on('end',()=>{if(done)return;done=true;try{resolve(JSON.parse(Buffer.concat(chunks).toString()))}catch{reject(new AppError(400,'Malformed JSON'))}});
 req.on('error',()=>{if(!done){done=true;reject(new AppError(400,'Request body interrupted'))}});
 });
 }

 function browser(req:IncomingMessage){assert(req.headers.cookie?.split(';').some(c=>c.trim()===`ap_session=${browserSession}`)&&typeof req.headers['x-agentpulse-csrf']==='string'&&equal(req.headers['x-agentpulse-csrf'],csrf),'Browser authorization required',403)}
 const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
 const address=server.address();const port=typeof address==='object'&&address?address.port:0;const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
 assert(hosts.includes(req.headers.host??''),'Invalid local Host',403);
 if(req.headers.origin)assert(hosts.some(h=>req.headers.origin===`http://${h}`),'Cross-origin request blocked',403);
 assert(req.headers['sec-fetch-site']!=='cross-site','Cross-site request blocked',403);
 const url=new URL(req.url??'/','http://127.0.0.1');const route=url.pathname;
 if(req.method==='GET'){
 if(route==='/api/health')return json(res,200,{ok:true,storage:'sqlite',belweave:{state:o.model.lastStatus,lastCheckedAt:o.model.lastCheckedAt,model:o.model.config.model??'Belweave/Kai-4',detail:o.model.lastFailure??(o.model.config.key?'Server-side key configured; last request result shown':'Server-side key missing')},notify:o.notify.health,notifications:{enabled:notifications.enabled(),lastAttempt:o.store.db.prepare('SELECT state,created FROM notifications ORDER BY created DESC LIMIT 1').get()??null,detail:'Samples never send. Accepted pushes do not prove delivery.'},telemetry:{state:o.store.sessions().some(s=>!s.simulated&&s.eventCount>0)?'configured':'unconfigured',detail:'Authenticated intake ready. Cursor hook runtime unverified; no automatic Codex or T3 telemetry.'}});
 if(route==='/api/bootstrap'){res.setHeader('Set-Cookie',`ap_session=${browserSession}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{csrf})}
 if(route==='/api/sessions')return json(res,200,o.store.sessions());
 const m=route.match(/^\/api\/sessions\/([\w-]+)$/);if(m)return json(res,200,{...o.store.snapshot(m[1]!),decisions:approvals.list(m[1]!)});
 const files:Record<string,[string,string]>={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
 const f=files[route];if(f){const bytes=readFileSync(join(o.webDir,f[0]));res.writeHead(200,{'Content-Type':`${f[1]}; charset=utf-8`});res.end(bytes);return}
 throw new AppError(404,'Not found');
 }
 assert(req.method==='POST','Method not supported',405);
 if(route==='/api/events'){
 const auth=req.headers.authorization;assert(typeof auth==='string'&&equal(auth,`Bearer ${o.ingestToken}`),'Invalid ingest authentication',401);
 const result=o.store.ingest(await body(req));if(!result.duplicate&&result.latest)background(notifications.event(result.event));return json(res,result.duplicate?200:201,{accepted:true,duplicate:result.duplicate,latest:result.latest});
 }
 browser(req);const b=await body(req);assert(b&&typeof b==='object'&&!Array.isArray(b),'Expected JSON object');
 if(route==='/api/question'){
 assert(identifier(b.sessionId)&&typeof b.question==='string'&&b.question.trim().length>0&&b.question.length<=500,'Session and question (1–500 chars) required');assert(b.modelEnabled===undefined||typeof b.modelEnabled==='boolean','Invalid model option');assert(activeQuestions<2,'Too many active questions',429);
 const snapshot=o.store.snapshot(b.sessionId);activeQuestions++;try{return json(res,200,await o.model.answer(snapshot,b.question,b.modelEnabled!==false))}finally{activeQuestions--}
 }
 if(route==='/api/decisions'){
 assert(identifier(b.sessionId)&&typeof b.simulated==='boolean','Session and simulated flag required');assert(Object.keys(b).every(k=>['sessionId','simulated'].includes(k)),'Action parameters cannot be supplied');
 const d=approvals.create(b.sessionId,b.simulated);if(!d.simulated)background(approvals.request(d.id));return json(res,201,d);
 }
 const decision=route.match(/^\/api\/decisions\/([a-f0-9]{64})\/(simulate|cancel)$/);
 if(decision){assert(identifier(b.sessionId),'Session required');return json(res,200,decision[2]==='simulate'?approvals.simulate(decision[1]!,b.sessionId,b.outcome):approvals.cancel(decision[1]!,b.sessionId))}
 if(route==='/api/notify/check')return json(res,200,await o.notify.check());
 if(route==='/api/notifications'){assert(typeof b.enabled==='boolean','Enabled flag required');o.store.setSetting('notifications',String(b.enabled));return json(res,200,{enabled:notifications.enabled()})}
 throw new AppError(404,'Not found');
 }catch(e){const status=e instanceof AppError?e.status:500;json(res,status,{error:e instanceof AppError?e.message:'Internal operation failed; no approval granted'})}
 });
 server.requestTimeout=25_000;server.headersTimeout=10_000;
 return {server,approvals,notifications,inFlight,handle:server.listeners('request')[0]! as (req:IncomingMessage,res:ServerResponse)=>Promise<void>};
}
