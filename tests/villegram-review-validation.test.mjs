import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('returning a Trip requires an actionable reason before submitting, preserving the review',async()=>{
 const source=readFileSync('villegram-admin.js','utf8'),w=new JSDOM('',{runScripts:'outside-only'}).window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 Object.assign(w,{esc:s=>s||'',api:async body=>{calls.push(body);return {publications:[]}},data:{publications:[]},openReviewQueue:async()=>{},reviewPage:0});
 const mapping=source.match(/ const message=e=>[^\n]+/)[0];
 const fn=source.slice(source.indexOf(' function moderate(p){'),source.indexOf(' function guestSetup'));w.eval(mapping+'\n'+fn);
 try{
  w.moderate({id:'qa',author_name:'QA',title:'Teste',caption:'Foto',status:'pending_review',updated_at:'v1'});
  const d=w.document;d.querySelector('[data-reject]').click();assert.equal(calls.length,0);assert.equal(d.activeElement,d.querySelector('textarea'));assert.equal(d.querySelector('[role=status]').textContent,'Informe o motivo para devolver este momento.');
  d.querySelector('textarea').value='Foto duplicada. Escolha outra foto.';d.querySelector('[data-reject]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(calls[0].operation,'community_moderate');assert.equal(calls[0].reason,'Foto duplicada. Escolha outra foto.');assert.equal(calls[0].status,'archived');
 }finally{w.close()}
});
function reviewFixture(post,fail=false){
 const source=readFileSync('villegram-admin.js','utf8'),w=new JSDOM('',{runScripts:'outside-only'}).window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 Object.assign(w,{esc:s=>String(s??'').replaceAll('<','&lt;'),api:async body=>{calls.push(body);if(fail)throw Error('edit_conflict');return {publication:{...post,property_id:body.property_id,updated_at:'v2'},publications:[]};},data:{properties:[{id:1,name:'Ville Signature',active:true},{id:2,name:'Ville Essenza',active:true},{id:3,name:'Pausado',active:false}],publications:[post]},renderList:()=>{},openReviewQueue:async()=>{},reviewPage:0});
 w.eval(source.match(/ const message=e=>[^\n]+/)[0]+'\n'+source.slice(source.indexOf(' function moderate(p){'),source.indexOf(' function guestSetup')));w.moderate(post);return {w,calls};
}
const settle=()=>new Promise(r=>setTimeout(r,0));
test('review can save a missing chalet without publishing and approval uses its new revision',async()=>{
 const {w,calls}=reviewFixture({id:'trip',author_name:'Edgar',title:'Trip',status:'pending_review',property_id:null,updated_at:'v1'});
 try{const d=w.document,select=d.querySelector('[data-review-property]');assert.equal(select.value,'');assert.equal(select.options.length,3);select.value='1';d.querySelector('[data-save-property]').click();await settle();assert.equal(calls[0].operation,'community_set_property');assert.equal(calls[0].property_id,1);assert.match(d.querySelector('[role=status]').textContent,/Chalé vinculado/);assert.equal(calls.length,1);
 d.querySelector('[data-approve]').click();await settle();assert.equal(calls[1].operation,'community_moderate');assert.equal(calls[1].updated_at,'v2');assert.equal(calls[1].property_id,1);assert.equal(calls[1].status,'published');
 }finally{w.close();}
});
test('already published Trip supports linking; failed save preserves selection and re-enables the action',async()=>{
 for(const fail of [false,true]){const {w,calls}=reviewFixture({id:'trip',author_name:'Edgar',title:'Trip',status:'published',property_id:null,updated_at:'v1'},fail);try{const d=w.document;assert.equal(d.querySelector('[data-approve]').disabled,true);d.querySelector('select').value='2';d.querySelector('[data-save-property]').click();await settle();assert.equal(calls.length,1);assert.equal(calls[0].operation,'community_set_property');assert.equal(calls[0].property_id,2);assert.equal(d.querySelector('select').value,'2');assert.equal(d.querySelector('[data-save-property]').disabled,false);assert.equal(d.querySelector('[data-approve]').disabled,true);if(fail)assert.match(d.querySelector('[role=status]').textContent,/Outra pessoa alterou/);}finally{w.close();}}
});
test('preview receives the selected chalet before saving, and its guest CTA opens that chalet',async()=>{
 const {w,calls}=reviewFixture({id:'trip',source:'guest_submission',author_name:'Edgar',title:'Trip',caption:'Fim de semana',status:'pending_review',property_id:null,updated_at:'v1'});let preview;
 try{w.openPublicationPreview=async p=>{preview=p};w.document.querySelector('select').value='1';w.document.querySelector('[data-look]').click();await settle();assert.equal(calls.length,0);assert.equal(preview.property_id,1);assert.equal(preview.cta,'property');assert.equal(preview.type,'property');
 w.CHALEZINHO_CONFIG={releaseProfile:'whatsapp'};const fn=readFileSync('villegram.js','utf8').match(/ function publicationMarkup\(c\)\{[^\n]+/)[0];w.eval(fn);const box=w.document.createElement('div');box.innerHTML=w.publicationMarkup({preview:true,publication:{...preview,media:[]},property_id:1,property_name:'Ville Signature',property_url:'chale-premium.html'});assert.equal(box.querySelector('.vg-guest-property').getAttribute('href'),'chale-premium.html');assert.match(box.querySelector('.vg-guest-property').textContent,/Conhecer Ville Signature/);
 }finally{w.close();}
});
