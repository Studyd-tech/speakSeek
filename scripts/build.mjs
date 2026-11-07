import {stripTypeScriptTypes} from 'node:module';
import {mkdirSync,copyFileSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
// Node's bundled TypeScript transform makes the production build dependency-free.
for(const dir of ['src','web','tests']){
 mkdirSync(`dist/${dir}`,{recursive:true});
 for(const file of readdirSync(dir))if(file.endsWith('.ts')){
  const source=readFileSync(join(dir,file),'utf8');
  writeFileSync(join('dist',dir,file.replace(/\.ts$/,'.js')),stripTypeScriptTypes(source,{mode:'transform',sourceMap:true,sourceUrl:`../../${dir}/${file}`}));
 }
}
for(const file of ['index.html','style.css']) copyFileSync(`web/${file}`,`dist/web/${file}`);
console.log('Production build ready in dist/ (Node TypeScript transform)');
