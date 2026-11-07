import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// This adapter grants no provider quota. The cooperating caller must supply a proven
// input upper bound and enforce an inclusive output/reasoning cap on its own provider call.
export async function budgetRequest(action,sessionId,payload){
 if(!['checkpoint','reserve','reconcile','uncertain'].includes(action)||!/^[\w-]{1,96}$/.test(sessionId))throw Error('Invalid budget adapter route');
 const token=process.env.AGENTPULSE_INGEST_TOKEN||readFileSync(resolve('.local/ingest-token'),'utf8').trim();
 const url=new URL(process.env.AGENTPULSE_URL||'http://127.0.0.1:5177');
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw Error('Budget adapter requires a local http://127.0.0.1 URL');
 const response=await fetch(new URL(`/api/budgets/${sessionId}/${action}`,url),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(5000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Budget adapter request failed');return result;
}
export async function runBudgetedOperation(spec,operation,request=budgetRequest){
 const {sessionId,...fields}=spec;const admission=Object.freeze(fields);
 const grant=await request('reserve',sessionId,admission);
 const r=grant.reservation;
 if(grant.granted!==true||grant.replay||r?.state!=='active'||typeof r.id!=='string'||!/^[a-f0-9]{64}$/.test(r.id)||r.session!==sessionId||r.operation!==admission.operationId||r.budgetVersion!==admission.budgetVersion||r.maxInput!==admission.maxInputTokens||r.maxOutput!==admission.maxOutputTokens)throw Error('No new matching token admission; do not execute or replay the operation');
 const binding={agentId:admission.agentId,reservationId:r.id,operationId:r.operation,budgetVersion:r.budgetVersion};
 try{
 const result=await operation(Object.freeze({maxInputTokens:r.maxInput,maxOutputTokens:r.maxOutput}));
 if(!result||!result.usage||!['provider-reported','adapter-measured'].includes(result.source))throw Error('Measured provider/adapter usage is required; never guess zero');
 const settled=await request('reconcile',sessionId,{...binding,measuredAt:result.measuredAt??new Date().toISOString(),source:result.source,usage:result.usage});
 if(!['applied','duplicate'].includes(settled.status))throw Error('Operation exceeded its token bound; stop and investigate');
 return {value:result.value,budget:settled};
 }catch{
 // Failure may have spent tokens. Never release, invent zero, or run again.
 try{await request('uncertain',sessionId,{agentId:spec.agentId,reservationId:grant.reservation.id})}catch{}
 throw Error('Operation or accounting failed. Do not retry execution; reconcile the existing reservation with measured usage.');
 }
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 try{let raw='';for await(const c of process.stdin){raw+=c;if(Buffer.byteLength(raw)>8192)throw Error('Payload too large')}
 const result=await budgetRequest(process.argv[2],process.argv[3],JSON.parse(raw));console.log(JSON.stringify(result));
 }catch(error){console.error(error instanceof Error?error.message:'Budget adapter failed');process.exitCode=1}
}
