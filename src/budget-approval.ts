import {randomBytes} from 'node:crypto';
import {assert,hash} from './core.js';
import {Budgets,MAX_ALLOWANCE,object} from './budget.js';
import {Notify,type CliResult} from './notify.js';
export const EXTEND_ACTION='extend-token-budget';
export interface Extension {
 id:string;session:string;budgetVersion:number;amount:number;paramsHash:string;created:number;expires:number;
 state:string;simulated:number;interaction:string|null;reason:string;appliedVersion:number|null;
}
export class BudgetApprovals {
 constructor(public budgets:Budgets,public notify:Notify){}
 get(id:string){const d=this.budgets.store.db.prepare('SELECT * FROM token_extensions WHERE id=?').get(id) as unknown as Extension|undefined;assert(d,'Budget extension not found',404);return d}
 digest(session:string,version:number,amount:number){return hash(JSON.stringify({action:EXTEND_ACTION,session,version,amount,unit:'tokens'}))}
 list(session:string){return this.budgets.store.db.prepare('SELECT * FROM token_extensions WHERE session=? ORDER BY created DESC,rowid DESC LIMIT 20').all(session) as unknown as Extension[]}
 expire(){this.budgets.store.db.prepare("UPDATE token_extensions SET state='expired',reason='Extension expired; no permission resumed' WHERE state='pending' AND expires<=?").run(this.budgets.clock())}
 create(session:string,input:unknown){
 object(input,['amount','budgetVersion','simulated']);assert(Number.isSafeInteger(input.amount)&&input.amount>0&&input.amount<=MAX_ALLOWANCE,'Extra amount must be 1–1,000,000,000 tokens');assert(typeof input.simulated==='boolean','Explicit simulated flag required');
 return this.budgets.transaction(()=>{const s=this.budgets.store.session(session);assert(s,'Session not found',404);assert(!!s.simulated===input.simulated,'Simulated and real budget extensions cannot be mixed',409);const b=this.budgets.row(session);assert(b,'Allocate a budget first',409);assert(b.version===input.budgetVersion,'Budget version changed',409);assert(b.allowance+input.amount<=MAX_ALLOWANCE,'Extended allowance exceeds maximum');assert(!b.periodEnd||this.budgets.clock()<b.periodEnd,'Daily period ended; an extension cannot renew it',409);this.expire();
 assert(!this.budgets.store.db.prepare("SELECT id FROM token_extensions WHERE session=? AND state='pending'").get(session),'An extension is already pending',409);
 if(!s.simulated){const recent=this.budgets.store.db.prepare('SELECT COUNT(*) AS n FROM token_extensions WHERE simulated=0 AND created>?').get(this.budgets.clock()-60000) as {n:number};assert(recent.n<3,'Phone extension requests limited to 3 per minute',429)}
 const id=randomBytes(32).toString('hex'),now=this.budgets.clock();this.budgets.store.db.prepare("INSERT INTO token_extensions(id,session,budgetVersion,amount,paramsHash,created,expires,state,simulated) VALUES(?,?,?,?,?,?,?,'pending',?)").run(id,session,b.version,input.amount,this.digest(session,b.version,input.amount),now,now+600000,Number(s.simulated));return this.get(id);
 });
 }
 finish(id:string,state:string,reason:string){this.budgets.store.db.prepare("UPDATE token_extensions SET state=?,reason=? WHERE id=? AND state='pending'").run(state,reason,id);return this.get(id)}
 cancel(id:string,session:string){const d=this.get(id);assert(d.session===session,'Wrong task for extension',409);return this.finish(id,'denied','Canceled locally; no token allowance changed. Remote prompt may remain until expiry.')}
 prompt(d:Extension){return `Add exactly ${d.amount} tokens to task fingerprint ${hash(d.session).slice(0,12)}? Action ${EXTEND_ACTION}; budget version ${d.budgetVersion}; SHA256 ${d.paramsHash}; nonce ${d.id}; expires ${new Date(d.expires).toISOString()}. This does not approve the timestamp action or stop an external agent.`}
 async request(id:string){const d=this.get(id);if(d.simulated||d.state!=='pending')return;
 try{if((await this.notify.check()).state!=='configured'){this.finish(id,'failed','Notify authentication unavailable; allowance unchanged');return}
 const result=await this.notify.create(this.prompt(d),d.id),i=result.body?.interaction;
 if(result.error||result.code!==0||!i||typeof i.id!=='string'||!/^int_[\w-]{1,160}$/.test(i.id)||i.kind!=='approval'||i.status!=='pending'||!((typeof result.body.accepted==='number'&&result.body.accepted>0)||(typeof result.body.queued==='number'&&result.body.queued>0))){this.finish(id,'failed','Invalid phone request or no accepted/queued device; allowance unchanged');return}
 if(this.budgets.store.db.prepare('SELECT id FROM decisions WHERE interaction=?').get(i.id)){this.finish(id,'failed','Timestamp action approval cannot be used for tokens');return}
 const bound=this.budgets.store.db.prepare("UPDATE token_extensions SET interaction=? WHERE id=? AND state='pending' AND expires>?").run(i.id,id,this.budgets.clock());if(!bound.changes)return;
 this.settle(id,d.session,d.budgetVersion,d.amount,d.paramsHash,await this.notify.wait(i.id,d.expires-this.budgets.clock()));
 }catch{this.finish(id,'failed','Phone service error; allowance unchanged')}
 }
 settle(id:string,session:string,version:number,amount:number,digest:string,result:CliResult){
 return this.budgets.transaction(()=>{this.expire();const d=this.get(id);if(d.state!=='pending')return d;
 if(d.simulated||d.session!==session||d.budgetVersion!==version||d.amount!==amount||d.paramsHash!==digest||digest!==this.digest(session,version,amount))return this.finish(id,'failed','Extension binding mismatch; allowance unchanged');
 const i=result.body?.interaction;
 if(result.error||result.code!==0||result.body?.timedOut===true){if(i?.id===d.interaction&&i.kind==='approval'&&i.status==='denied')return this.finish(id,'denied','Denied on phone; allowance unchanged');if(i?.id===d.interaction&&i.status==='expired')return this.finish(id,'expired','Phone request expired');return this.finish(id,'failed','Phone error, cancellation, or timeout; allowance unchanged')}
 if(!i||!d.interaction||i.id!==d.interaction||i.kind!=='approval'||result.body?.timedOut!==false)return this.finish(id,'failed','Malformed or wrong phone interaction; allowance unchanged');
 if(['denied','canceled','expired'].includes(i.status))return this.finish(id,i.status==='expired'?'expired':'denied','Phone did not approve the extension');
 const responded=typeof i.respondedAt==='string'?Date.parse(i.respondedAt):NaN;
 if(i.status!=='approved'||i.response!=='approve'||!Number.isFinite(responded)||responded<d.created||responded>=d.expires||responded>this.budgets.clock()+2000)return this.finish(id,'failed','No explicit timely token approval; allowance unchanged');
 return this.apply(d,false);
 });
 }
 private apply(d:Extension,simulation:boolean){
 const b=this.budgets.row(d.session);if(!b||b.version!==d.budgetVersion||d.paramsHash!==this.digest(d.session,d.budgetVersion,d.amount)||b.allowance+d.amount>MAX_ALLOWANCE||(b.periodEnd!==null&&this.budgets.clock()>=b.periodEnd))return this.finish(d.id,'failed','Budget changed or period ended; approval cannot be applied');
 assert(simulation===!!d.simulated,'Simulation cannot apply a real extension',409);if(simulation)assert(this.budgets.store.session(d.session)?.simulated,'Simulation cannot extend a live task',409);
 // The allowance increase and nonce consumption commit together. A crash cannot apply just one half.
 const update=this.budgets.store.db.prepare('UPDATE token_budgets SET allowance=allowance+?,version=version+1 WHERE session=? AND version=?').run(d.amount,d.session,d.budgetVersion);assert(update.changes===1,'Budget changed during extension',409);
 this.budgets.store.db.prepare("UPDATE token_extensions SET state='consumed',appliedVersion=?,reason=? WHERE id=? AND state='pending'").run(b.version+1,simulation?'SIMULATED extra tokens applied to sample only':'Matching phone approval applied exactly once; other strict accounting holds still apply',d.id);
 this.budgets.enqueueExhaustion(d.session);return this.get(d.id);
 }
 simulate(id:string,session:string,outcome:unknown){
 return this.budgets.transaction(()=>{this.expire();const d=this.get(id);assert(d.session===session&&d.simulated===1&&this.budgets.store.session(session)?.simulated,'Simulation cannot authorize a live budget',409);assert(d.state==='pending','Extension already terminal',409);assert(['approved','denied','expired'].includes(outcome as string),'Invalid simulated outcome');return outcome==='approved'?this.apply(d,true):this.finish(id,outcome as string,`SIMULATED ${outcome}; allowance unchanged`)});
 }
}
