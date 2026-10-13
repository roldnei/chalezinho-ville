import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const js=readFileSync('operations-workspace.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const fixture=async(fail=false,withTest=false)=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.invalid'};
 const stay={id:'qa-stay',property_id:3,channel:'airbnb',status:'confirmed',check_in:'2026-10-09',check_out:'2026-10-12',version:1};
 const qa={...stay,id:'fixture',guest_name:'Teste Oferta Completa',is_test:true};
 const qaTask={id:'fixture-task',stay_id:qa.id,property_id:3,status:'pending'};
 const summary={arrivals:[],departures:[stay],present:[],expected:[],upcoming:[],pending:[],overdue:[]};
 if(withTest){summary.upcoming.push(qa);summary.departures.push(qa);summary.pending.push(qaTask);summary.overdue.push(qaTask);}
 w.fetch=async()=>({ok:!fail,json:async()=>fail?{error:'operation_unavailable'}:{ok:true,operator:{id:'qa',role:'admin'},server_now:'2026-10-12T19:00:00Z',today:'2026-10-12',properties:[{id:3,name:'Ville Amore'}],stays:withTest?[stay,qa]:[stay],tasks:withTest?[qaTask]:[],sources:[],events:[],templates:[],team:[],summary}});
 w.eval(js);const callbacks=[];await w.VilleOperations.mount(w.document.querySelector('#root'),{sb:{auth:{getSession:async()=>({data:{session:{access_token:'test-only'}}})}},onSummary:x=>callbacks.push(x)});
 return {w,callbacks,close:()=>w.close()};
};
test('both hosts receive shared counts and unknown OTA guest remains explicitly unknown',async()=>{const f=await fixture();try{assert.equal(f.callbacks[0].departures.length,1);const text=f.w.document.body.textContent;assert.match(text,/Hóspede não informado pela fonte/);assert.match(text,/Presença e saída ainda não registradas/);assert.match(text,/12\/10\/2026/);}finally{f.close()}});
test('query failure supplies unknown count and an error instead of empty operation',async()=>{const f=await fixture(true);try{assert.equal(f.callbacks[0],null);assert.match(f.w.document.body.textContent,/Operação indisponível/);assert.equal(f.w.document.querySelectorAll('.ops-kpis').length,0);}finally{f.close()}});

test('attendance uses explicit forms, confirms persisted result and disables duplicate entry/exit',async()=>{
 const f=await fixture();try{
  const w=f.w,original=w.fetch,calls=[];let entered=false,exited=false;
  w.fetch=async(url,options)=>{const p=JSON.parse(options.body);if(p.action==='attendance'){calls.push(p);if(p.operation==='check_in')entered=true;else exited=true;return {ok:true,json:async()=>({ok:true})};}
   const response=await original();const data=await response.json();data.stays[0].checked_in_at=entered?'2026-10-12T15:00:00Z':null;data.stays[0].checked_out_at=exited?'2026-10-12T16:00:00Z':null;return {ok:true,json:async()=>data};};
  w.document.querySelector('[data-stay]').click();w.document.querySelector('[data-attendance="check_in"]').click();assert.equal(calls.length,0);
  assert.match(w.document.body.textContent,/data e o horário atuais/);
  w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(calls.length,1);assert.equal(w.document.querySelector('[data-attendance="check_in"]').disabled,true);assert.match(w.document.body.textContent,/Entrada registrada com sucesso/);
  w.document.querySelector('[data-attendance="check_out"]').click();assert.equal(calls.length,1);
  const note=w.document.querySelector('[name=note]');assert.equal(note.required,true);assert.equal(note.minLength,5);note.value='Equipe confirmou saída';
  w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(calls[1].note,'Equipe confirmou saída');assert.match(w.document.body.textContent,/Saída registrada com sucesso/);assert.equal(w.document.querySelector('[data-attendance="check_out"]').disabled,true);
 }finally{f.close()}
});
test('failed attendance retains visible error and allows retry; guest count is explicit',async()=>{
 const f=await fixture();try{
  const w=f.w;w.document.querySelector('[data-stay]').click();w.document.querySelector('[data-edit]').click();assert.match(w.document.body.textContent,/Total de hóspedes \(adultos e crianças\)/);
  w.document.querySelector('[data-tab="today"]').click();w.document.querySelector('[data-stay]').click();w.document.querySelector('[data-attendance="check_out"]').click();
  w.fetch=async()=>({ok:false,json:async()=>({error:'attendance_not_allowed'})});w.document.querySelector('[name=note]').value='Confirmado';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.match(w.document.querySelector('[data-form-message]').textContent,/Confira as datas/);assert.equal(w.document.querySelector('[type=submit]').disabled,false);
 }finally{f.close()}
});

test('fixtures returned by an older API are excluded from both host counters and operational UI',async()=>{const f=await fixture(false,true);try{assert.equal(f.callbacks[0].departures.length,1);assert.equal(f.callbacks[0].pending.length,0);assert.equal(f.callbacks[0].upcoming.length,0);assert.doesNotMatch(f.w.document.body.textContent,/Teste Oferta Completa/);f.w.document.querySelector('[data-tab="stays"]').click();assert.doesNotMatch(f.w.document.body.textContent,/Teste Oferta Completa/);}finally{f.close()}});
