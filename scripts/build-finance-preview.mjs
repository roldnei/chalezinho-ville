import './verify-finance-target.mjs';
import {mkdir,readdir,copyFile,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {extname} from 'node:path';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
// Only browser assets are public. SQL, tests, tools and dependencies stay out.
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isFile()&&['.html','.js','.css','.svg','.xml'].includes(extname(entry.name))||entry.name==='robots.txt')
  await copyFile(new URL(entry.name,root),new URL(entry.name,out));
}
await cp(new URL('assets/',root),new URL('assets/',out),{recursive:true});
console.log('Preview browser assets built in dist.');

import {releaseProfile} from './release-profile.mjs';
const release=releaseProfile(process.env);
let config=await readFile(new URL('app-config.js',root),'utf8');
if(release.profile==='whatsapp'){
 config=config.replace('releaseProfile:"checkout-development"','releaseProfile:"whatsapp"').replace('features:{feelings:true,guestPublications:true,social:true}','features:{feelings:false,guestPublications:false,social:false}');
 config=config.replace(/bookingEngine:"[^"]+"/,`bookingEngine:"https://${release.ref}.supabase.co/functions/v1/public-consultation"`);
}
if(release.environment==='production'){
 config=config.replaceAll('pxfqmnhqodqyaaqeyjgr',release.ref).replace('environment:"development"','environment:"production"');
 config=config.replace(/supabaseKey:"[^"]+"/,'supabaseKey:'+JSON.stringify(process.env.VILLE_PUBLIC_SUPABASE_KEY));
}
// Admin pages use the authenticated engine; the visitor cannot unlock a write
// operation by changing a URL because the public endpoint rejects those actions.
config+='\nif(["admin.html","experiencias-admin.html","estadias-admin.html","pms-operacao.html","villegram-admin.html","meus-imoveis.html","ops-fase1.html"].some(p=>location.pathname.endsWith("/"+p))){window.CHALEZINHO_CONFIG.bookingEngine=window.CHALEZINHO_CONFIG.supabaseUrl+"/functions/v1/booking-engine";}\n';
await writeFile(new URL('app-config.js',out),config);
console.log('Release profile: '+release.profile+'; target: '+release.environment);
