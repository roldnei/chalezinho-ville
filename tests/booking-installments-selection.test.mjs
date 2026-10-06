import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const source=readFileSync('booking.js','utf8');
const settle=()=>new Promise(r=>setTimeout(r,0));
for(const available of [true,false])test(`card quote ${available?'preserves six installments':'requires a new selection when six installments are unavailable'}`,async()=>{
 const w=new JSDOM(readFileSync('reservar.html','utf8'),{url:'https://qa.example',runScripts:'outside-only'}).window;
 let offers=[1,6,12];
 Object.assign(w,{$:s=>w.document.querySelector(s),esc:String,brlC:String,stayNights:()=>2,pagbankSandbox:true,downloadPolicyDocument:()=>{},state:{property:{name:'QA',features:{payment_terms:{max_installments:12,no_interest_installments:6}}},rate:{quote_option_id:'q1',total_amount_cents:120000,stay_amount_cents:120000,cancellation_policy:{title:'QA',body:'QA',version:'1'}},config:{payment_settings:{active_provider:'pagbank_sandbox',pix_enabled:true,card_enabled:true,pix_expiration_minutes:15}}},api:async()=>({plans:offers.map(n=>({installments:n,installment_cents:120000/n,total_cents:120000,interest_free:true})),expires_at:new Date(Date.now()+60000).toISOString()})});
 w.eval(readFileSync('stay-offers.js','utf8'));w.eval(source.slice(source.indexOf('function paymentChoice(){'),source.indexOf('async function maybeOfferUpsell'))+source.slice(source.indexOf('function renderSelectionSummary(){'),source.indexOf('function loadPagBankSdk')));
 try{w.renderSummary();await settle();const select=w.document.querySelector('#installments');select.value='6';offers=available?[1,6]:[1,3];w.document.querySelector('#card-number').value='453962';[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Consultar parcelas novamente').click();await settle();assert.equal(select.value,available?'6':'');assert.equal(w.paymentChoice().installments,available?6:0);assert.equal(select.disabled,false)}finally{w.close()}
});
