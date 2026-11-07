import {execFile} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Notify,cliRunner} from '../dist/src/notify.js';
import {openPhoneDemo,readPhoneDemo,demoConsent,demoInvocation} from '../dist/src/phone-demo.js';

export const PHONE_DEMO_HELP=`SpeakSeek: SIMULATED Agent X / opt-in REAL Notify phone demo
No model is invoked. No real tokens are spent. No timestamp action executes.

No arguments or --help: show this help only; no state or notification created.
Live invocation (owner must explicitly authorize each test):
  Replace REVIEWED_ID with a fresh, unique owner-reviewed ID before execution.
  Do not replay any previous test ID or use angle brackets in the shell.
  npm run demo:phone -- --live-phone --ack-simulated-usage --invocation REVIEWED_ID --wait-seconds 120
Read-only status (no network; replace REVIEWED_ID with the existing reviewed ID):
  npm run demo:phone -- --status --invocation REVIEWED_ID

Exactly one creation attempt per invocation. Repeating a completed/failed invocation
never sends another push; a valid pending invocation may only resume its outbound wait.
Timeout/cancellation/expiry cannot apply a late approval. Use a fresh invocation ID
only for a separately owner-authorized test. New-run device results need owner confirmation.
The dated owner-confirmed AirPods announcement + TOUCH approval is in DEMO.md;
Siri queries, spoken amounts and voice approval are not implemented.
`;
export function parsePhoneDemoArgs(argv){
 if(argv.length===0||(argv.length===1&&argv[0]==='--help'))return {mode:'help'};
 const values={};const seen=new Set();
 for(let i=0;i<argv.length;i++){
 const key=argv[i];if(seen.has(key))throw Error('Repeated demo option');seen.add(key);
 if(['--live-phone','--ack-simulated-usage','--status'].includes(key)){values[key]=true;continue}
 if(!['--invocation','--wait-seconds'].includes(key)||typeof argv[i+1]!=='string'||argv[i+1].startsWith('--'))throw Error('Unsupported or incomplete demo options');values[key]=argv[++i];
 }
 demoInvocation(values['--invocation']);
 if(values['--status']){if(values['--live-phone']||values['--ack-simulated-usage']||values['--wait-seconds'])throw Error('Status is a separate read-only command');return {mode:'status',invocation:values['--invocation']}}
 const seconds=values['--wait-seconds']??'120';if(!/^\d{1,3}$/.test(seconds))throw Error('Wait must be 1–600 whole seconds');
 const consent={livePhone:values['--live-phone']===true,ackSimulatedUsage:values['--ack-simulated-usage']===true,waitSeconds:Number(seconds)};demoConsent(consent);
 return {mode:'live',invocation:values['--invocation'],consent};
}
export function makeDemoNotify(signal){
 // Use Notify's own credential handling. Capture output, pass argument arrays, and
 // abort only this invocation's own child when the owner cancels.
 const execute=(file,args,options,callback)=>execFile(file,args,{...options,signal},callback);
 return new Notify(cliRunner(process.env.NOTIFY_BIN??'notify',execute));
}
export async function runPhoneDemoCli(argv,dependencies={}){
 const write=dependencies.write??(message=>process.stdout.write(message+'\n'));
 let demo,removeSignals=()=>{};try{
 const args=parsePhoneDemoArgs(argv);if(args.mode==='help'){write(PHONE_DEMO_HELP);return 0}
 const root=dependencies.root??resolve(dirname(fileURLToPath(import.meta.url)),'..');
 if(args.mode==='status'){write(JSON.stringify(readPhoneDemo(root,args.invocation),null,2));return 0}
 const controller=new AbortController();const notify=dependencies.notify??makeDemoNotify(controller.signal);
 demo=openPhoneDemo(root,args.invocation,args.consent,notify,dependencies.clock);
 const cancel=()=>{demo.cancel();controller.abort()};if(!dependencies.noSignals){process.once('SIGINT',cancel);process.once('SIGTERM',cancel);removeSignals=()=>{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel)}}
 const result=await demo.run(args.consent,progress=>write(JSON.stringify({phase:'REQUEST_RECEIPT_NOT_DEVICE_VERIFICATION',...progress},null,2)));
 write(JSON.stringify({phase:'FINAL',...result},null,2));
 return result.state==='CONSUMED'?0:result.state==='DENIED'?5:result.state==='AUTH-ERROR'?3:['PENDING','CREATING','INITIALIZING','TIMED-OUT','CANCELED','EXPIRED'].includes(result.state)?4:1;
 }catch{write('Demo not authorized or local operation failed. No approval can be inferred. Check the fixed options, local state, and normal Notify setup; no automatic retry was made.');return 1}
 finally{removeSignals();demo?.store.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await runPhoneDemoCli(process.argv.slice(2));
