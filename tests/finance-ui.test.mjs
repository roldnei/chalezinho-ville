import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
const js=await readFile(new URL('../admin.js',import.meta.url),'utf8');
const rid='10000000-0000-4000-8000-000000000001',gid='20000000-0000-4000-8000-000000000001';
async function setup(captured=false,withoutGuarantee=false){
 const calls=[];
 const hub={ok:true,properties:[{id:1,name:'Ville Essenza',code:'CH2',features:{}}],reservations:[{id:rid,property_id:1,guest_name:'Hóspede QA',confirmation_code:'QA-189',status:'confirmed',check_in:'2026-10-01',check_out:'2026-10-03',created_at:'2026-09-28',total_amount:1172,guests:2}],
 guarantees:[{id:gid,reservation_id:rid,provider:'pagbank_sandbox',provider_authorization_id:'CHAR_QA',amount_cents:50000,captured_amount_cents:captured?18900:0,refunded_amount_cents:0,status:captured?'captured':'guaranteed',created_at:'2026-09-28',incidents:[]}],payments:[],experience_orders:[],charges:[],modifications:[],notes:[],ledger:[],notifications:[],integrations:[],settings:{},calendar_blocks:[],channel_periods:[],channel_health:{},cancellation_policies:[]};
 if(withoutGuarantee)hub.guarantees=[];
 const incidents=[];
 const dom=new JSDOM(html,{url:'http://localhost/admin.html?view=reservations',runScripts:'outside-only'}),w=dom.window;
 w.CHALEZINHO_CONFIG={supabaseUrl:'http://localhost',supabaseKey:'test',bookingEngine:'/engine',refundEngine:'/refund',guaranteeEngine:'/guarantee'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:rid,email:'qa@example.test'}}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'admin',full_name:'QA'}})})})})})};
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);
  let result={ok:true};
  if(body.action==='admin_hub')result=structuredClone(hub);
  if(body.action==='reservation_cancel_request')result.requests=[];
  if(body.action==='reservation_refund_action')result.cases=[];
  if(body.action==='reservation_finance')result.finance={events:[],events_count:0,paid_cents:117200,refunded_cents:0,net_received_cents:117200,pending_additional_cents:0,pending_refund_cents:0,damage_captured_cents:captured?18900:0,damage_refunded_cents:0,total_net_received_cents:117200+(captured?18900:0)};
  if(body.action==='report_incident')hub.guarantees[0].incidents.push({id:'30000000-0000-4000-8000-000000000001',description:body.description,requested_capture_cents:body.amount_cents,category:body.category,decision:'pending',status:'open'});
  if(body.action==='refund')result.refund={state:'uncertain',confirmed_cents:0,provider_error_code:'40008'};
  if(body.action==='ops_settings_action')result.settings=body;
  if(body.action==='reservation_incident')incidents.push({id:'incident-qa',reservation_id:rid,description:body.description,decision:'pending',requested_capture_cents:body.amount_cents});
  if(body.action==='reservation_finance')result.finance.incidents=structuredClone(incidents);
  return {ok:true,json:async()=>result};
 };
 w.eval(js);
 for(let i=0;i<30&&!w.document.querySelector('[data-reservation]');i++)await new Promise(r=>setTimeout(r,5));
 const res=w.document.querySelector('[data-reservation]');assert.ok(res,'reservation rendered');res.click();
 await new Promise(r=>setTimeout(r,10));
 return {dom,w,calls,hub};
}
test('reservation opens guarantee and financial history through actual buttons',async()=>{
 const {w,dom,calls}=await setup();
 assert.ok(calls.some(c=>c.action==='reservation_finance'));
 assert.match(w.document.querySelector('#reservation-finance-summary').textContent,/Recebido líquido/);
 w.document.querySelector('#reservation-detail [data-guarantee]').click();
 assert.match(w.document.querySelector('#admin-modal-content').textContent,/QA-189/);
 assert.ok(w.document.querySelector('[data-guarantee-action="report_incident"]'));
 dom.window.close();
});
test('reservation without a guarantee still records an occurrence and does not call a payment endpoint',async()=>{
 const {w,dom,calls}=await setup(false,true);
 w.document.querySelector('#new-reservation-incident').click();
 const f=w.document.querySelector('#reservation-incident-form');
 f.elements.description.value='Objeto encontrado na vistoria';f.elements.amount.value='0';
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(r=>setTimeout(r,20));
 assert.ok(calls.find(c=>c.action==='reservation_incident'&&c.amount_cents===0));
 assert.match(w.document.querySelector('#reservation-incidents').textContent,/Objeto encontrado/);
 assert.equal(calls.some(c=>['capture','start_payment','refund'].includes(c.action)),false);
 dom.window.close();
});
test('occurrence is recorded independently without capture request',async()=>{
 const {w,dom,calls}=await setup();w.document.querySelector('#reservation-detail [data-guarantee]').click();
 const f=w.document.querySelector('#guarantee-form');
 // jsdom lacks named form property access; browser standard properties are mirrored for this fixture.
 for(const el of f.elements)if(el.name)Object.defineProperty(f,el.name,{value:el,configurable:true});
 f.description.value='Vistoria sem cobrança';f.amount.value='0';
 w.document.querySelector('[data-guarantee-action="report_incident"]').click();
 await new Promise(r=>setTimeout(r,20));
 const request=calls.find(c=>c.action==='report_incident');assert.ok(request);assert.equal(request.amount_cents,0);assert.ok(request.operation_key);assert.equal(calls.some(c=>c.action==='capture'),false);
 dom.window.close();
});
test('captured guarantee offers refund with bounded amount and does not claim unknown refund succeeded',async()=>{
 const {w,dom,calls}=await setup(true);w.document.querySelector('#reservation-detail [data-guarantee]').click();
 const f=w.document.querySelector('#guarantee-form');for(const el of f.elements)if(el.name)Object.defineProperty(f,el.name,{value:el,configurable:true});
 assert.equal(f.refund_amount.max,'189');f.refund_amount.value='100';f.refund_reason.value='Devolução de teste';
 w.document.querySelector('[data-guarantee-action="refund"]').click();await new Promise(r=>setTimeout(r,20));
 assert.equal(calls.find(c=>c.action==='refund').amount_cents,10000);
 assert.match(w.document.querySelector('.admin-form-message').textContent,/Estorno pendente/);
 assert.doesNotMatch(w.document.querySelector('.admin-form-message').textContent,/Estorno confirmado/);
 dom.window.close();
});
test('administrative payment settings submit explicit methods, gateway and deadlines',async()=>{
 const {w,dom,calls}=await setup();w.document.querySelector('[data-view="settings"]').click();
 const f=w.document.querySelector('#admin-payment-settings');
 for(const el of f.elements)if(el.name)Object.defineProperty(f,el.name,{value:el,configurable:true});
 f.elements.active_provider.value='pagbank_sandbox';f.elements.pix_enabled.checked=true;f.elements.card_enabled.checked=false;
 f.elements.pix_expiration_minutes.value='15';f.elements.post_booking_payment_minutes.value='30';f.elements.modification_payment_deadline_hours.value='24';
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 const payload=calls.find(c=>c.action==='ops_settings_action');assert.equal(payload.card_enabled,false);assert.equal(payload.pix_enabled,true);assert.equal(payload.active_provider,'pagbank_sandbox');assert.equal(payload.post_booking_payment_minutes,30);
 assert.match(f.querySelector('.admin-form-message').textContent,/Regras atualizadas/);dom.window.close();
});
