import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,lstatSync,mkdirSync,realpathSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Store} from './store.js';
import {Budgets,utc} from './budget.js';
import {Notify,type CliResult} from './notify.js';
import {assert,hash} from './core.js';

export const PHONE_DEMO_SCOPE='simulated-agent-real-phone-v1';
export const PHONE_DEMO_SESSION='agent-x-simulated-phone-demo';
export const PHONE_DEMO_AGENT='agent-x-simulation';
export const PHONE_DEMO_ACTION='extend-isolated-simulated-demo';
export const PHONE_DEMO_BEFORE=10_000,PHONE_DEMO_DELTA=10_000,PHONE_DEMO_TOTAL=20_000;
export interface DemoConsent {livePhone:boolean;ackSimulatedUsage:boolean;waitSeconds:number}
export interface DemoRow {
 singleton:number;scope:string;invocation:string;session:string;nonce:string;paramsHash:string;
 budgetVersion:number;beforeTotal:number;delta:number;resultTotal:number;created:number;expires:number;
 state:string;attempts:number;interaction:string|null;accepted:number;queued:number;reason:string;confirmedAt:number|null;
}
const SCHEMA=`CREATE TABLE IF NOT EXISTS phone_demo(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),scope TEXT NOT NULL,invocation TEXT NOT NULL,
 session TEXT NOT NULL,nonce TEXT UNIQUE NOT NULL,paramsHash TEXT NOT NULL,budgetVersion INTEGER NOT NULL,
 beforeTotal INTEGER NOT NULL,delta INTEGER NOT NULL,resultTotal INTEGER NOT NULL,created INTEGER NOT NULL,
 expires INTEGER NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,interaction TEXT UNIQUE,
 accepted INTEGER NOT NULL DEFAULT 0,queued INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',confirmedAt INTEGER
);`;
export function demoConsent(v:DemoConsent){
 assert(v?.livePhone===true&&v?.ackSimulatedUsage===true,'Every real-phone invocation requires --live-phone and --ack-simulated-usage',403);
 assert(Number.isInteger(v.waitSeconds)&&v.waitSeconds>=1&&v.waitSeconds<=600,'Wait must be 1–600 whole seconds');
}
export function demoInvocation(v:unknown):asserts v is string {assert(typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v),'Invocation must be a new 1–64 character local identifier')}
function canonical(d:DemoRow){return JSON.stringify({action:PHONE_DEMO_ACTION,scope:d.scope,invocation:d.invocation,session:d.session,agent:PHONE_DEMO_AGENT,version:d.budgetVersion,fromTotal:d.beforeTotal,delta:d.delta,resultTotal:d.resultTotal,unit:'tokens',usage:10000,usageSource:'simulation',nonce:d.nonce,created:d.created,expires:d.expires})}
function get(db:DatabaseSync){return db.prepare('SELECT * FROM phone_demo WHERE singleton=1').get() as unknown as DemoRow|undefined}
function safeStatus(db:DatabaseSync,d:DemoRow,now:number){
 const b=db.prepare('SELECT allowance,used,version,source,lastMeasured FROM token_budgets WHERE session=?').get(PHONE_DEMO_SESSION) as {allowance:number;used:number|null;version:number;source:string;lastMeasured:number|null}|undefined;
 return {demo:'SIMULATED USAGE / REAL PHONE TRANSPORT',state:d.state.toUpperCase(),requestAttempts:d.attempts,
 receipt:d.accepted>0?'ACCEPTED':d.queued>0?'QUEUED':d.attempts?'UNCONFIRMED':'NOT SENT',
 providerAccepted:d.accepted,providerQueued:d.queued,approvalConfirmed:d.state==='consumed',
 before:{allowed:PHONE_DEMO_BEFORE,simulatedUsage:10000},
 after:{allowed:b?.allowance??null,simulatedUsage:b?.used??null,simulatedRemaining:b?.used===null||!b?null:Math.max(0,b.allowance-b.used),budgetVersion:b?.version??null,source:b?.source??'missing',freshness:b?.lastMeasured===null||!b?'unknown':now-b.lastMeasured!>120000?'stale':'fresh'},
 localWindowExpired:now>=d.expires,expiresAt:new Date(d.expires).toISOString(),confirmedAt:d.confirmedAt===null?null:new Date(d.confirmedAt).toISOString(),reason:d.reason,
 scope:'Only this isolated simulated ledger can change. No provider allowance, real task, or timestamp action is authorized.',
 deviceVerification:'Phone arrival, AirPods announcement, Siri availability, and voice reply are owner-unconfirmed. Acceptance is not delivery or approval.'};
}
export class PhoneDemo {
 budgets:Budgets;
 constructor(public store:Store,public invocation:string,public notify:Notify,public clock=()=>Date.now()){
 demoInvocation(invocation);this.budgets=new Budgets(store,clock);
 }
 row(){const d=get(this.store.db);assert(d&&d.scope===PHONE_DEMO_SCOPE&&d.invocation===this.invocation,'Not a matching isolated phone-demo invocation',409);return d}
 private initialize(){
 this.store.db.exec(SCHEMA);
 const fresh=this.budgets.transaction(()=>{const existing=get(this.store.db);if(existing){this.row();return false}
 const count=this.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {n:number};assert(count.n===0,'Phone demo refuses an existing app/sample/live-task database',409);
 const now=this.clock();const d={scope:PHONE_DEMO_SCOPE,invocation:this.invocation,session:PHONE_DEMO_SESSION,nonce:randomBytes(32).toString('hex'),budgetVersion:1,beforeTotal:PHONE_DEMO_BEFORE,delta:PHONE_DEMO_DELTA,resultTotal:PHONE_DEMO_TOTAL,created:now,expires:now+600000} as DemoRow;
 this.store.db.prepare("INSERT INTO phone_demo(singleton,scope,invocation,session,nonce,paramsHash,budgetVersion,beforeTotal,delta,resultTotal,created,expires,state) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,'initializing')").run(d.scope,d.invocation,d.session,d.nonce,hash(canonical(d)),1,d.beforeTotal,d.delta,d.resultTotal,d.created,d.expires);return true});
 if(fresh){
 this.store.addSession(PHONE_DEMO_SESSION,PHONE_DEMO_AGENT,'SIMULATED Agent X — isolated real-phone demo',true);
 this.budgets.configure(PHONE_DEMO_SESSION,{mode:'absolute',tokens:PHONE_DEMO_BEFORE});
 this.budgets.checkpoint(PHONE_DEMO_SESSION,{agentId:PHONE_DEMO_AGENT,reportId:'simulated-exhaustion',sequence:0,measuredAt:new Date(this.clock()).toISOString(),source:'simulation',usage:{unit:'tokens',inputTokens:10000,outputTokens:0,totalTokens:10000}},true);
 this.store.ingest({agentId:PHONE_DEMO_AGENT,sessionId:PHONE_DEMO_SESSION,eventId:'simulated-exhaustion',type:'decision',sequence:1,timestamp:new Date(this.clock()).toISOString(),summary:'SIMULATED Agent X reached 10,000 of 10,000 tokens. No model was invoked and no real tokens were spent.'},this.clock(),true);
 this.store.db.prepare("UPDATE phone_demo SET state='prepared',reason='SIMULATED ledger exhausted; real phone request requires explicit opt-in' WHERE singleton=1 AND state='initializing'").run();
 }
 }
 private bindingValid(d:DemoRow){
 const count=this.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {n:number};const s=this.store.session(PHONE_DEMO_SESSION);const b=this.budgets.row(PHONE_DEMO_SESSION);
 return d.scope===PHONE_DEMO_SCOPE&&d.invocation===this.invocation&&d.session===PHONE_DEMO_SESSION&&d.budgetVersion===1&&d.beforeTotal===10000&&d.delta===10000&&d.resultTotal===20000&&/^[a-f0-9]{64}$/.test(d.nonce)&&d.expires-d.created===600000&&d.paramsHash===hash(canonical(d))&&count.n===1&&s?.simulated===1&&s.agent===PHONE_DEMO_AGENT&&b?.version===1&&b.allowance===10000&&b.used===10000&&b.source==='simulation'&&b.mode==='absolute'&&!b.blocked&&this.budgets.snapshot(PHONE_DEMO_SESSION).activeReservations===0;
 }
 status(){return safeStatus(this.store.db,this.row(),this.clock())}
 private finish(state:string,reason:string){this.store.db.prepare("UPDATE phone_demo SET state=?,reason=? WHERE singleton=1 AND state IN ('prepared','creating','pending')").run(state,reason);return this.status()}
 cancel(){return this.finish('canceled','Canceled locally; no approval may apply. A remote prompt may remain until its ten-minute expiry.')}
 prompt(d:DemoRow){return `SIMULATED USAGE: Agent X reached 10,000/10,000 tokens. No model ran. Approve adding exactly 10,000 simulated tokens: new TOTAL 20,000? Only this demo ledger changes. Task ${d.session}; version ${d.budgetVersion}; action ${PHONE_DEMO_ACTION}; nonce ${d.nonce}; SHA256 ${d.paramsHash}; expires ${new Date(d.expires).toISOString()}. A dictated amount or push acceptance is not approval.`}
 async run(consent:DemoConsent,progress:(status:ReturnType<PhoneDemo['status']>)=>void=()=>{}){
 demoConsent(consent);this.initialize();let d=this.row();
 if(!['prepared','pending'].includes(d.state))return this.status();
 if(this.clock()<d.created)return this.finish('failed','Local clock moved backward; no request or allowance change permitted');
 if(this.clock()>=d.expires)return this.finish('expired','Local approval window ended; no allowance change permitted');
 if(!this.bindingValid(d))return this.finish('failed','Demo isolation, budget, or fixed approval binding changed; no permission applied');
 const originalBinding=canonical(d),originalHash=d.paramsHash;const expected:DemoRow={...d};
 if(d.state==='prepared'){
 const claimed=this.budgets.transaction(()=>{const current=this.row();if(current.state!=='prepared')return false;return this.store.db.prepare("UPDATE phone_demo SET state='creating',reason='Creating at most one real request; an interrupted creation will never be resent automatically' WHERE singleton=1 AND state='prepared' AND attempts=0").run().changes===1});
 if(!claimed)return this.status();
 try{
 if((await this.notify.check()).state!=='configured')return this.finish('auth-error','Notify unavailable or not authenticated. No request sent; use a fresh invocation only after an owner-authorized retry.');
 const checked=this.row();if(!this.bindingValid(checked)||canonical(checked)!==originalBinding||checked.paramsHash!==originalHash)return this.finish('failed','Demo binding changed during authentication; no request sent');
 const attempted=this.store.db.prepare("UPDATE phone_demo SET attempts=1 WHERE singleton=1 AND state='creating' AND attempts=0 AND expires>?").run(this.clock());
 if(!attempted.changes)return this.finish('expired','Canceled or expired before request creation; no new send permitted');
 // This is the only creation call. There is no automatic retry, one-way exhaustion push, or model call.
 const r=await this.notify.create(this.prompt(d),d.nonce,'SpeakSeek · SIMULATED USAGE');const i=r.body?.interaction;
 const accepted=r.body?.accepted,queued=r.body?.queued??0;
 if(r.error||r.code!==0||!i||typeof i.id!=='string'||!/^int_[\w-]{1,160}$/.test(i.id)||i.kind!=='approval'||i.status!=='pending'||!Number.isSafeInteger(accepted)||accepted<0||!Number.isSafeInteger(queued)||queued<0||(accepted===0&&queued===0))return this.finish('failed','Notify creation failed, had no eligible accepted/queued delivery, or returned an unknown schema. Receipt/approval unconfirmed; no resend.');
 const bound=this.budgets.transaction(()=>{const current=this.row();if(current.state!=='creating')return false;
 if(!this.bindingValid(current)||canonical(current)!==originalBinding||current.paramsHash!==originalHash){this.finish('failed','Binding changed during request creation; received interaction cannot approve it');return false}
 return this.store.db.prepare("UPDATE phone_demo SET interaction=?,accepted=?,queued=?,state='pending',reason='Real request accepted/queued; phone arrival and approval are not established' WHERE singleton=1 AND state='creating'").run(i.id,accepted,queued).changes===1;});
 if(!bound)return this.status();expected.interaction=i.id;d=this.row();try{progress(this.status())}catch{/* Observers cannot grant permission or change accounting. */}
 }catch{return this.finish('failed','Notify creation errored; whether a request was accepted is unknown. No automatic resend or allowance change.')}
 }
 d=this.row();if(d.state!=='pending')return this.status();if(this.clock()>=d.expires)return this.finish('expired','Approval window ended after creation; late responses cannot apply');
 if(canonical(d)!==originalBinding||d.paramsHash!==originalHash||d.interaction!==expected.interaction)return this.finish('failed','Request authority changed before waiting; no receipt may be rebound');
 try{return this.settle(expected,await this.notify.wait(d.interaction!,Math.min(consent.waitSeconds*1000,d.expires-this.clock())))}catch{return this.finish('failed','Notify wait service error; approval unconfirmed and allowance unchanged')}
 }
 private settle(expected:DemoRow,r:CliResult){
 return this.budgets.transaction(()=>{const d=this.row();if(d.state!=='pending')return this.status();
 if(this.clock()>=d.expires)return this.finish('expired','Local expiry reached; late replies cannot change the ledger');
 if(!this.bindingValid(d)||d.nonce!==expected.nonce||d.paramsHash!==expected.paramsHash||d.interaction!==expected.interaction||canonical(d)!==canonical(expected))return this.finish('failed','Exact invocation/session/version/amount/total/nonce/hash binding mismatch');
 if(r.body?.timedOut===true||r.error==='timeout')return this.finish('timed-out','Wait timed out; late replies cannot apply. The phone prompt may remain visible until expiry.');
 const i=r.body?.interaction;
 if(!i||i.id!==d.interaction||i.kind!=='approval')return this.finish('failed','Malformed or wrong interaction/kind; no confirmed approval');
 if(i.status==='denied')return this.finish('denied','Phone reported denial; simulated allowance unchanged');
 if(i.status==='canceled')return this.finish('canceled','Phone reported cancellation; simulated allowance unchanged');
 if(i.status==='expired')return this.finish('expired','Phone reported expiry; simulated allowance unchanged');
 if(r.error||r.code!==0||r.body?.timedOut!==false)return this.finish('failed','Notify service/auth error or malformed wait envelope; no permission granted');
 if(i.status==='pending'){this.store.db.prepare("UPDATE phone_demo SET reason='Still pending; no approval confirmed. Explicit opt-in may resume waiting on this same interaction, without a new push.' WHERE singleton=1").run();return this.status()}
 let responded:number;try{responded=utc(i.respondedAt)}catch{return this.finish('failed','Missing or malformed approval timestamp')}
 if(i.status!=='approved'||i.response!=='approve'||responded<d.created||responded>=d.expires||responded>this.clock()+2000)return this.finish('failed','No exact explicit timely approval; transcripts and free-form yes are not permission');
 const applied=this.store.db.prepare('UPDATE token_budgets SET allowance=?,version=version+1,exhausted=0 WHERE session=? AND version=? AND allowance=? AND used=10000 AND source=\'simulation\'').run(d.resultTotal,d.session,d.budgetVersion,d.beforeTotal);
 assert(applied.changes===1,'Isolated demo budget changed before atomic approval consumption',409);
 this.store.db.prepare("UPDATE phone_demo SET state='consumed',confirmedAt=?,reason='REAL bound approval confirmed; SIMULATED allowance changed once from 10,000 to TOTAL 20,000. No real provider work was authorized.' WHERE singleton=1 AND state='pending'").run(responded);
 this.store.ingest({agentId:PHONE_DEMO_AGENT,sessionId:PHONE_DEMO_SESSION,eventId:'phone-approved-simulated-total',type:'progress',sequence:2,timestamp:new Date(this.clock()).toISOString(),summary:'REAL bound phone approval confirmed for SIMULATED USAGE: +10,000; new total 20,000. No model was invoked.'},this.clock(),true);
 return this.status();
 });
 }
}
// Paths are fixed beneath the checkout. No arbitrary database path or HTTP exposure is accepted by the CLI.
export function phoneDemoPath(root:string,invocation:string,create=false){
 demoInvocation(invocation);const base=resolve(root);assert(realpathSync(base)===base,'Demo checkout root must resolve directly');
 let path=base;for(const name of ['.local','phone-demo',invocation]){path=join(path,name);if(!existsSync(path)){assert(create,'Demo invocation not found; status does not create state',404);try{mkdirSync(path,{mode:0o700})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}}const info=lstatSync(path);assert(info.isDirectory()&&!info.isSymbolicLink(),'Demo paths must be real local directories')}
 const file=join(path,'ledger.sqlite');for(const suffix of ['','-wal','-shm'])if(existsSync(file+suffix))assert(lstatSync(file+suffix).isFile()&&!lstatSync(file+suffix).isSymbolicLink(),'Demo data must not use symlinks');return file;
}
export function openPhoneDemo(root:string,invocation:string,consent:DemoConsent,notify:Notify,clock=()=>Date.now()){
 demoConsent(consent);const file=phoneDemoPath(root,invocation,true);const store=new Store(file);chmodSync(file,0o600);return new PhoneDemo(store,invocation,notify,clock);
}
export function readPhoneDemo(root:string,invocation:string,now=Date.now()){
 const file=phoneDemoPath(root,invocation);assert(existsSync(file),'Demo invocation not found',404);const db=new DatabaseSync(file,{readOnly:true});
 try{const d=get(db);assert(d&&d.scope===PHONE_DEMO_SCOPE&&d.invocation===invocation&&d.session===PHONE_DEMO_SESSION,'Not a matching isolated demo',409);return safeStatus(db,d,now)}finally{db.close()}
}
