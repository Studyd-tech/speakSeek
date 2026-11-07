import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {assert,hash} from './core.js';
import {Store} from './store.js';
import {Notify,type CliResult} from './notify.js';
export const ACTION='write-approved-timestamp';
export const PARAMS=JSON.stringify({operation:'create',directory:'demo-output',format:'ISO-8601 timestamp',version:1});
export const PARAMS_HASH=hash(PARAMS);
export interface Decision {id:string;session:string;action:string;paramsHash:string;created:number;expires:number;state:string;simulated:number;interaction:string|null;reason:string;executed:number}
export class Approvals {
 constructor(public store:Store,public notify:Notify,public outputDir:string,public clock=()=>Date.now()){}
 get(id:string){const d=this.store.db.prepare('SELECT * FROM decisions WHERE id=?').get(id) as unknown as Decision|undefined;assert(d,'Decision not found',404);return d}
 expire(){this.store.db.prepare("UPDATE decisions SET state='expired',reason='Approval window expired; operation blocked' WHERE state='pending' AND expires<=?").run(this.clock())}
 list(session:string){this.expire();return this.store.db.prepare('SELECT * FROM decisions WHERE session=? ORDER BY created DESC LIMIT 30').all(session) as unknown as Decision[]}
 create(session:string,simulated:boolean){this.expire();const s=this.store.session(session);assert(s,'Session not found',404);assert(simulated||!s.simulated,'Sample sessions only support SIMULATED decisions',409);
 assert(!this.store.db.prepare("SELECT id FROM decisions WHERE session=? AND simulated=? AND state='pending'").get(session,Number(simulated)),'A decision is already pending',409);
 if(!simulated){const recent=this.store.db.prepare('SELECT COUNT(*) n FROM decisions WHERE simulated=0 AND created>?').get(this.clock()-60_000) as {n:number};assert(recent.n<3,'Phone requests limited to 3 per minute',429)}
 const id=randomBytes(32).toString('hex');const now=this.clock();
 this.store.db.prepare('INSERT INTO decisions(id,session,action,paramsHash,created,expires,state,simulated) VALUES(?,?,?,?,?,?,?,?)').run(id,session,ACTION,PARAMS_HASH,now,now+600_000,'pending',Number(simulated));return this.get(id)
 }
 finish(id:string,state:string,reason:string){this.store.db.prepare("UPDATE decisions SET state=?,reason=? WHERE id=? AND state='pending'").run(state,reason,id);return this.get(id)}
 simulate(id:string,session:string,outcome:string){const d=this.get(id);assert(d.session===session,'Wrong session',409);assert(d.simulated===1,'Simulation cannot authorize a real decision',409);assert(d.state==='pending','Decision is already terminal',409);
 assert(['approved','denied','expired','failed'].includes(outcome),'Invalid simulated outcome');return this.finish(id,outcome,`SIMULATED ${outcome}. No operation executed.`)}
 cancel(id:string,session:string){const d=this.get(id);assert(d.session===session,'Wrong session',409);return this.finish(id,'denied','Canceled locally; operation blocked. A remote prompt may remain visible until expiry.')}
 prompt(d:Decision){return `Create one demo timestamp file? Session fingerprint ${hash(d.session).slice(0,12)}; action ${ACTION}; parameters SHA256 ${d.paramsHash}; request ${d.id}. Expires ${new Date(d.expires).toISOString()}. No other operation is permitted.`}
 async request(id:string){const d=this.get(id);if(d.simulated||d.state!=='pending')return;
 try{
 const health=await this.notify.check();if(health.state!=='configured'){this.finish(id,'failed',health.detail);return}
 const r=await this.notify.create(this.prompt(d),d.id); const i=r.body?.interaction;
 if(r.code!==0||r.error||!i||typeof i.id!=='string'||!/^int_[\w-]{1,160}$/.test(i.id)||i.kind!=='approval'||i.status!=='pending'||!((typeof r.body.accepted==='number'&&r.body.accepted>0)||(typeof r.body.queued==='number'&&r.body.queued>0))) {this.finish(id,'failed','Notify did not return a valid pending approval; operation blocked');return}
 // Bind the provider-created ID before waiting. No inbound callback or browser endpoint accepts approval.
 const attached=this.store.db.prepare("UPDATE decisions SET interaction=? WHERE id=? AND state='pending' AND expires>?").run(i.id,id,this.clock());if(!attached.changes)return;
 const response=await this.notify.wait(i.id,d.expires-this.clock());this.settle(id,d.session,ACTION,PARAMS_HASH,response);
 }catch{this.finish(id,'failed','Notify service error; operation blocked')}
 }
 settle(id:string,session:string,action:string,paramsHash:string,result:CliResult){
 this.expire();const d=this.get(id);
 if(d.state!=='pending')return d;
 if(d.simulated||d.session!==session||d.action!==action||d.paramsHash!==paramsHash||paramsHash!==PARAMS_HASH||action!==ACTION)return this.finish(id,'failed','Approval binding mismatch; operation blocked');
 const i=result.body?.interaction;
 if(result.error||result.body?.timedOut===true)return this.finish(id,'failed',result.error==='timeout'||result.body?.timedOut?'Notify wait timeout; late replies cannot authorize execution':'Notify error; operation blocked');
 if(!i||!d.interaction||i.id!==d.interaction||i.kind!=='approval')return this.finish(id,'failed','Malformed or mismatched phone response; operation blocked');
 if(i.status==='denied'||i.status==='canceled')return this.finish(id,'denied',i.status==='canceled'?'Phone request canceled':'Denied on phone');
 if(i.status==='expired')return this.finish(id,'expired','Phone request expired');
 const responded=Date.parse(i.respondedAt);
 if(result.code!==0||i.status!=='approved'||i.response!=='approve'||!Number.isFinite(responded)||responded<d.created||responded>=d.expires||responded>this.clock()+2000)return this.finish(id,'failed','No explicit timely verified approval; operation blocked');
 // Compare-and-swap is durable and atomic across connections/processes. Consumption precedes all filesystem I/O.
 const consumed=this.store.db.prepare("UPDATE decisions SET state='consumed',reason='Approval consumed; execution may be uncertain until confirmed' WHERE id=? AND state='pending' AND simulated=0 AND session=? AND action=? AND paramsHash=? AND expires>?").run(id,session,action,paramsHash,this.clock());
 if(!consumed.changes)return this.get(id);
 try{mkdirSync(this.outputDir,{recursive:true,mode:0o700});const dir=lstatSync(this.outputDir);assert(dir.isDirectory()&&!dir.isSymbolicLink(),'Demo output directory must be a real directory');writeFileSync(join(this.outputDir,`${d.id}.txt`),new Date(this.clock()).toISOString()+'\n',{flag:'wx',mode:0o600});this.store.db.prepare("UPDATE decisions SET executed=1,reason='Phone approved; timestamp written once' WHERE id=? AND state='consumed'").run(id)}catch{this.store.db.prepare("UPDATE decisions SET reason='Consumed; file write failed or is uncertain. Never retried.' WHERE id=?").run(id)}return this.get(id);
 }
}
