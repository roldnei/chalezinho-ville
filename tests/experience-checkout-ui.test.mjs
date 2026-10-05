import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../conta.html',import.meta.url),'utf8');
const js=await readFile(new URL('../account.js',import.meta.url),'utf8');
const offers=await readFile(new URL('../stay-offers.js',import.meta.url),'utf8');
const rid='10000000-0000-4000-8000-000000000001';
const cid='20000000-0000-4000-8000-000000000001';
async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI condition not reached');}
async function setup(amount){
 const dom=new JSDOM(html,{url:'https://qa.example/conta.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.CHALEZINHO_CONFIG={environment:'development',supabaseUrl:'https://qa.example',supabaseKey:'fixture',bookingEngine:'https://qa.example/engine'};
 const reservation={id:rid,property_id:1,status:'confirmed',confirmation_code:'QA',check_in:'2099-10-01',check_out:'2099-10-03',created_at:'2026-10-05',guests:2,total_amount:1000,stay_amount:1000,properties:{name:'Imóvel QA'},payments:[],guarantees:[]};
 const cart={id:cid,reservation_id:rid,amount_cents:amount,purchase_mode:'add',description:'Café de teste'};
 const dataFor=t=>t==='profiles'?{id:rid,role:'guest'}:t==='reservations'?[reservation]:t==='properties'?[{id:1,features:{payment_terms:{max_installments:12,no_interest_installments:6}}}]:t==='post_booking_cart_items'?[cart]:[];
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:rid,email:'qa@example.test'}}}})},from:t=>{const q={};for(const m of ['select','eq','order','in','limit'])q[m]=()=>q;q.then=resolve=>Promise.resolve({data:dataFor(t)}).then(resolve);q.maybeSingle=()=>Promise.resolve({data:dataFor(t)});return q;}})};
 w.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);let data={ok:true,requests:[],cases:[],finance:{guarantees:[],payments:[],events:[]}};
 if(body.action==='config')data={ok:true,payment_settings:{active_provider:'pagbank_sandbox',pix_enabled:true,card_enabled:true}};
 // The checkout endpoint returns a newly created pending charge without a status field.
 if(body.action==='checkout_experience_cart_item')data={ok:true,charge:{id:'charge',kind:'experience_add',amount_cents:amount,description:'Café de teste',expires_at:new Date(Date.now()+600000).toISOString()}};
 if(body.action==='installment_options')data={ok:true,plans:[{installments:1,installment_cents:amount,total_cents:amount,interest_free:true}],indicative:true};
 return {ok:true,json:async()=>data};};
 w.eval(offers);w.eval(js);await wait(()=>w.document.querySelector('[data-checkout-cart]'));
 w.document.querySelector('[data-checkout-cart]').click();await wait(()=>w.document.querySelector('#post-pay-start'));return {dom,w,calls};
}
test('checkout exposes the pending charge immediately without a page reload',async()=>{
 const {dom,w}=await setup(500);try{const section=w.document.querySelector('#pending-payment-section');assert.equal(section.hidden,false);assert.match(section.textContent,/Café de teste/);assert.ok(section.querySelector('[data-cancel-charge="charge"]'));assert.equal(w.document.querySelector('[data-checkout-cart]'),null);}finally{dom.window.close();}
});
test('additional below card minimum explains the limit and keeps Pix available',async()=>{
 const {dom,w,calls}=await setup(100);try{assert.equal(w.document.querySelector('[name="post-method"][value="card"]').disabled,true);assert.equal(w.document.querySelector('[name="post-method"][value="pix"]').checked,true);assert.match(w.document.querySelector('#post-payment-content').textContent,/Cartão disponível a partir de R\$ 5,00/);assert.equal(calls.filter(x=>x.action==='installment_options').length,0);}finally{dom.window.close();}
});
test('additional at card minimum can query installments normally',async()=>{
 const {dom,w,calls}=await setup(500);try{assert.equal(w.document.querySelector('[name="post-method"][value="card"]').disabled,false);assert.ok(calls.some(x=>x.action==='installment_options'));assert.doesNotMatch(w.document.querySelector('#post-payment-content').textContent,/Cartão disponível a partir/);}finally{dom.window.close();}
});
