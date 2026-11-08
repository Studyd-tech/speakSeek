import {DatabaseSync} from 'node:sqlite';
import {BUDGET_SCHEMA} from './budget.js';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {assert,validateEvent,type PulseEvent,type StoredEvent,type Snapshot} from './core.js';
export class Store {
 db:DatabaseSync;
 constructor(public path:string){mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec(`
 PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,agent TEXT NOT NULL,label TEXT NOT NULL,simulated INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS events(session TEXT NOT NULL REFERENCES sessions(id), id TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL, received INTEGER NOT NULL, PRIMARY KEY(session,id), UNIQUE(session,sequence));
 CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), action TEXT NOT NULL,paramsHash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL,simulated INTEGER NOT NULL,interaction TEXT UNIQUE, reason TEXT NOT NULL DEFAULT '',executed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS notifications(key TEXT PRIMARY KEY, session TEXT NOT NULL,created INTEGER NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 `);this.db.exec(BUDGET_SCHEMA);}
 close(){if(this.db.isOpen)this.db.close()}
 session(id:string){return this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as {id:string;agent:string;label:string;simulated:number}|undefined}
 addSession(id:string,agent:string,label:string,simulated=false){this.db.prepare('INSERT OR IGNORE INTO sessions VALUES(?,?,?,?)').run(id,agent,label,Number(simulated))}
 ingest(input:unknown,now=Date.now(),sample=false){
 const e=validateEvent(input,now); let s=this.session(e.sessionId);
 assert(!s||s.agent===e.agentId,'Session belongs to another agent',409);
 assert(!s?.simulated||sample,'Sample sessions cannot accept live telemetry',409);
 const existing=this.db.prepare('SELECT payload FROM events WHERE session=? AND id=?').get(e.sessionId,e.eventId) as {payload:string}|undefined;
 if(existing){assert(existing.payload===JSON.stringify(e),'Event ID replay has changed content',409);return {duplicate:true,latest:false,event:e}}
 const conflict=this.db.prepare('SELECT id FROM events WHERE session=? AND sequence=?').get(e.sessionId,e.sequence);assert(!conflict,'Sequence already assigned to a different event',409);
 if(!s){this.addSession(e.sessionId,e.agentId,e.sessionId,sample);s=this.session(e.sessionId)!}
 this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(e.sessionId,e.eventId,e.sequence,JSON.stringify(e),now);
 const max=this.db.prepare('SELECT MAX(sequence) AS seq FROM events WHERE session=?').get(e.sessionId) as {seq:number};
 return {duplicate:false,latest:max.seq===e.sequence,event:e};
 }
 snapshot(id:string,now=Date.now()):Snapshot {
 const s=this.session(id);assert(s,'Session not found',404);
 const rows=this.db.prepare('SELECT payload,received FROM events WHERE session=? ORDER BY sequence DESC LIMIT 100').all(id) as {payload:string;received:number}[];
 const events=rows.map(r=>({...JSON.parse(r.payload),receivedAt:r.received})) as StoredEvent[]; const last=events[0];
 const age=last?now-Math.min(Date.parse(last.timestamp),last.receivedAt):Infinity;
 const count=this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE session=?').get(id) as {n:number};
 return {sessionId:id,agentId:s.agent,label:s.label,simulated:!!s.simulated,state:last?.type??'unknown',summary:last?.summary??'Waiting for the first recorded event',lastObservedAt:last?.timestamp??null,freshness:last?(age<=120_000?'fresh':'stale'):'unknown',events:events.reverse(),eventCount:count.n,clockSkew:!!last && Date.parse(last.timestamp)>last.receivedAt};
 }
 sessions(now=Date.now()){return (this.db.prepare('SELECT id FROM sessions ORDER BY simulated DESC,label').all() as {id:string}[]).map(s=>this.snapshot(s.id,now))}
 setting(key:string,fallback:string){return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value??fallback}
 setSetting(key:string,v:string){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,v)}
 recover(){this.db.exec("UPDATE token_reservations SET state='uncertain' WHERE state='active'; UPDATE token_extensions SET state='failed',reason='Server restarted; request must not resume permission' WHERE state='pending'; UPDATE token_alerts SET state='uncertain' WHERE state='sending';");this.db.prepare("UPDATE decisions SET state='failed',reason='Server restarted; uncertain request blocked. Create a new decision.' WHERE state IN ('pending','approved')").run();}
}
export function seed(store:Store,now=Date.now()){
 const samples=[{id:'sample-checkout',label:'Checkout recovery',offset:0,events:[['started','Investigating the checkout retry failure'],['progress','Reproduced the intermittent timeout in the sample task'],['progress','Added retry handling and recorded passing checks'],['decision','Waiting for review of the harmless timestamp demo']]},{id:'sample-complete',label:'Search accessibility',offset:240_000,events:[['started','Auditing search keyboard navigation'],['progress','Added focus handling and accessible labels'],['completed','Search accessibility task finished; recorded checks passed']]},{id:'sample-failed',label:'API contract check',offset:420_000,events:[['started','Checking the sample API contract'],['failed','Contract check failed: response missing an expected field']]}];
 for(const s of samples){store.addSession(s.id,'sample-agent',s.label,true);s.events.forEach(([type,summary],i)=>store.ingest({agentId:'sample-agent',sessionId:s.id,eventId:`${s.id}-${i}`,type,summary,sequence:i,timestamp:new Date(now-s.offset-(s.events.length-1-i)*30_000).toISOString()},now,true));}
 store.addSession('sample-empty','sample-agent','No events yet (sample)',true);
 store.addSession('local-demo','manual','Local phone-gate demo');
}
