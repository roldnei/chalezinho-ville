import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {communityOperation} from '../supabase/functions/_shared/villegram-community.ts';
const tick=()=>new Promise(r=>setTimeout(r,15));
const rows=[{id:'pending',source:'guest_submission',status:'pending_review'},{id:'published',source:'guest_submission',status:'published'},{id:'draft',source:'guest_submission',status:'draft'},{id:'team',source:'manual',status:'pending_review'}];
function database(error=null){return {from(table){assert.equal(table,'villegram_publications');let found=[...rows],head=false;return {select(_columns,opts){head=opts.head;return this},eq(key,value){found=found.filter(r=>r[key]===value);return this},order(){return this},range(start,end){found=found.slice(start,end+1);return this},then(fn){return Promise.resolve({data:head?null:found,count:found.length,error}).then(fn)}}}}}
test('review alerts and queue only disclose pending guest posts to authorized approvers',async()=>{
 const ctx={body:{},u:{id:'admin'},isAdmin:true,db:database(),resolveMedia:async p=>p};
 const count=await communityOperation({...ctx,op:'community_review_status'});assert.deepEqual(count.body,{ok:true,can_moderate:true,pending_count:1});
 const queue=await communityOperation({...ctx,op:'community_review_queue'});assert.deepEqual(queue.body.publications.map(p=>p.id),['pending']);assert.equal(queue.body.total,1);
 const denied=await communityOperation({...ctx,isAdmin:false,db:{},op:'community_review_status'});assert.deepEqual(denied.body,{ok:true,can_moderate:false});assert.equal((await communityOperation({...ctx,isAdmin:false,db:{},op:'community_review_queue'})).status,403);
 assert.equal((await communityOperation({...ctx,u:null,db:{},op:'community_review_status'})).status,401);assert.equal((await communityOperation({...ctx,u:{is_anonymous:true},db:{},op:'community_review_status'})).status,401);
 assert.equal((await communityOperation({...ctx,op:'community_review_queue',body:{page:-1}})).body.error,'invalid_page');await assert.rejects(communityOperation({...ctx,db:database({message:'offline'}),op:'community_review_status'}),/community_unavailable/);
});
async function notice(){
 const dom=new JSDOM('<aside id="villegram-review-notice" hidden></aside>',{url:'https://dev.test/conta.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let session={user:{id:'admin'},access_token:'test'},reply={ok:true,can_moderate:true,pending_count:2},authCallback,calls=0,fail=false;
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.test',supabaseKey:'public'};w.AbortSignal.timeout=()=>undefined;
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:cb=>authCallback=cb}})};
 w.fetch=async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).operation,'community_review_status');if(fail)throw Error('offline');return {ok:true,json:async()=>reply}};
 w.eval(await readFile(new URL('../villegram-review-notifications.js',import.meta.url),'utf8'));await tick();
 return {dom,w,host:w.document.querySelector('aside'),get calls(){return calls},reply:v=>reply=v,fail:v=>fail=v,auth:s=>{session=s;authCallback(s?'SIGNED_IN':'SIGNED_OUT',s)}};
}
test('approver sees a live persistent count and direct queue link, errors do not claim zero, logout removes it',async()=>{
 const x=await notice();assert.equal(x.host.hidden,false);assert.equal(x.host.querySelector('b').textContent,'2');assert.equal(x.host.querySelector('a').getAttribute('href'),'villegram-admin.html?review=pending');
 x.fail(true);x.w.document.dispatchEvent(new x.w.Event('villegram-review-changed'));await tick();assert.equal(x.host.hidden,false);assert.match(x.host.querySelector('small').textContent,/indisponível/);
 x.fail(false);x.reply({ok:true,can_moderate:true,pending_count:1});x.w.document.dispatchEvent(new x.w.Event('villegram-review-changed'));await tick();assert.equal(x.host.querySelector('strong').textContent,'1 momento aguardando aprovação');
 x.reply({ok:true,can_moderate:true,pending_count:0});x.w.document.dispatchEvent(new x.w.Event('villegram-review-changed'));await tick();assert.equal(x.host.hidden,true);
 x.reply({ok:true,can_moderate:true,pending_count:3});x.w.document.dispatchEvent(new x.w.Event('villegram-review-changed'));await tick();assert.equal(x.host.hidden,false);x.auth(null);assert.equal(x.host.hidden,true);x.dom.window.close();
});
test('hidden tabs do not poll and guest accounts cannot keep an approver badge after switching identity',async()=>{
 const x=await notice();Object.defineProperty(x.w.document,'hidden',{configurable:true,value:true});const before=x.calls;x.w.document.dispatchEvent(new x.w.Event('villegram-review-changed'));await tick();assert.equal(x.calls,before);
 x.reply({ok:true,can_moderate:false});Object.defineProperty(x.w.document,'hidden',{configurable:true,value:false});x.auth({user:{id:'guest'},access_token:'guest'});await tick();assert.equal(x.host.hidden,true);assert.equal(x.host.querySelector('[role=status]').textContent,'');x.dom.window.close();
});
