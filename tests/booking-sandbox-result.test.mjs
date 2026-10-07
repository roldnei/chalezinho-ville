import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../booking.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderSandboxPayment(d){'),source.indexOf('function renderMockPayment(d){'));
for(const status of ['refused','cancelled','expired'])test(`confirmed ${status} clears uncertain warning and permits a new availability search`,async()=>{
 const dom=new JSDOM('<p id="quote-countdown"></p><div id="mock-payment"></div><p id="checkout-error">A cobrança pode ter sido criada</p>',{url:'https://qa.example',runScripts:'outside-only'}),w=dom.window;
 let searches=0,closed=false;
 w.$=s=>w.document.querySelector(s);w.state={activePayment:{payment_id:'test',status:'awaiting_payment'},rate:{}};
 w.VilleOffers={contractMarkup:()=>''};w.brlC=String;w.esc=String;w.api=async()=>({payment_status:status,reservation_status:'pending_payment'});
 w.setFlowError=t=>w.$('#checkout-error').textContent=t;w.setCheckoutVisible=visible=>{closed=!visible};w.search=async()=>{searches++};
 w.eval(render);w.renderSandboxPayment({payment:{id:'test',amount_cents:100},confirmation_code:'Em verificação'});
 await new Promise(r=>setTimeout(r,0));
 assert.equal(w.$('#checkout-error').textContent,'');assert.equal(w.state.activePayment.status,status);
 assert.match(w.$('#quote-countdown').textContent,/não confirmado|não confirmada/);
 w.$('#sandbox-new-search').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(searches,1);assert.equal(closed,true);assert.equal(w.state.activePayment,null);dom.window.close();
});
test('unknown provider result retains uncertainty and does not offer another payment',async()=>{
 const dom=new JSDOM('<p id="quote-countdown"></p><div id="mock-payment"></div><p id="checkout-error">A cobrança pode ter sido criada</p>',{url:'https://qa.example',runScripts:'outside-only'}),w=dom.window;
 w.$=s=>w.document.querySelector(s);w.state={activePayment:{payment_id:'test',status:'awaiting_payment'},rate:{}};w.VilleOffers={contractMarkup:()=>''};w.brlC=String;w.esc=String;w.api=async()=>{throw Error('network')};
 w.eval(render);w.renderSandboxPayment({payment:{id:'test',amount_cents:100},confirmation_code:'Em verificação'});await new Promise(r=>setTimeout(r,0));
 assert.match(w.$('#checkout-error').textContent,/pode ter sido criada/);assert.equal(w.$('#sandbox-new-search'),null);dom.window.close();
});
