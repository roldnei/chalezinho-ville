import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as release from '../supabase/functions/_shared/release-policy.ts';
import * as social from '../supabase/functions/_shared/villegram.ts';
const project='https://irxsaladqhbzhkoaclxy.supabase.co',id='357cca8d-b0c2-4d68-ac72-d21ac7164e43';
function compile(file,globals){let handler;vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},URL,Response,AbortSignal,console,Deno:{env:{get:()=>project},serve:h=>handler=h},...globals});return handler;}
test('legacy offer social forwards only social fields and preserves authentication without exposing payments',async()=>{
 const calls=[];const h=compile('supabase/functions/public-consultation/index.ts',{require:()=>release,fetch:async(url,opts)=>{calls.push({url,opts});return Response.json({ok:true,likes:0,comments:[]})}});
 const send=body=>h(new Request(project,{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)}));
 for(const operation of ['list','like','comment','remove'])assert.equal((await send({action:'villegram',operation,offer_id:id,liked:true,persist:true,provider:'production'})).status,200);
 for(const call of calls){assert.equal(call.url,project+'/functions/v1/villegram-content');assert.equal(call.opts.headers.Authorization,'Bearer fixture');const body=JSON.parse(call.opts.body);assert.equal(body.offer_id,id);assert.equal(body.persist,undefined);assert.equal(body.provider,undefined);}
 for(const body of [{action:'start_payment'},{action:'villegram',operation:'start_payment'},{action:'villegram',operation:'save'}])assert.equal((await send(body)).status,403);
 assert.equal(calls.length,4);
});
test('production offer counters are readable, mutations require login and test offers stay hidden',async()=>{
 let offerName='Escapada';const db={auth:{getUser:async()=>({data:{user:null}})},from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:table==='stay_offers'?{id,name:offerName,status:'active'}:null}),then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}};return q;}};
 const h=compile('supabase/functions/villegram-content/index.ts',{require:name=>name.startsWith('npm:')?{createClient:()=>db}:name.includes('release-policy')?release:name.endsWith('/villegram.ts')?social:{}});
 const send=operation=>h(new Request(project,{method:'POST',body:JSON.stringify({operation,offer_id:id,liked:true})}));
 const r=await send('social');assert.equal(r.status,200);const body=await r.json();assert.equal(body.likes,0);assert.equal(body.comments_count,0);
 for(const op of ['like','comment','remove_comment'])assert.equal((await send(op)).status,401);
 offerName='[DEV] Test';assert.equal((await send('social')).status,404);
});
