import {execFile} from 'node:child_process';
import {Store} from './store.js';
import {redact,hash,type PulseEvent} from './core.js';
export interface CliResult {code:number;body:any;error?:'missing'|'timeout'|'credentials'|'service'|'malformed'}
export type Runner=(args:string[],timeout:number)=>Promise<CliResult>;
export function cliRunner(bin='notify',execute:typeof execFile=execFile):Runner{return (args,timeout)=>new Promise(resolve=>{
 execute(bin,args,{timeout,maxBuffer:64*1024,encoding:'utf8',shell:false},(error,stdout,stderr)=>{
 let body:any;try{body=JSON.parse(stdout)}catch{}
 const e=error as (NodeJS.ErrnoException&{killed?:boolean})|null;
 const code=typeof e?.code==='number'?e.code:error?1:0;
 const reason=e?.code==='ENOENT'?'missing':e?.killed?'timeout':code===3||/No token configured/.test(stderr)?'credentials':error?'service':body===undefined?'malformed':undefined;
 resolve({code,body,error:reason});
 });
})}
export class Notify {
 health:{state:string;detail:string;checkedAt:string|null}={state:'unknown',detail:'Checking CLI',checkedAt:null};
 constructor(public run:Runner=cliRunner()){}
 async check(){const r=await this.run(['auth','status'],8000);this.health={state:r.error==='missing'?'unconfigured':r.error==='credentials'?'unconfigured':r.code===0&&r.body?.authenticated===true?'configured':'error',detail:r.error==='missing'?'Notify CLI not installed':r.error==='credentials'?'CLI installed; user sign-in required':r.code===0&&r.body?.authenticated===true?'Authenticated; phone round-trip unverified':'Authentication check failed or unexpected response',checkedAt:new Date().toISOString()};return this.health}
 async create(prompt:string,key:string){return this.run(['send','ask',prompt,'--approval','--title','AgentPulse decision','--idempotency-key',key,'--expires-in','10m'],20_000)}
 async wait(id:string,remaining:number){return this.run(['interaction','wait',id,'--timeout',`${Math.max(1,Math.floor(remaining/1000))}s`],Math.max(1000,remaining)+1000)}
 async send(body:string,key:string){return this.run(['send',redact(body),'--title','AgentPulse','--idempotency-key',key],20_000)}
}
export class Notifications {
 constructor(public store:Store,public notify:Notify,public defaultEnabled=false){}
 enabled(){return this.store.setting('notifications',String(this.defaultEnabled))==='true'}
 async event(e:PulseEvent,simulated=false,now=Date.now()){
 if(simulated||!['completed','failed','decision'].includes(e.type))return 'ignored';
 if(!this.enabled())return 'disabled';
 const key=`event-${hash(JSON.stringify([e.sessionId,e.eventId]))}`;
 if(this.store.db.prepare('SELECT key FROM notifications WHERE key=?').get(key))return 'duplicate';
 // Admission, deduplication and reservation happen synchronously before any external call.
 const recent=this.store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE created>? AND state!='rate-limited'").get(now-60_000) as {n:number};
 const state=recent.n>=3?'rate-limited':'reserved';
 this.store.db.prepare('INSERT INTO notifications VALUES(?,?,?,?)').run(key,e.sessionId,now,state);
 if(state==='rate-limited')return state;
 if(this.notify.health.state!=='configured'){this.update(key,'unconfigured');return 'unconfigured'}
 // Free-form summaries, identifiers, commands and paths never leave in pushes.
 const r=await this.notify.send(`Coding session: ${e.type==='decision'?'decision needed':e.type}. Open the local dashboard for recorded evidence.`,key);
 const accepted=r.code===0&&r.body&&((typeof r.body.accepted==='number'&&r.body.accepted>0)||(typeof r.body.queued==='number'&&r.body.queued>0));
 this.update(key,accepted?'accepted':'error');return accepted?'accepted':'error';
 }
 update(key:string,state:string){this.store.db.prepare('UPDATE notifications SET state=? WHERE key=?').run(state,key)}
}
