// Cursor documented common schema + stop {status, loop_count}. This never changes permissions.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {report} from './report-event.mjs';
export function convert(payload){
 if(!payload||payload.hook_event_name!=='stop'||!/^[\w-]{1,96}$/.test(payload.conversation_id)||!/^[\w-]{1,96}$/.test(payload.generation_id)||!['completed','aborted','error'].includes(payload.status)||!Number.isSafeInteger(payload.loop_count)||payload.loop_count<0||payload.loop_count>9999)throw new Error('Invalid documented stop payload');
 const type={completed:'completed',aborted:'aborted',error:'failed'}[payload.status];
 // No documented lifetime sequence exists. Keep each generation separate, with loop_count as its sequence.
 const generation=createHash('sha256').update(JSON.stringify([payload.conversation_id,payload.generation_id])).digest('hex').slice(0,40);
 return {agentId:'cursor',sessionId:`cursor-${generation}`,eventId:`stop-${payload.loop_count}`,type,timestamp:new Date().toISOString(),sequence:payload.loop_count,summary:`Cursor agent loop ${payload.status}. This records a loop outcome, not verified task completion.`};
}
export function prepare(payload,path=resolve('.local/cursor-hook-events.sqlite')){
 const e=convert(payload);mkdirSync(dirname(path),{recursive:true,mode:0o700});const db=new DatabaseSync(path);
 try{db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reports(session TEXT,id TEXT,payload TEXT,PRIMARY KEY(session,id))');
 // Persist once before sending. Retries preserve the timestamp and payload, including after a crash.
 db.prepare('INSERT OR IGNORE INTO reports VALUES(?,?,?)').run(e.sessionId,e.eventId,JSON.stringify(e));
 return JSON.parse(db.prepare('SELECT payload FROM reports WHERE session=? AND id=?').get(e.sessionId,e.eventId).payload);
 }finally{db.close()}
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{let raw='';for await(const c of process.stdin){raw+=c;if(raw.length>65536)throw new Error('Hook input too large')};await report(prepare(JSON.parse(raw)));
 }catch{console.error('AgentPulse telemetry unavailable; no permission behavior changed.')}console.log('{}')}
