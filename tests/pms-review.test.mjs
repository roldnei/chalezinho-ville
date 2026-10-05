import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const wait=async p=>{for(let i=0;i<100;i++){if(p())return;await new Promise(r=>setTimeout(r,3))}assert.fail('UI did not settle')};
test('multicalendar, imported details, property filter and reservation tabs preserve correct actions',async()=>{
 const w=new JSDOM(readFileSync('admin.html','utf8'),{url:'https://dev.example/admin.html?view=calendar',runScripts:'outside-only'}).window;
 const $=s=>w.document.querySelector(s);let token='old';const used=[];const month=new Date().toISOString().slice(0,7);
 w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine'};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:token,user:{id:'qa'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin'}})})})};
 w.fetch=async(_,o)=>{used.push(o.headers.Authorization);const b=JSON.parse(o.body);let d={ok:true,requests:[]};if(b.action==='admin_hub')d={ok:true,properties:[{id:1,name:'Signature',active:true},{id:2,name:'Essenza',active:true}],reservations:[{id:'r1',property_id:1,status:'confirmed',guest_name:'QA',check_in:month+'-03',check_out:month+'-05',guests:2}],notifications:[],channel_periods:[{id:'airbnb:one',property_id:2,source:'airbnb',start:month+'-03',end:month+'-05',status:'blocked'}],experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[]};return {ok:true,json:async()=>d}};
 try{w.eval(readFileSync('stay-offers.js','utf8'));w.eval(readFileSync('admin.js','utf8'));await wait(()=>$('#calendar-property'));assert.equal(w.document.querySelectorAll('.calendar-property').length,2);assert.equal(w.document.querySelectorAll('[data-main-view]').length,5);assert.ok($('[data-main-view=reservations]'));
 $('#calendar-property').value='2';$('#calendar-property').dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.calendar-property').length,1);assert.match($('.calendar-property').textContent,/Essenza/);
 $('.calendar-event[data-guest-stay]').click();assert.match($('#admin-modal-content').textContent,/não distingue/);assert.ok($('#event-contact'));$('[data-close-modal]').click();
 token='renewed';$('#admin-refresh').click();await wait(()=>used.includes('Bearer renewed'));
 $('[data-view=reservations]').click();assert.equal(w.document.querySelectorAll('.admin-reservation-list>button').length,2);$('.admin-reservation-list [data-reservation]').click();assert.ok($('.drawer-next-actions [data-checkin]'));assert.equal($('#reservation-finance-summary').parentElement.hidden,true);$('[data-detail-tab="1"]').click();assert.equal($('#reservation-finance-summary').parentElement.hidden,false);assert.equal($('#reservation-guest').parentElement.hidden,true);
 $('[data-view=properties]').click();$('[data-property-edit="2"]').click();$('[data-workspace=details]').click();
 assert.ok($('.property-form-heading #back-workspace'));assert.ok($('.property-form-footer [type=submit]'));assert.equal($('#property-form').elements.name.value,'Essenza');
 $('#back-workspace').click();assert.ok($('[data-workspace=details]'));$('[data-workspace=details]').click();
 const f=$('#property-form');f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!$('.property-form-footer [type=submit]').disabled);
 }finally{w.close()}
});
