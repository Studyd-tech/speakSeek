import {parentPort,workerData} from 'node:worker_threads';
import {Store} from '../src/store.js';
import {Notify} from '../src/notify.js';
import {PhoneDemo} from '../src/phone-demo.js';
if(parentPort){const data=workerData as {path:string;barrier:SharedArrayBuffer;now:number};const store=new Store(data.path);const notify=new Notify(async args=>{if(args[0]!=='interaction')throw Error('No creation authorized in a concurrent replay');return {code:0,body:{timedOut:false,interaction:{id:'int_private_fixture',kind:'approval',status:'approved',response:'approve',respondedAt:new Date(data.now).toISOString()}}}});const demo=new PhoneDemo(store,'demo-one',notify,()=>data.now);parentPort.postMessage('ready');Atomics.wait(new Int32Array(data.barrier),0,0);try{const result=await demo.run({livePhone:true,ackSimulatedUsage:true,waitSeconds:120});parentPort.postMessage({state:result.state})}finally{store.close()}}
