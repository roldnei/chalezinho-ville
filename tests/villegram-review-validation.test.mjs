import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('returning a Trip requires an actionable reason before submitting, preserving the review',async()=>{
 const source=readFileSync('villegram-admin.js','utf8'),w=new JSDOM('',{runScripts:'outside-only'}).window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 Object.assign(w,{esc:s=>s||'',api:async body=>{calls.push(body);return {publications:[]}},data:{publications:[]},openReviewQueue:async()=>{},reviewPage:0});
 const mapping=source.match(/ const message=e=>[^\n]+/)[0];
 const fn=source.match(/ function moderate\(p\)\{[^\n]+/)[0];w.eval(mapping+'\n'+fn);
 try{
  w.moderate({id:'qa',author_name:'QA',title:'Teste',caption:'Foto',status:'pending_review',updated_at:'v1'});
  const d=w.document;d.querySelector('[data-reject]').click();assert.equal(calls.length,0);assert.equal(d.activeElement,d.querySelector('textarea'));assert.equal(d.querySelector('[role=status]').textContent,'Informe o motivo para devolver este momento.');
  d.querySelector('textarea').value='Foto duplicada. Escolha outra foto.';d.querySelector('[data-reject]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(calls[0].operation,'community_moderate');assert.equal(calls[0].reason,'Foto duplicada. Escolha outra foto.');assert.equal(calls[0].status,'archived');
 }finally{w.close()}
});
