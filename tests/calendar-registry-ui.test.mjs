import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('registry creates, edits and deletes links and reloads calendar periods',async()=>{
 const w=new JSDOM(readFileSync('admin.html','utf8'),{url:'https://preview.example/admin.html?view=calendar_links',runScripts:'outside-only'}).window;
 const sources=Array.from({length:25},(_,i)=>({id:String(i),property_id:1,label:'Feed '+i,provider:'ical',feed_url:'https://example.com/'+i+'.ics',enabled:true}));
 let loads=0;
 w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine'};w.confirm=()=>true;
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'qa'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin',full_name:'QA'}})})})};
 w.fetch=async(_,o)=>{const b=JSON.parse(o.body);let d={ok:true};if(b.action==='admin_calendar'){
 if(b.operation==='save'){const s=sources.find(s=>s.id===b.source_id);if(s)Object.assign(s,b);else sources.push({...b,id:'new',provider:'ical'})}
 if(b.operation==='delete')sources.splice(sources.findIndex(s=>s.id===b.source_id),1);
 d={ok:true,sources:structuredClone(sources),exports:[]};
 }if(b.action==='admin_hub'){loads++;d={ok:true,properties:[{id:1,name:'QA',active:true}],reservations:[],notifications:[],channel_periods:sources.map(s=>({id:'calendar:'+s.id,property_id:1,source:'ical',calendar_label:s.label,start:'2099-10-10',end:'2099-10-12'})),experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[]}}
 return {ok:true,json:async()=>d}};
 const $=s=>w.document.querySelector(s),wait=async p=>{for(let i=0;i<100;i++){if(p())return;await new Promise(r=>setTimeout(r,3))}assert.fail('UI did not settle')},submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 try{w.eval(readFileSync('admin.js','utf8'));await wait(()=>$('[data-calendar-manage]'));assert.equal(w.document.querySelectorAll('[data-calendar-manage]').length,25);
 submit($('#choose-calendar-property'));await wait(()=>$('.calendar-source-form'));let f=$('.calendar-source-form');f.elements.label.value='New <unsafe>';f.elements.feed_url.value='https://example.com/new.ics';submit(f);await wait(()=>sources.length===26&&$('.calendar-source-form')!==f);assert.equal(loads,2);
 f=$('[data-source-id="new"]');f.elements.label.value='Edited QA';submit(f);await wait(()=>$('[data-source-id="new"]')!==f);assert.equal(loads,3);
 $('[data-close-modal]').click();$('#back-to-calendar').click();$('#calendar-month').value='2099-10';$('#calendar-month').dispatchEvent(new w.Event('change'));assert.match($('#admin-content').textContent,/Edited QA/);
 $('[data-view="calendar_links"]').click();await wait(()=>$('[data-calendar-manage]'));submit($('#choose-calendar-property'));await wait(()=>$('[data-source-id="new"]'));$('[data-source-id="new"] [data-delete-calendar]').click();await wait(()=>sources.length===25&&!$('[data-source-id="new"]'));assert.equal(loads,4);
 $('[data-close-modal]').click();$('#back-to-calendar').click();assert.doesNotMatch($('#admin-content').textContent,/Edited QA/);
 }finally{w.close()}
});
