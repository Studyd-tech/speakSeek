import {watch} from 'node:fs';
import {spawn} from 'node:child_process';
await import('./build.mjs');
let server=spawn(process.execPath,['dist/src/main.js'],{stdio:'inherit'}),timer;
let generation=0;
for(const dir of ['src','web'])watch(dir,()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{await import(`./build.mjs?generation=${++generation}`);server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));server=spawn(process.execPath,['dist/src/main.js'],{stdio:'inherit'})}catch{console.error('Rebuild failed; fix the source and save again.')}},300)});
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{server.kill(s);process.exit(0)});
