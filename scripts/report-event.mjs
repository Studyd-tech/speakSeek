import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export async function report(event){
 const token=process.env.AGENTPULSE_INGEST_TOKEN||readFileSync(resolve('.local/ingest-token'),'utf8').trim();
 const base=process.env.AGENTPULSE_URL||'http://127.0.0.1:5177';const url=new URL(base);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('AGENTPULSE_URL must use local http://127.0.0.1');
 const r=await fetch(new URL('/api/events',url),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(5000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Event intake failed');return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>8192)throw new Error('Input too large')};const result=await report(JSON.parse(data));console.log(JSON.stringify(result))}catch{console.error('Event rejected. Check JSON schema, local URL, and ingest token configuration.');process.exitCode=1}}
