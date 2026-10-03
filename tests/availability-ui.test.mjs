import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';import {availabilityRules} from '../supabase/functions/_shared/availability.ts';
test('availability form saves independent property rules and custom periods',async()=>{
 const w=new JSDOM(readFileSync('admin.html','utf8'),{url:'https://preview.example/admin.html?view=calendar_links',runScripts:'outside-only'}).window;
 const properties=[1,2].map(id=>({id,name:'Chalé '+id,active:true,features:{}}));let saved;
 w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'qa'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin'}})})})};
 w.fetch=async(_,o)=>{const b=JSON.parse(o.body);let d={ok:true};if(b.action==='admin_hub')d={ok:true,properties,reservations:[],notifications:[],channel_periods:[],experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[]};
 if(b.action==='admin_calendar')d={ok:true,sources:[],exports:[]};if(b.action==='admin_availability'){const p=properties.find(p=>p.id===b.property_id);if(b.operation==='save'){p.features.availability=availabilityRules(b.rules);saved=b}d={ok:true,rules:availabilityRules(p.features.availability||{}),updated_at:'v1'}}return {ok:true,json:async()=>d}};
 const $=s=>w.document.querySelector(s),wait=async p=>{for(let i=0;i<100;i++){if(p())return;await new Promise(r=>setTimeout(r,3))}assert.fail('UI did not settle')};
 try{w.eval(readFileSync('admin.js','utf8'));await wait(()=>$('#configure-availability'));$('#choose-calendar-property').elements.property_id.value='2';$('#configure-availability').click();await wait(()=>$('#availability-form'));let f=$('#availability-form');
 f.elements.lead_days.value='2';f.elements.preparation_days.value='1';f.elements.window_months.value='6';f.elements.use_pricelabs_min.checked=false;
 $('#add-custom-stay').click();f.elements.custom_start.value='2026-12-24';f.elements.custom_end.value='2026-12-31';f.elements.custom_min.value='4';f.elements.custom_max.value='10';
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>saved&&$('#availability-form')!==f);
 assert.equal(saved.property_id,2);assert.equal(saved.rules.custom_stays[0].min_nights,4);assert.equal(saved.rules.lead_days,2);assert.equal(properties[0].features.availability,undefined);assert.match($('#availability-message').textContent,/salva/);
 assert.equal($('#availability-form').elements.window_months.value,'6');assert.equal($('#availability-form').elements.use_pricelabs_min.checked,false);
 }finally{w.close()}
});
