import {Store,seed} from './store.js';
import {join} from 'node:path';
import {root} from './config.js';
const store=new Store(join(root,'.local','agentpulse.sqlite'));if(!store.session('sample-checkout')){seed(store);console.log('SIMULATED sessions seeded. No notifications sent.')}else console.log('Sample sessions already present; preserved existing timeline.');store.close();
