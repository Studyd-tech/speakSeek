import {createHash, timingSafeEqual} from 'node:crypto';
export const TYPES = ['started','progress','decision','completed','failed','aborted'] as const;
export type EventType = typeof TYPES[number];
export interface PulseEvent {agentId:string;sessionId:string;eventId:string;type:EventType;timestamp:string;sequence:number;summary:string}
export interface StoredEvent extends PulseEvent {receivedAt:number}
export class AppError extends Error { constructor(public status:number,message:string){super(message)} }
export function assert(ok:unknown,message:string,status=400):asserts ok {if(!ok) throw new AppError(status,message)}
export const idPattern=/^[a-zA-Z0-9_-]{1,96}$/;
export function identifier(v:unknown):v is string {return typeof v==='string' && idPattern.test(v)}
export function redact(v:string):string {
 return v.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\b(?:Bearer\s+)[^\s,;]+/gi,'[REDACTED]')
 .replace(/\b(?:sk|ntf|ak|ghp|github_pat|token|key|secret)[_-][A-Za-z0-9_\-]{8,}/gi,'[REDACTED]')
 .replace(/\b(?:api[_-]?key|password|secret|token|authorization)\s*[:=]\s*\S+/gi,'[REDACTED]')
 .replace(/\b[A-Za-z0-9_\-+=]{32,}\b/g,'[REDACTED]')
 .replace(/https?:\/\/\S+/gi,'[URL]').replace(/(?:[A-Za-z]:\\|\/|~\/)[^\s,;]+/g,'[PATH]')
 .replace(/`[^`]*`/g,'[COMMAND]').replace(/\b(?:curl|wget|bash|sh|sudo|rm|exec|export|eval|node|npm|python\d?)\s+[^.;]+/gi,'[COMMAND]')
 .replace(/\s+/g,' ').trim().slice(0,280);
}
export function validateEvent(value:unknown,now=Date.now()):PulseEvent {
 assert(value && typeof value==='object' && !Array.isArray(value),'Expected event object');
 const e=value as Record<string,unknown>;
 assert(Object.keys(e).sort().join(',')==='agentId,eventId,sequence,sessionId,summary,timestamp,type','Unexpected or missing event fields');
 for(const k of ['agentId','sessionId','eventId']) assert(identifier(e[k]),`Invalid ${k}`);
 assert(typeof e.type==='string' && (TYPES as readonly string[]).includes(e.type),'Invalid event type');
 assert(Number.isSafeInteger(e.sequence) && (e.sequence as number)>=0,'Sequence must be a nonnegative safe integer');
 assert(typeof e.timestamp==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(e.timestamp) && Number.isFinite(Date.parse(e.timestamp)),'Timestamp must be ISO UTC');
 assert(new Date(e.timestamp as string).toISOString().slice(0,19)===(e.timestamp as string).slice(0,19),'Invalid calendar date');
 assert(Date.parse(e.timestamp as string)<=now+120_000,'Clock is more than 120 seconds ahead');
 assert(typeof e.summary==='string' && e.summary.trim().length>0 && e.summary.length<=500,'Summary must contain 1–500 characters');
 return {...e, timestamp:new Date(e.timestamp as string).toISOString(),summary:redact(e.summary as string)} as unknown as PulseEvent;
}
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y)}
export interface Snapshot {sessionId:string;agentId:string;label:string;simulated:boolean;state:string;summary:string;lastObservedAt:string|null;freshness:'fresh'|'stale'|'unknown';events:StoredEvent[];eventCount:number;clockSkew:boolean}
export function deterministic(s:Snapshot){
 if(!s.lastObservedAt) return `${s.label}: no recorded events. Last observed state and time are unknown. Missing data; no progress can be inferred.`;
 return `${s.simulated?'SIMULATED sample. ':''}${s.label}: last observed state ${s.state} at ${s.lastObservedAt}. ${s.summary}. ${s.freshness==='stale'?'STALE: no fresh evidence within 2 minutes. Current progress is unknown.':'Fresh record (within 2 minutes); this is observed evidence, not a prediction.'}${s.clockSkew?' Agent clock was ahead; freshness uses server receipt time.':''}`;
}
