import {execFile} from 'node:child_process';
import {Store} from './store.js';
import {redact,hash,type PulseEvent} from './core.js';
export interface CliResult {code:number;body:any;error?:'missing'|'timeout'|'credentials'|'service'|'malformed'}
export type Runner=(args:string[],timeout:number)=>Promise<CliResult>;
export function cliRunner(bin='notify',execute:typeof execFile=execFile):Runner{return (args,timeout)=>new Promise(resolve=>{
 execute(bin,args,{timeout,maxBuffer:64*1024,encoding:'utf8',shell:false},(error,stdout,stderr)=>{
 let body:any;try{body=JSON.parse(stdout)}catch{}
 const e=error as {code?:string|number;killed?:boolean}|null;
 const code=typeof e?.code==='number'?e.code:error?1:0;
 const reason=e?.code==='ENOENT'?'missing':e?.killed?'timeout':code===3||/No token configured/.test(stderr)?'credentials':error?'service':body===undefined?'malformed':undefined;
 resolve({code,body,error:reason});
 });
})}
export class Notify {
 health:{state:string;detail:string;checkedAt:string|null}={state:'unknown',detail:'Checking CLI',checkedAt:null};
 constructor(public run:Runner=cliRunner()){}
 async check(){const r=await this.run(['auth','status'],8000);this.health={state:r.error==='missing'?'unconfigured':r.error==='credentials'?'unconfigured':r.code===0&&r.body?.authenticated===true?'configured':'error',detail:r.error==='missing'?'Notify CLI not installed':r.error==='credentials'?'CLI installed; user sign-in required':r.code===0&&r.body?.authenticated===true?'Authenticated; phone round-trip unverified':'Authentication check failed or unexpected response',checkedAt:new Date().toISOString()};return this.health}
 async create(prompt:string,key:string,title='AgentPulse decision'){return this.run(['send','ask',prompt,'--approval','--title',title,'--idempotency-key',key,'--expires-in','10m'],20_000)}
 async wait(id:string,remaining:number){return this.run(['interaction','wait',id,'--timeout',`${Math.max(1,Math.floor(remaining/1000))}s`],Math.max(1000,remaining)+1000)}
 async send(body:string,key:string){return this.run(['send',redact(body),'--title','AgentPulse','--idempotency-key',key],20_000)}
}
export class Notifications {
 constructor(public store:Store,public notify:Notify,public defaultEnabled=false){}
 enabled(){return this.store.setting('notifications',String(this.defaultEnabled))==='true'}
 async event(e:PulseEvent,simulated=false,now=Date.now()){
 if(simulated||!['completed','failed','decision'].includes(e.type))return 'ignored';
 return this.deliver(`event-${hash(JSON.stringify([e.sessionId,e.eventId]))}`,e.sessionId,`Coding session: ${e.type==='decision'?'decision needed':e.type}. Open the local dashboard for recorded evidence.`,now);
 }
 async deliver(key:string,session:string,message:string,now=Date.now()){
 if(this.store.session(session)?.simulated)return 'ignored';
 if(!this.enabled())return 'disabled';
 this.store.db.exec('BEGIN IMMEDIATE');let state:string;
 try{
 if(this.store.db.prepare('SELECT key FROM notifications WHERE key=?').get(key)){this.store.db.exec('COMMIT');return 'duplicate'}
 const recent=this.store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE created>? AND state!='rate-limited'").get(now-60_000) as {n:number};
 state=recent.n>=3?'rate-limited':'reserved';this.store.db.prepare('INSERT INTO notifications VALUES(?,?,?,?)').run(key,session,now,state);this.store.db.exec('COMMIT');
 }catch(e){this.store.db.exec('ROLLBACK');throw e}
 if(state==='rate-limited')return state;
 if(this.notify.health.state!=='configured'){this.update(key,'unconfigured');return 'unconfigured'}
 try{const r=await this.notify.send(message,key);
 const accepted=!r.error&&r.code===0&&r.body&&((typeof r.body.accepted==='number'&&r.body.accepted>0)||(typeof r.body.queued==='number'&&r.body.queued>0));
 this.update(key,accepted?'accepted':'error');return accepted?'accepted':'error';
 }catch{this.update(key,'error');return 'error'}
 }
 async budgetAlerts(){
 if(!this.enabled())return;
 this.store.db.prepare("UPDATE token_alerts SET state='superseded' WHERE state='pending' AND NOT EXISTS (SELECT 1 FROM token_budgets b WHERE b.session=token_alerts.session AND b.version=token_alerts.version AND b.exhausted=1)").run();
 const rows=this.store.db.prepare("SELECT a.session,a.version FROM token_alerts a JOIN sessions s ON s.id=a.session JOIN token_budgets b ON b.session=a.session AND b.version=a.version WHERE a.state='pending' AND s.simulated=0 AND b.exhausted=1").all() as {session:string;version:number}[];
 for(const row of rows){const claimed=this.store.db.prepare("UPDATE token_alerts SET state='sending' WHERE session=? AND version=? AND state='pending'").run(row.session,row.version);if(!claimed.changes)continue;
 const state=await this.deliver(`budget-${hash(JSON.stringify([row.session,row.version]))}`,row.session,'Task token allowance exhausted in a recorded budget version. Check the local dashboard for current pause status and bounded extension options.');
 this.store.db.prepare('UPDATE token_alerts SET state=? WHERE session=? AND version=?').run(state,row.session,row.version);
 }
 }

 update(key:string,state:string){this.store.db.prepare('UPDATE notifications SET state=? WHERE key=?').run(state,key)}
}
