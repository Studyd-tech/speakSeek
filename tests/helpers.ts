import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {Notify,type Runner,type CliResult} from '../src/notify.js';
import {Approvals,ACTION,PARAMS_HASH} from '../src/approval.js';
export const NOW=Date.UTC(2026,10,7,12);
export function event(overrides:Record<string,unknown>={}){return {agentId:'agent-one',sessionId:'session-one',eventId:'event-one',type:'progress',timestamp:new Date(NOW).toISOString(),sequence:1,summary:'Recorded progress',...overrides}}
export function setup(){const dir=mkdtempSync(join(process.cwd(),'.local-test-'));const store=new Store(join(dir,'test.sqlite'));store.addSession('session-one','agent-one','Test task');return {dir,store,cleanup(){store.close();rmSync(dir,{recursive:true,force:true})}}}
export const success:CliResult={code:0,body:{interaction:{id:'int_one',kind:'approval',status:'approved',response:'approve',respondedAt:new Date(NOW+1000).toISOString()},timedOut:false}};
export function gate(run:Runner=async()=>({code:0,body:{authenticated:true}})){const ctx=setup();let clock=NOW;const notify=new Notify(run);const approvals=new Approvals(ctx.store,notify,join(ctx.dir,'demo-output'),()=>clock);const d=approvals.create('session-one',false);ctx.store.db.prepare('UPDATE decisions SET interaction=? WHERE id=?').run('int_one',d.id);return {...ctx,notify,approvals,d,setClock(n:number){clock=n},settle(result:CliResult=success,session='session-one',action=ACTION,params=PARAMS_HASH){return approvals.settle(d.id,session,action,params,result)}}}
