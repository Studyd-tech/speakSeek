import {parentPort,workerData} from 'node:worker_threads';
import {Store} from '../src/store.js';
import {Budgets} from '../src/budget.js';
if(parentPort){const data=workerData as {path:string;now:number;index:number;barrier:SharedArrayBuffer};const store=new Store(data.path),budgets=new Budgets(store,()=>data.now);parentPort.postMessage('ready');Atomics.wait(new Int32Array(data.barrier),0,0);try{const grant=budgets.reserve('session-one',{agentId:'agent-one',operationId:`worker-${data.index}`,budgetVersion:1,unit:'tokens',maxInputTokens:20,maxOutputTokens:20,boundSource:'trusted-operation-upper-bound'});parentPort.postMessage({granted:grant.granted})}catch{parentPort.postMessage({granted:false})}finally{store.close()}}
