import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../booking.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function saveResume(){'),source.indexOf('function renderCheckoutRates(){'));
const renderer=source.slice(source.indexOf('function renderSandboxPayment(d){'),source.indexOf('function renderMockPayment(d){'));
const html=readFileSync(new URL('../reservar.html',import.meta.url),'utf8');
function fixture(session={user:{id:'guest'}}){
 const dom=new JSDOM(html,{url:'https://qa.example/reservar.html?resume=1',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.$=s=>w.document.querySelector(s);w.state={};w.sb={auth:{getSession:async()=>({data:{session}})}};
 w.syncStayModes=()=>{};w.setCheckoutVisible=()=>{};w.showStep=n=>{w.$('#checkout-panel').dataset.step=n;w.$('#step-next').hidden=n===6};
 w.setFlowError=()=>{};w.VilleOffers={contractMarkup:()=>''};w.brlC=String;w.esc=String;
 w.api=async(action,body)=>{calls.push({action,body});return {reservation_status:'confirmed',payment_status:'paid'}};
 w.generateQuote=()=>{throw Error('must not reprice an existing payment')};w.openFinalization=()=>{throw Error('must not reopen payment form')};
 const saved={entryUrl:'/reservar.html?resume=1',property:{id:1,name:'QA'},check_in:'2026-10-01',check_out:'2026-10-03',guests:2,stage:'finalize',rateConfirmed:true,quote:{expires_at:'2020-01-01'},payment:{id:'payment-qa',userId:'guest',view:{payment:{id:'payment-qa',amount_cents:12345},confirmation_code:'QA'}}};
 w.sessionStorage.setItem('chalezinho_booking_resume',JSON.stringify(saved));w.eval(functions+renderer);
 return {dom,w,calls};
}
test('paid reload restores existing payment and queries status even with expired quote',async()=>{
 const {dom,w,calls}=fixture();try{
  assert.equal(await w.restoreResume(),true);await new Promise(r=>setTimeout(r,0));
  assert.equal(w.$('#checkout-panel').dataset.step,'6');assert.equal(w.$('#step-next').hidden,true);
  assert.match(w.$('#sandbox-payment-result').textContent,/Reserva confirmada/);
  assert.deepEqual(calls.map(c=>c.action),['pagbank_sandbox_status']);assert.equal(calls[0].body.payment_id,'payment-qa');
  assert.equal(JSON.parse(w.sessionStorage.getItem('chalezinho_booking_resume')).payment.id,'payment-qa');
 }finally{dom.window.close()}
});
test('unavailable status keeps existing payment pending without another checkout',async()=>{
 const {dom,w}=fixture();try{w.api=async()=>{throw Error('offline')};await w.restoreResume();await new Promise(r=>setTimeout(r,0));
 assert.equal(w.$('#step-next').hidden,true);assert.match(w.$('#sandbox-payment-result').textContent,/Aguardando/);assert.equal(w.state.activePayment.status,'awaiting_payment');
 }finally{dom.window.close()}
});
test('expired session preserves receipt but requires login without displaying its details',async()=>{
 const {dom,w,calls}=fixture(null);try{await w.restoreResume();assert.equal(calls.length,0);assert.match(w.$('#mock-payment').textContent,/Entre na mesma conta/);assert.doesNotMatch(w.$('#mock-payment').textContent,/12345/);assert.ok(w.sessionStorage.getItem('chalezinho_booking_resume'))}finally{dom.window.close()}
});
test('another account cannot resume the previous account payment',async()=>{
 const {dom,w,calls}=fixture({user:{id:'other'}});try{assert.equal(await w.restoreResume(),false);assert.equal(calls.length,0);assert.equal(w.sessionStorage.getItem('chalezinho_booking_resume'),null)}finally{dom.window.close()}
});
