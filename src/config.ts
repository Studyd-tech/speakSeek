import {mkdirSync,existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
export const root=resolve('.');
export function ingestToken(){
 if(process.env.AGENTPULSE_INGEST_TOKEN){if(process.env.AGENTPULSE_INGEST_TOKEN.length<32)throw new Error('AGENTPULSE_INGEST_TOKEN must have at least 32 characters');return process.env.AGENTPULSE_INGEST_TOKEN}
 const dir=resolve(root,'.local');mkdirSync(dir,{recursive:true,mode:0o700});const file=resolve(dir,'ingest-token');
 if(!existsSync(file))writeFileSync(file,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});chmodSync(file,0o600);return readFileSync(file,'utf8').trim();
}
