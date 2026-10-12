import * as release from '../supabase/functions/_shared/release-policy.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';
import * as publications from '../supabase/functions/_shared/villegram-publications.ts';
import {commentText} from '../supabase/functions/_shared/villegram.ts';
const id='4069a585-7cc6-48ad-9263-567358a45c0c',dev='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
async function handler({project=dev,logged=false,role='guest'}={}){
 let serve,writes=0;const db={auth:{getUser:async()=>({data:{user:logged?{id}:null},error:logged?null:Error('invalid token')})},from(table){const data=table==='profiles'?{role,pms_access_status:'active'}:table==='villegram_publications'?{id,status:'published'}:null;const query={select(){return this},eq(){return this},maybeSingle:async()=>({data,error:null}),insert(){writes++;return this},upsert(){writes++;return this},update(){writes++;return this}};return query;}};
 const source=await readFile(new URL('../supabase/functions/villegram-content/index.ts',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{exports:{},require(name){return name.startsWith('npm:')?{createClient:()=>db}:name.includes('release-policy')?release:name.includes('villegram-publications')?publications:{commentText}},Deno:{env:{get:k=>k==='SUPABASE_URL'?project:'test-key'},serve:fn=>serve=fn},Response,URL,console});
 return {request:body=>serve(new Request(dev+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',...(logged?{authorization:'Bearer test'}:{})},body:JSON.stringify(body)})),writes:()=>writes};
}
test('DEV-only service rejects another project before touching the database',async()=>{const s=await handler({project:'https://other.supabase.co',logged:true,role:'admin'}),r=await s.request({operation:'save'});assert.equal(r.status,403);assert.equal((await r.json()).error,'unknown_release_target');assert.equal(s.writes(),0)});
test('anonymous interactions and guest publication writes require the correct authentication/role',async()=>{const anon=await handler(),like=await anon.request({operation:'like',publication_id:id,liked:true});assert.equal(like.status,401);assert.equal(anon.writes(),0);const guest=await handler({logged:true}),save=await guest.request({operation:'save',publication:{status:'published'}});assert.equal(save.status,403);assert.equal(guest.writes(),0)});
test('public telemetry cannot confirm payment and unauthenticated callers cannot claim a reservation',async()=>{const s=await handler();let r=await s.request({operation:'signals',events:[{event_id:id,publication_id:id,visitor_id:id,session_id:id,view_id:id,kind:'payment_confirmed'}]});assert.equal(r.status,400);r=await s.request({operation:'attribute',reservation_id:id});assert.equal(r.status,401);assert.equal(s.writes(),0)});
test('production social remains authenticated and unknown operations stay closed',async()=>{const s=await handler({project:'https://irxsaladqhbzhkoaclxy.supabase.co'});for(const operation of ['like','comment']){const r=await s.request({operation,publication_id:id});assert.equal(r.status,401)}for(const operation of ['follow','moderate','generate_due']){const r=await s.request({operation});assert.equal(r.status,403)}assert.equal(s.writes(),0)});

// Exercise the HTTP feed operation with catalog/query fixtures, while retaining
// the real eligibility rules. Public DEV must permit review of approved moments.
async function feedHandler(project){
 let serve;const rows=[
  {id:'guest',source:'guest_submission',title:'Momento aprovado',status:'published',published_at:'2020-01-01',media:[]},
  {id:'pending',source:'guest_submission',title:'Ainda em análise',status:'pending_review',published_at:'2020-01-01',media:[]},
  {id:'team',source:'manual',title:'Conheça os chalés',status:'published',published_at:'2020-01-01',media:[]}
 ];
 const db={from(table){let data=table==='villegram_publications'?rows:table==='villegram_automation'?{max_offers:6}:[];return {select(){return this},eq(key,value){if(Array.isArray(data))data=data.filter(r=>r[key]===value);return this},order(){return this},limit(){return this},single(){return this},then(resolve){return Promise.resolve({data,error:null}).then(resolve)}}}};
 const source=await readFile(new URL('../supabase/functions/villegram-content/index.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},require(name){return name.startsWith('npm:')?{createClient:()=>db}:name.includes('release-policy')?release:name.includes('villegram-publications')?publications:name.includes('villegram-community')?{communityPublic:async(_,posts)=>posts}:name.includes('villegram-stay')?{resolvePublicationStay:async p=>p}:{commentText}},Deno:{env:{get:k=>k==='SUPABASE_URL'?project:'test-key'},serve:fn=>serve=fn},Response,URL,console});
 return serve(new Request(project+'/functions/v1/villegram-content?operation=public_feed'));
}
test('public feeds include approved guest moments in DEV and production',async()=>{
 const devResponse=await feedHandler(dev);assert.equal(devResponse.status,200);assert.deepEqual((await devResponse.json()).publications.map(p=>p.id),['guest','team']);
 const prodResponse=await feedHandler('https://irxsaladqhbzhkoaclxy.supabase.co');assert.equal(prodResponse.status,200);assert.deepEqual((await prodResponse.json()).publications.map(p=>p.id),['guest','team']);
});
