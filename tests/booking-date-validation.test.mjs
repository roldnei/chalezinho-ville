import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('booking.js','utf8');
test('date errors identify the field, preserve input, and recover without stale accessibility errors',async()=>{
 const w=new JSDOM('<input id="book-in" type="date"><input id="book-out" type="date"><select id="book-guests"><option>2</option></select><div id="booking-results"></div><div id="booking-period"></div><div id="availability-count"></div><div id="booking-list"></div>',{runScripts:'outside-only'}).window;
 let requests=0;
 Object.assign(w,{$:s=>w.document.querySelector(s),searchSequence:0,state:{},PUBLIC:true,clearWhatsApp(){},error(){},nights:()=>2,track(){},persistSelection(){},ENGINE:'https://test.invalid',renderResults(){},fetch:async()=>{requests++;return {ok:true,json:async()=>({ok:true,listings:[]})}}});
 w.eval(source.slice(source.indexOf('async function search('),source.indexOf('function renderResults(')));
 const input=w.document.querySelector('#book-in'),out=w.document.querySelector('#book-out');
 try{
  await w.search();assert.equal(w.document.activeElement,input);assert.equal(w.document.querySelector('#book-in-error').textContent,'Escolha a data de entrada.');
  input.value='2099-10-20';await w.search();assert.equal(w.document.activeElement,out);assert.match(w.document.querySelector('#book-out-error').textContent,/data de saída/);
  out.value='2099-10-19';await w.search();assert.equal(out.value,'2099-10-19');assert.match(w.document.querySelector('#book-out-error').textContent,/depois da entrada/);assert.equal(requests,0);
  input.value='2000-01-01';await w.search();assert.match(w.document.querySelector('#book-in-error').textContent,/a partir de hoje/);
  input.value='2099-10-20';out.value='2099-10-22';await w.search();assert.equal(requests,1);assert.equal(w.document.querySelector('[aria-invalid], [aria-describedby], .booking-field-error'),null);
 }finally{w.close()}
});
