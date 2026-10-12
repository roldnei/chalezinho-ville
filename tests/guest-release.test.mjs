import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {releaseFeatures} from '../scripts/release-profile.mjs';
const source=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const dev='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
test('Ville Moments is independent of checkout and Feelings in both environments',()=>{
 assert.deepEqual(releaseFeatures({environment:'development',profile:'whatsapp'}),{feelings:false,guestPublications:true,social:true});
 assert.deepEqual(releaseFeatures({environment:'production',profile:'whatsapp'}),{feelings:false,guestPublications:true,social:true});
 assert.deepEqual(releaseFeatures({environment:'development',profile:'checkout-development'}),{feelings:true,guestPublications:true,social:true});
});
test('WhatsApp account exposes Moments and preserves private navigation in both environments',async()=>{
 for(const environment of ['development','production']){
  const dom=new JSDOM(await source('conta.html'),{url:dev+'/conta.html',runScripts:'outside-only'}),w=dom.window;
  try{
   w.CHALEZINHO_CONFIG={environment,releaseProfile:'whatsapp',features:releaseFeatures({environment,profile:'whatsapp'})};
   w.eval(await source('launch-ui.js'));w.eval(await source('account-navigation.js'));
   const button=w.document.querySelector('[data-account-mode="social"]');
   assert.equal(w.getComputedStyle(button).display==='none',false);
   assert.equal(w.document.querySelector('#community-root').hidden,false);
   w.document.querySelector('[data-account-mode="private"]').click();
   assert.equal(w.document.querySelector('#account-private').hidden,false);
   assert.equal(w.document.querySelector('#community-root').hidden,true);
  }finally{w.close()}
 }
});
test('Feelings disabled prevents creating its toolbar while the full DEV editor stays available',async()=>{
 for(const feelings of [false,true]){
  const dom=new JSDOM('<main id="screen"></main>',{runScripts:'outside-only'}),w=dom.window;
  try{
   w.CHALEZINHO_CONFIG={features:{feelings}};
   w.eval(await source('villegram-timeline.js'));w.eval(await source('villegram-timeline-editor.js'));
   const editor=w.VillegramTimelineEditor.editor({screen:w.document.querySelector('#screen'),getMedia:()=>[],getSelected:()=>0,onRestore(){},onSelect(){},onChange(){},onMove(){},isBusy:()=>false,onBusy(){}});
   assert.equal(editor===null,!feelings);
   assert.equal(Boolean(w.document.querySelector('[data-tl-feelings]')),feelings);
   assert.equal(Boolean(w.document.querySelector('[data-tl-quick]')),feelings);
  }finally{w.close()}
 }
});
test('private DEV account reads existing requests through authenticated booking engine, not public consultation',async()=>{
 const dom=new JSDOM(await source('conta.html'),{url:dev+'/conta.html#reservas',runScripts:'outside-only'}),w=dom.window,calls=[];
 try{
  w.CHALEZINHO_CONFIG={environment:'development',releaseProfile:'whatsapp',supabaseUrl:dev,supabaseKey:'unit-public-key',bookingEngine:dev+'/functions/v1/public-consultation'};
  const sb={auth:{getSession:async()=>({data:{session:{access_token:'unit-session',user:{id:'unit-user'}}}})},from(table){const chain=new Proxy({},{get(_target,key){if(key==='then')return resolve=>Promise.resolve({data:table==='profiles'?{}:[],error:null}).then(resolve);return()=>chain}});return chain}};
  w.supabase={createClient:()=>sb};
  w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return {ok:true,json:async()=>({ok:true,requests:[],payment_settings:{}})}};
  w.eval(await source('account.js'));
  await new Promise(resolve=>setTimeout(resolve,40));
  const request=calls.find(c=>c.body.action==='same_day_request');
  assert.ok(request);assert.equal(request.url,dev+'/functions/v1/booking-engine?action=same_day_request');
  assert.equal(request.options.headers.Authorization,'Bearer unit-session');assert.equal(request.body.operation,'list');
  assert.match(w.document.querySelector('#same-day-requests').textContent,/Nenhum pedido enviado/);
  assert.equal(calls.some(c=>['checkout','hold','pay','create_reservation'].includes(c.body.action)),false);
 }finally{w.close()}
});
