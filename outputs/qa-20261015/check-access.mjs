import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile('app-config.js','utf8'),url=source.match(/supabaseUrl:"([^"]+)"/)[1],key=source.match(/supabaseKey:"([^"]+)"/)[1];
assert.equal(url,'https://pxfqmnhqodqyaaqeyjgr.supabase.co');
const {password}=JSON.parse(await readFile('C:/Users/Roldn/AppData/Local/Temp/ville-qa-20261015.json','utf8'));
async function login(email){const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();assert.equal(r.status,200);return d.access_token;}
async function api(token,body){const r=await fetch(url+'/functions/v1/villegram-content',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const a=await login('qa.moments.20261015.a@example.com'),b=await login('qa.moments.20261015.b@example.com');
const results=[];
async function check(name,token,body,status,error){const r=await api(token,body);assert.equal(r.status,status,name);if(error)assert.equal(r.data.error,error,name);results.push({name,status,error:r.data.error||null});return r;}
await check('anonymous cannot open guest editor',null,{operation:'guest_list'},401,'authentication_required');
await check('guest cannot moderate',b,{operation:'community_moderate',id:'446a734e-73d1-4fc2-a05b-382ea302bcc5',status:'published'},403,'admin_required');
await check('guest cannot edit another author',b,{operation:'guest_save',id:'446a734e-73d1-4fc2-a05b-382ea302bcc5',publication:{}},404,'publication_unavailable');
const own=await check('public account without reservation can open editor',a,{operation:'guest_list'},200);
assert.ok(own.data.publications.some(p=>p.id==='446a734e-73d1-4fc2-a05b-382ea302bcc5'));
const withStay=await check('public account with reservation can open editor',b,{operation:'guest_list'},200);
assert.equal(withStay.data.suggested_property_id,2);
const visible=await check('approved post visible to anonymous visitor',null,{operation:'community_profile',handle:'qa_sem_reserva_1510'},200);
assert.ok(visible.data.publications.some(p=>p.id==='446a734e-73d1-4fc2-a05b-382ea302bcc5'));
const profile=own.data.profile;
try{
 await check('test author can make profile private',a,{operation:'community_save_profile',profile:{...profile,is_public:false}},200);
 await check('private profile is hidden from visitors',null,{operation:'community_profile',handle:profile.handle},404,'profile_unavailable');
 await check('private author receives specific posting prerequisite',a,{operation:'guest_list'},403,'public_profile_required');
}finally{await check('restore test public profile',a,{operation:'community_save_profile',profile:{...profile,is_public:true}},200);}
await writeFile('outputs/qa-20261015/access-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
