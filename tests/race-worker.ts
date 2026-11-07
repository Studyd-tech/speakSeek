import {parentPort,workerData} from 'node:worker_threads';
import {Store} from '../src/store.js';
import {Approvals,ACTION,PARAMS_HASH} from '../src/approval.js';
import {Notify} from '../src/notify.js';
if(parentPort){const data=workerData as {path:string;dir:string;id:string;now:number;gate:SharedArrayBuffer};const store=new Store(data.path);const approval=new Approvals(store,new Notify(),data.dir,()=>data.now);parentPort.postMessage('ready');Atomics.wait(new Int32Array(data.gate),0,0);const result=approval.settle(data.id,'session-one',ACTION,PARAMS_HASH,{code:0,body:{timedOut:false,interaction:{id:'int_one',kind:'approval',status:'approved',response:'approve',respondedAt:new Date(data.now).toISOString()}}});store.close();parentPort.postMessage({executed:result.executed});}
