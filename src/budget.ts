import {randomBytes} from 'node:crypto';
import {assert, hash, identifier} from './core.js';
import type {Store} from './store.js';

export const MAX_ALLOWANCE = 1_000_000_000;
export const MAX_MEASURED = 1_000_000_000_000;
export const BUDGET_FRESH_MS = 120_000;
export const RESERVATION_LEASE_MS = 600_000;
export const BUDGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS token_budgets(
 session TEXT PRIMARY KEY REFERENCES sessions(id), version INTEGER NOT NULL, allowance INTEGER NOT NULL,
 mode TEXT NOT NULL, percentageBps INTEGER, dailyTokens INTEGER, periodStart INTEGER, periodEnd INTEGER,
 used INTEGER, lastMeasured INTEGER, lastReceived INTEGER, source TEXT, checkpointSeq INTEGER NOT NULL DEFAULT -1,
 blocked TEXT NOT NULL DEFAULT '', exhausted INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS token_reservations(
 id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES token_budgets(session), operation TEXT NOT NULL,
 budgetVersion INTEGER NOT NULL, maxInput INTEGER NOT NULL, maxOutput INTEGER NOT NULL, boundSource TEXT NOT NULL,
 state TEXT NOT NULL, created INTEGER NOT NULL, report TEXT, UNIQUE(session,operation)
);
CREATE TABLE IF NOT EXISTS token_reports(
 session TEXT NOT NULL REFERENCES token_budgets(session), id TEXT NOT NULL, sequence INTEGER NOT NULL,
 payload TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(session,id), UNIQUE(session,sequence)
);
CREATE TABLE IF NOT EXISTS token_alerts(
 session TEXT NOT NULL REFERENCES token_budgets(session), version INTEGER NOT NULL,
 created INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(session,version)
);
CREATE TABLE IF NOT EXISTS token_extensions(
 id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES token_budgets(session), budgetVersion INTEGER NOT NULL,
 amount INTEGER NOT NULL, paramsHash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
 state TEXT NOT NULL, simulated INTEGER NOT NULL, interaction TEXT UNIQUE, reason TEXT NOT NULL DEFAULT '', appliedVersion INTEGER
);
`;
interface BudgetRow {
 session:string; version:number; allowance:number; mode:'absolute'|'daily-percent'; percentageBps:number|null;
 dailyTokens:number|null; periodStart:number|null; periodEnd:number|null; used:number|null;
 lastMeasured:number|null; lastReceived:number|null; source:string|null; checkpointSeq:number;
 blocked:string; exhausted:number; created:number;
}
export interface Reservation {
 id:string; session:string; operation:string; budgetVersion:number; maxInput:number; maxOutput:number;
 boundSource:string; state:string; created:number; report:string|null;
}
export interface Usage {
 unit:'tokens'; inputTokens:number; outputTokens:number; totalTokens:number;
 cachedInputTokens?:number; reasoningOutputTokens?:number;
}
export interface BudgetSnapshot {
 configured:boolean; sessionId:string; simulated:boolean; version:number|null; allowance:number|null;
 measuredUsed:number|null; measuredRemaining:number|null; availableToReserve:number|null; reserved:number;
 activeReservations:number; uncertainReservations:number; freshness:'unknown'|'fresh'|'stale'; source:string;
 lastMeasuredAt:string|null; paused:boolean; pauseReason:string; mode:string|null;
 dailyPool:null|{tokens:number; startsAt:string; endsAt:string; allocationPercent:number; usedPercent:number|null};
 taskUsedPercent:number|null; coverage:string; summary:string;
}
function integer(v:unknown,max=MAX_MEASURED):v is number {return Number.isSafeInteger(v) && (v as number)>=0 && (v as number)<=max}
export function object(v:unknown,allowed:string[]):asserts v is Record<string,any> {
 assert(v && typeof v==='object' && !Array.isArray(v),'Expected JSON object');
 assert(Object.keys(v).every(k=>allowed.includes(k)),'Unexpected accounting fields');
}
export function utc(v:unknown):number {
 assert(typeof v==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v),'Expected an explicit ISO UTC time');
 const n=Date.parse(v);assert(Number.isFinite(n)&&new Date(n).toISOString().slice(0,19)===v.slice(0,19),'Invalid UTC calendar time');return n;
}
export function usage(v:unknown):Usage {
 object(v,['unit','inputTokens','outputTokens','totalTokens','cachedInputTokens','reasoningOutputTokens']);
 assert(v.unit==='tokens','Accounting unit must be tokens; credits or currency are not tokens');
 assert(integer(v.inputTokens)&&integer(v.outputTokens)&&integer(v.totalTokens),'Measured input, output, and total token counts are required');
 assert(v.totalTokens===v.inputTokens+v.outputTokens,'Total must equal input plus output; cached/reasoning are inclusive subsets');
 if(v.cachedInputTokens!==undefined)assert(integer(v.cachedInputTokens)&&v.cachedInputTokens<=v.inputTokens,'Cached input must be a subset of input');
 if(v.reasoningOutputTokens!==undefined)assert(integer(v.reasoningOutputTokens)&&v.reasoningOutputTokens<=v.outputTokens,'Reasoning output must be a subset of output');
 return {unit:'tokens',inputTokens:v.inputTokens,outputTokens:v.outputTokens,totalTokens:v.totalTokens,
 ...(v.cachedInputTokens===undefined?{}:{cachedInputTokens:v.cachedInputTokens}),
 ...(v.reasoningOutputTokens===undefined?{}:{reasoningOutputTokens:v.reasoningOutputTokens})};
}
export class Budgets {
 constructor(public store:Store,public clock=()=>Date.now()){}
 transaction<T>(fn:()=>T):T {
 this.store.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.store.db.exec('COMMIT');return result}catch(e){this.store.db.exec('ROLLBACK');throw e}
 }
 row(session:string){return this.store.db.prepare('SELECT * FROM token_budgets WHERE session=?').get(session) as unknown as BudgetRow|undefined}
 owner(session:string,agent:unknown,simulated=false){const s=this.store.session(session);assert(s,'Session not found',404);assert(identifier(agent)&&s.agent===agent,'Wrong session agent',403);assert(simulated===!!s.simulated,'Live and simulated accounting cannot be mixed',409);return s}
 configure(session:string,input:unknown){
 object(input,['mode','tokens','percentage','dailyPool']);assert(this.store.session(session),'Session not found',404);
 let amount:number,bps:number|null=null,daily:number|null=null,start:number|null=null,end:number|null=null;
 if(input.mode==='absolute'){assert(integer(input.tokens,MAX_ALLOWANCE)&&input.tokens>0,'Absolute allowance must be 1–1,000,000,000 tokens');assert(input.percentage===undefined&&input.dailyPool===undefined,'Absolute mode does not accept a daily percentage');amount=input.tokens}
 else{assert(input.mode==='daily-percent','Invalid budget mode');assert(input.tokens===undefined,'Percentage mode cannot include an absolute allowance');assert(typeof input.percentage==='number'&&Number.isFinite(input.percentage),'An explicit percentage is required');bps=Math.round(input.percentage*100);assert(bps>0&&bps<=10000&&Math.abs(bps/100-input.percentage)<1e-9,'Daily percentage must be 0.01–100 with at most two decimals');
 object(input.dailyPool,['tokens','startsAt','endsAt']);assert(integer(input.dailyPool.tokens,MAX_ALLOWANCE)&&input.dailyPool.tokens>0,'An explicit daily TOKEN denominator is required');daily=input.dailyPool.tokens;start=utc(input.dailyPool.startsAt);end=utc(input.dailyPool.endsAt);assert(end-start===86_400_000,'Daily pool requires an explicit 24-hour UTC period');assert(start<=this.clock()&&this.clock()<end,'Daily pool period must contain the current time');amount=Math.floor(daily*bps/10000);assert(amount>0,'Percentage allocation rounds below one whole token');}
 this.transaction(()=>{assert(!this.row(session),'Budget already allocated; increases require a separate phone-approved extension',409);this.store.db.prepare('INSERT INTO token_budgets(session,version,allowance,mode,percentageBps,dailyTokens,periodStart,periodEnd,created) VALUES(?,1,?,?,?,?,?,?,?)').run(session,amount,input.mode,bps,daily,start,end,this.clock())});return this.snapshot(session);
 }
 snapshot(session:string):BudgetSnapshot {
 const s=this.store.session(session);assert(s,'Session not found',404);const b=this.row(session);const now=this.clock();
 const rs=this.store.db.prepare("SELECT * FROM token_reservations WHERE session=? AND state IN ('active','uncertain')").all(session) as unknown as Reservation[];
 const reserved=rs.reduce((sum,r)=>sum+r.maxInput+r.maxOutput,0),uncertain=rs.filter(r=>r.state==='uncertain'||r.created+RESERVATION_LEASE_MS<=now).length;
 const freshness=!b||b.used===null||b.lastMeasured===null||b.lastReceived===null?'unknown':now-Math.min(b.lastMeasured,b.lastReceived)>BUDGET_FRESH_MS?'stale':'fresh';
 const available=b&&b.used!==null?Math.max(0,b.allowance-b.used-reserved):null;
 const reason=!b?'No task budget allocated':b.blocked|| (uncertain?'Uncertain or overdue operation; measured reconciliation required':b.used===null?'Usage telemetry missing; never assumed zero':b.periodEnd!==null&&now>=b.periodEnd?'Daily token period ended; no automatic reset':b.periodStart!==null&&now<b.periodStart?'Daily token period has not started':freshness!=='fresh'?'Usage telemetry stale; a fresh measured checkpoint is required':b.used>=b.allowance?'Token allowance exhausted':available===0?'All remaining tokens are reserved in flight':'');
 const result:BudgetSnapshot={configured:!!b,sessionId:session,simulated:!!s.simulated,version:b?.version??null,allowance:b?.allowance??null,measuredUsed:b?.used??null,measuredRemaining:b&&b.used!==null?Math.max(0,b.allowance-b.used):null,availableToReserve:available,reserved,activeReservations:rs.length,uncertainReservations:uncertain,freshness,source:b?.source??'missing',lastMeasuredAt:b?.lastMeasured===null||!b?'':new Date(b.lastMeasured!).toISOString(),paused:!!reason,pauseReason:reason||'Bounded operations may be admitted by cooperating adapters',mode:b?.mode??null,dailyPool:b?.dailyTokens?{tokens:b.dailyTokens,startsAt:new Date(b.periodStart!).toISOString(),endsAt:new Date(b.periodEnd!).toISOString(),allocationPercent:b.allowance*100/b.dailyTokens,usedPercent:b.used===null?null:b.used*100/b.dailyTokens}:null,taskUsedPercent:b&&b.used!==null?b.used*100/b.allowance:null,coverage:'Only cooperating adapters are gated. Agents ignoring admission are monitoring-only; no external task was stopped.',summary:''};
 result.lastMeasuredAt=result.lastMeasuredAt||null;result.summary=budgetSummary(result);return result;
 }
 enqueueExhaustion(session:string){const b=this.row(session)!;const exhausted=b.used!==null&&b.used>=b.allowance;this.store.db.prepare('UPDATE token_budgets SET exhausted=? WHERE session=?').run(Number(exhausted),session);if(exhausted&&!this.store.session(session)!.simulated)this.store.db.prepare("INSERT OR IGNORE INTO token_alerts VALUES(?,?,?,'pending')").run(session,b.version,this.clock())}
 measuredTime(v:unknown){const t=utc(v);assert(t<=this.clock()+120_000,'Usage time is more than 120 seconds ahead');return t}
 checkpoint(session:string,input:unknown,simulated=false){
 object(input,['agentId','reportId','sequence','measuredAt','source','usage']);this.owner(session,input.agentId,simulated);assert(identifier(input.reportId)&&integer(input.sequence),'Usage report ID and nonnegative sequence required');const measured=this.measuredTime(input.measuredAt);assert(['provider-reported','adapter-measured',...(simulated?['simulation']:[])].includes(input.source),'Usage source must be explicit');const measuredUsage=usage(input.usage);
 const payload=JSON.stringify({agentId:input.agentId,reportId:input.reportId,sequence:input.sequence,measuredAt:new Date(measured).toISOString(),source:input.source,usage:measuredUsage});
 const status=this.transaction(()=>{const b=this.row(session);assert(b,'Allocate a budget first',409);const existing=this.store.db.prepare('SELECT payload,state FROM token_reports WHERE session=? AND id=?').get(session,input.reportId) as {payload:string;state:string}|undefined;if(existing){assert(existing.payload===payload,'Usage report replay changed content',409);return 'duplicate'}
 assert(!this.store.db.prepare('SELECT id FROM token_reports WHERE session=? AND sequence=?').get(session,input.sequence),'Usage sequence already assigned',409);
 let state='applied';if(input.sequence<=b.checkpointSeq)state='out-of-order';
 else if(this.snapshot(session).activeReservations)state='blocked-in-flight';
 else if((b.used!==null&&measuredUsage.totalTokens<b.used)||(b.lastMeasured!==null&&measured<b.lastMeasured))state='counter-regression';
 this.store.db.prepare('INSERT INTO token_reports VALUES(?,?,?,?,?)').run(session,input.reportId,input.sequence,payload,state);
 if(state==='applied'){this.store.db.prepare('UPDATE token_budgets SET used=?,lastMeasured=?,lastReceived=?,source=?,checkpointSeq=? WHERE session=?').run(measuredUsage.totalTokens,measured,this.clock(),input.source,input.sequence,session);this.enqueueExhaustion(session)}
 if(state==='counter-regression')this.store.db.prepare("UPDATE token_budgets SET blocked='Usage counter or clock regressed; operator investigation required',checkpointSeq=? WHERE session=?").run(input.sequence,session);
 return state;});return {status,...this.snapshot(session)};
 }
 reserve(session:string,input:unknown,simulated=false){
 object(input,['agentId','operationId','budgetVersion','unit','maxInputTokens','maxOutputTokens','boundSource']);this.owner(session,input.agentId,simulated);
 assert(identifier(input.operationId)&&integer(input.budgetVersion)&&input.budgetVersion>0,'Operation ID and budget version required');assert(input.unit==='tokens','Reservation unit must be tokens');assert(integer(input.maxInputTokens,MAX_ALLOWANCE)&&integer(input.maxOutputTokens,MAX_ALLOWANCE)&&input.maxInputTokens+input.maxOutputTokens>0&&input.maxInputTokens+input.maxOutputTokens<=MAX_ALLOWANCE,'A bounded input/output token maximum is required');assert(['verified-tokenizer-and-provider-cap','trusted-operation-upper-bound'].includes(input.boundSource),'A verified operation upper-bound source is required');
 return this.transaction(()=>{const existing=this.store.db.prepare('SELECT * FROM token_reservations WHERE session=? AND operation=?').get(session,input.operationId) as unknown as Reservation|undefined;
 if(existing){assert(existing.budgetVersion===input.budgetVersion&&existing.maxInput===input.maxInputTokens&&existing.maxOutput===input.maxOutputTokens&&existing.boundSource===input.boundSource,'Operation replay changed its bounds or budget version',409);return {granted:false,replay:true,reservation:existing,budget:this.snapshot(session)}}
 const b=this.snapshot(session);assert(b.configured,'Allocate a budget first',409);assert(b.version===input.budgetVersion,'Budget version changed; refresh before admission',409);assert(!b.paused,b.pauseReason,409);assert(b.availableToReserve!==null&&input.maxInputTokens+input.maxOutputTokens<=b.availableToReserve,'Operation maximum exceeds unreserved allowance',409);
 const id=randomBytes(32).toString('hex');this.store.db.prepare("INSERT INTO token_reservations(id,session,operation,budgetVersion,maxInput,maxOutput,boundSource,state,created) VALUES(?,?,?,?,?,?,?,'active',?)").run(id,session,input.operationId,input.budgetVersion,input.maxInputTokens,input.maxOutputTokens,input.boundSource,this.clock());return {granted:true,replay:false,reservation:this.reservation(id,session),budget:this.snapshot(session)};
 });
 }
 reservation(id:string,session:string){const r=this.store.db.prepare('SELECT * FROM token_reservations WHERE id=? AND session=?').get(id,session) as unknown as Reservation|undefined;assert(r,'Reservation does not belong to this task',404);return r}
 uncertain(session:string,input:unknown,simulated=false){object(input,['agentId','reservationId']);this.owner(session,input.agentId,simulated);assert(typeof input.reservationId==='string','Reservation ID required');return this.transaction(()=>{const r=this.reservation(input.reservationId,session);if(r.state==='active')this.store.db.prepare("UPDATE token_reservations SET state='uncertain' WHERE id=?").run(r.id);return this.snapshot(session)})}
 reconcile(session:string,input:unknown,simulated=false){
 object(input,['agentId','reservationId','operationId','budgetVersion','measuredAt','source','usage']);this.owner(session,input.agentId,simulated);assert(typeof input.reservationId==='string'&&identifier(input.operationId),'Reservation and operation IDs required');
 const binding=this.reservation(input.reservationId,session);assert(binding.operation===input.operationId&&binding.budgetVersion===input.budgetVersion,'Reservation binding mismatch',409);
 let measured:number,u:Usage;
 try{measured=this.measuredTime(input.measuredAt);assert(['provider-reported','adapter-measured',...(simulated?['simulation']:[])].includes(input.source),'Usage source must be explicit');u=usage(input.usage)}catch(error){this.store.db.prepare("UPDATE token_reservations SET state='uncertain' WHERE id=? AND state='active'").run(binding.id);throw error}

 const payload=JSON.stringify({agentId:input.agentId,reservationId:input.reservationId,operationId:input.operationId,budgetVersion:input.budgetVersion,measuredAt:new Date(measured).toISOString(),source:input.source,usage:u});
 const status=this.transaction(()=>{const r=this.reservation(input.reservationId,session);assert(r.operation===input.operationId&&r.budgetVersion===input.budgetVersion,'Reservation binding mismatch',409);
 if(r.report!==null){assert(r.report===payload,'Reconciliation replay changed measured content',409);return 'duplicate'}
 assert(r.state==='active'||r.state==='uncertain','Reservation is not reconcilable',409);assert(measured>=r.created,'Measured operation time predates admission');const b=this.row(session)!;assert(b.used!==null,'Missing baseline usage; reconciliation cannot guess zero',409);const total=b.used+u.totalTokens;assert(integer(total),'Cumulative measured total exceeds accounting range');const excess=u.inputTokens>r.maxInput||u.outputTokens>r.maxOutput;
 this.store.db.prepare("UPDATE token_reservations SET state='reconciled',report=? WHERE id=?").run(payload,r.id);
 // Each operation is an additive measured delta; arrival order never replaces newer counters.
 this.store.db.prepare('UPDATE token_budgets SET used=?,lastMeasured=?,lastReceived=?,source=?,blocked=? WHERE session=?').run(total,Math.max(b.lastMeasured??0,measured),this.clock(),input.source,excess?'An operation exceeded its declared token bound; strict admission blocked':b.blocked,session);this.enqueueExhaustion(session);return excess?'bound-exceeded':'applied';});return {status,...this.snapshot(session)};
 }
 seedSamples(){const session='sample-checkout';if(this.store.session(session)?.simulated&&!this.row(session)){this.configure(session,{mode:'absolute',tokens:10000});this.checkpoint(session,{agentId:'sample-agent',reportId:'sample-token-fixture',sequence:0,measuredAt:new Date(this.clock()).toISOString(),source:'simulation',usage:{unit:'tokens',inputTokens:7000,outputTokens:1835,totalTokens:8835,cachedInputTokens:2000,reasoningOutputTokens:500}},true)}}
}
export function budgetSummary(b:BudgetSnapshot){
 if(!b.configured)return 'Token budget: not allocated. Measured usage and remaining allowance are unknown. Cooperating work is paused until a budget and fresh measured usage are supplied. External agents are not stopped.';
 const prefix=b.simulated?'SIMULATED token fixture. ':'';
 const measured=b.measuredUsed===null?'Measured usage unknown; never assumed zero.':`Measured usage ${b.measuredUsed.toLocaleString('en-US')} tokens; remaining measured allowance ${b.measuredRemaining!.toLocaleString('en-US')}. ${b.reserved.toLocaleString('en-US')} reserved in flight; ${b.availableToReserve!.toLocaleString('en-US')} available for the next operation.`;
 const daily=b.dailyPool?` Allocation is ${Number(b.dailyPool.allocationPercent.toFixed(4))}% of the explicitly supplied daily pool of ${b.dailyPool.tokens.toLocaleString('en-US')} tokens (${b.dailyPool.startsAt} to ${b.dailyPool.endsAt}). This task's usage is ${b.dailyPool.usedPercent===null?'unknown':Number(b.dailyPool.usedPercent.toFixed(4))+'%'} of the daily pool and ${b.taskUsedPercent===null?'unknown':Number(b.taskUsedPercent.toFixed(4))+'%'} of this task budget. Total daily use across tasks is not known; the pool is a denominator, not an enforced shared provider quota.`:'';
 return `${prefix}Allowed ${b.allowance!.toLocaleString('en-US')} tokens (budget version ${b.version}). ${measured}${b.measuredUsed!==null&&(b.freshness!=='fresh'||b.activeReservations>0)?' Current total consumption is unknown; the counter is last measured evidence and reservations remain held.':''}${daily} Source ${b.source}; ${b.freshness}; last measured ${b.lastMeasuredAt??'unknown'}. Cooperating work ${b.paused?'PAUSED: '+b.pauseReason:'may request bounded admission'}. ${b.coverage}`;
}
