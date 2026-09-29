import './verify-finance-target.mjs';
import {mkdir,readdir,copyFile,cp} from 'node:fs/promises';
import {extname} from 'node:path';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await mkdir(out,{recursive:true});
// Only browser assets are public. SQL, tests, tools and dependencies stay out.
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isFile()&&['.html','.js','.css','.svg','.xml'].includes(extname(entry.name))||entry.name==='robots.txt')
  await copyFile(new URL(entry.name,root),new URL(entry.name,out));
}
await cp(new URL('assets/',root),new URL('assets/',out),{recursive:true});
console.log('Preview browser assets built in dist.');
