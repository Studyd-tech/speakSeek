import {readdirSync,readFileSync,writeFileSync,statSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
// Explicit allowlists prevent accidental inclusion of keys, DBs, logs, dependencies, or the archive itself.
function files(root){return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isSymbolicLink()?[]:e.isDirectory()?files(join(root,e.name)):[join(root,e.name)])}
function archive(entries){const buffers=[];for(const [name,content]of entries){const b=Buffer.isBuffer(content)?content:Buffer.from(content);if(Buffer.byteLength(name)>99)throw Error('Archive path too long');const header=Buffer.alloc(512);header.write(name,0,100);const oct=(value,size)=>value.toString(8).padStart(size-1,'0')+'\0';header.write(oct(0o644,8),100);header.write(oct(0,8),108);header.write(oct(0,8),116);header.write(oct(b.length,12),124);header.write(oct(0,12),136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);let checksum=0;for(const value of header)checksum+=value;header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148);buffers.push(header,b,Buffer.alloc((512-b.length%512)%512))}buffers.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(buffers),{level:9})}
mkdirSync('artifacts',{recursive:true});
const source=['package.json','tsconfig.json','.env.example','.gitignore','README.md','DEMO.md','VERIFICATION.md',...files('src'),...files('web'),...files('scripts'),...files('tests')].filter(f=>statSync(f).isFile());
const sourceEntries=source.map(f=>[`agentpulse/${f}`,readFileSync(f)]);
const manifest=JSON.parse(readFileSync('package.json','utf8'));const productionPackage={name:manifest.name,version:manifest.version,private:true,type:'module',engines:manifest.engines,scripts:{start:manifest.scripts.start,'report-event':manifest.scripts['report-event'],status:manifest.scripts.status}};
const runtime=[...files('dist/src'),...files('dist/web'),'scripts/report-event.mjs','scripts/status-line.mjs','scripts/cursor-stop.mjs','scripts/cursor-hooks.example.json','README.md','DEMO.md','VERIFICATION.md','.env.example'];
const productionEntries=runtime.map(f=>[`agentpulse/${f}`,readFileSync(f)]);productionEntries.push(['agentpulse/package.json',Buffer.from(JSON.stringify(productionPackage,null,2)+'\n')]);
const sums=[];for(const [name,entries]of [['agentpulse-source.tar.gz',sourceEntries],['agentpulse-production.tar.gz',productionEntries]]){const content=archive(entries);writeFileSync(`artifacts/${name}`,content);sums.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);console.log(`${name}: ${content.length} bytes`)}writeFileSync('artifacts/SHA256SUMS',sums.join('\n')+'\n');
