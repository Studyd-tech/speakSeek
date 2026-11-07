import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {deterministic,identifier} from '../dist/src/core.js';

export function loopbackBase(input){
 let url;try{url=new URL(input)}catch{throw new Error('Status line needs http://127.0.0.1:<port>')}
 const port=url.port===''?NaN:Number(url.port);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||(url.pathname!==''&&url.pathname!=='/')||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Status line only calls http://127.0.0.1:<port>. It will not use another host or the phone gate.');
 return `http://127.0.0.1:${port}`;
}
export function options(argv,env=process.env){
 const out={session:'',label:'',base:env.AGENTPULSE_URL||'http://127.0.0.1:5177',speak:false};
 for(let i=2;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--speak')out.speak=true;
  else if(arg==='--session')out.session=argv[++i]??'';
  else if(arg==='--label')out.label=argv[++i]??'';
  else if(arg==='--base')out.base=argv[++i]??'';
  else throw new Error('Unknown argument. Use --session, --label, --base http://127.0.0.1:<port>, or --speak.');
 }
 if(out.session&&!identifier(out.session))throw new Error('Session id must be 1–96 letters, numbers, underscores, or hyphens');
 if(out.session&&out.label)throw new Error('Pass either --session or --label');
 return out;
}
async function getJson(root,path,fetchImpl){
 const response=await fetchImpl(`${root}${path}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error(`SpeakSeek returned ${response.status} for ${path}`);
 return response.json();
}
export async function readStatus(base,{session='',label=''}={},fetchImpl=fetch){
 const root=loopbackBase(base);
 if(!session&&!label){
  const list=await getJson(root,'/api/sessions',fetchImpl);
  if(!Array.isArray(list))throw new Error('Unexpected session list');
  return list.map(s=>`${s.sessionId}\t${s.label}`).join('\n');
 }
 let id=session;
 if(!id){
  const list=await getJson(root,'/api/sessions',fetchImpl);
  const hits=list.filter(s=>s.label===label);
  if(hits.length!==1)throw new Error(hits.length?'More than one session has that label':'No session has that label');
  id=hits[0].sessionId;
 }
 if(!identifier(id))throw new Error('Refusing session id');
 return deterministic(await getJson(root,`/api/sessions/${encodeURIComponent(id)}`,fetchImpl));
}
export function speak(text){
 if(process.platform!=='darwin')return {spoken:false,reason:'--speak uses /usr/bin/say on macOS only. This machine printed the status and did not speak it. AirPods were not tested.'};
 const result=spawnSync('/usr/bin/say',[text],{shell:false,encoding:'utf8',timeout:30_000});
 if(result.error||result.status!==0)return {spoken:false,reason:result.error?.code==='ENOENT'?'/usr/bin/say was not found':'macOS say failed'};
 return {spoken:true,reason:''};
}
async function main(){
 const chosen=options(process.argv);
 const line=await readStatus(chosen.base,chosen);
 process.stdout.write(line+(line.endsWith('\n')?'':'\n'));
 if(!chosen.speak||!chosen.session&&!chosen.label)return;
 const spoken=speak(line);
 if(!spoken.spoken){process.stderr.write(spoken.reason+'\n');if(process.platform==='darwin')process.exitCode=1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1});
