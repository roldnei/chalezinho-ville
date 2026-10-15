import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const js=readFileSync('operations-workspace.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('today indicators filter stays and the corresponding task stage; clear restores all',async()=>{
 const f=await fixture();try{
  const w=f.w,base=await (await w.fetch()).json(),s=base.stays[0];
  const tasks=['preparation','departure'].map(stage=>({id:stage,stay_id:s.id,property_id:s.property_id,stage,status:'pending',scheduled_for:'2026-10-12T14:00:00Z',due_at:'2026-10-12T15:00:00Z'}));
  base.tasks=tasks;base.summary.pending=tasks;base.summary.arrivals=[];
  w.fetch=async()=>({ok:true,json:async()=>base});w.document.querySelector('[data-refresh]').click();await tick();
  w.document.querySelector('[data-today-filter="departures"]').click();
  assert.equal(w.document.querySelectorAll('[data-stay]').length,1);assert.deepEqual([...w.document.querySelectorAll('[data-task]')].map(x=>x.dataset.task),['departure']);
  assert.equal(w.document.querySelector('[data-today-filter="departures"]').getAttribute('aria-pressed'),'true');
  w.document.querySelector('[data-today-filter="arrivals"]').click();assert.equal(w.document.querySelectorAll('[data-stay],[data-task]').length,0);
  w.document.querySelector('[data-clear-filter]').click();assert.equal(w.document.querySelectorAll('[data-task]').length,2);assert.equal(w.document.querySelector('[data-clear-filter]'),null);
 }finally{f.close()}
});
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


async function taskFixture(stage,photos=[]){
 const f=await fixture(),w=f.w,original=w.fetch,calls=[];
 w.indexedDB={open(){const req={};setTimeout(()=>{req.result={close(){},transaction(){const tx={objectStore:()=>({getAll:()=>({result:[]})})};setTimeout(()=>tx.oncomplete?.(),0);return tx}};req.onsuccess()},0);return req}};
 const task={id:'guided-task',stay_id:'qa-stay',property_id:3,stage,title:'Conferir',status:'pending',template_version:1,checklist_snapshot:['Banheiro','Cozinha']};
 w.fetch=async(url,options)=>{const p=options?JSON.parse(options.body):{};calls.push(p);if(p.action==='task')return {ok:true,json:async()=>({ok:true,task,results:[],photos})};if(p.action==='complete_task'){task.status='inspection';return {ok:true,json:async()=>({ok:true})}}const response=await original();const data=await response.json();data.tasks=[task];data.summary.pending=[task];return {ok:true,json:async()=>data}};
 w.document.querySelector('[data-refresh]').click();await tick();w.document.querySelector('[data-task]').click();await new Promise(r=>setTimeout(r,20));return {...f,calls};
}
test('entry walks one item at a time and saves only once at the end',async()=>{
 const f=await taskFixture('preparation',[0,1].map(item_index=>({item_index,url:'photo.webp',stage:'preparation'})));try{const d=f.w.document;
 assert.match(d.querySelector('.ops-wizard h3').textContent,/Banheiro/);assert.equal(d.querySelectorAll('[data-item]').length,0);
 d.querySelector('[data-next]').click();assert.match(d.querySelector('.ops-wizard h3').textContent,/Cozinha/);
 assert.equal(f.calls.filter(x=>x.action==='result'||x.action==='complete_task').length,0);
 d.querySelector('[data-next]').click();d.querySelector('[data-finish]').click();await new Promise(r=>setTimeout(r,30));
 assert.equal(f.calls.filter(x=>x.action==='complete_task').length,1);assert.equal(f.calls.find(x=>x.action==='complete_task').results.length,2);
 }finally{f.close()}
});
test('entry cannot advance without photo; exit without damage needs no upload',async()=>{
 const a=await taskFixture('preparation');try{a.w.document.querySelector('[data-next]').click();assert.match(a.w.document.querySelector('[data-wizard-message]').textContent,/Tire uma foto/)}finally{a.close()}
 const b=await taskFixture('departure');try{const d=b.w.document;assert.equal(d.querySelector('[data-camera]'),null);d.querySelector('[data-no-damage]').click();d.querySelector('[data-finish]').click();await new Promise(r=>setTimeout(r,30));assert.equal(b.calls.find(x=>x.action==='complete_task').results.every(x=>x.result==='ok'),true);assert.equal(b.calls.some(x=>x.action==='upload'),false)}finally{b.close()}
});


test('review shows every photo outside collapsed items with an explicit full-size link and item caption',async()=>{
 const photos=[{item_index:0,url:'https://media.invalid/bathroom.jpg',stage:'departure'},{item_index:9,url:'https://media.invalid/legacy.jpg',stage:'departure'}];
 const f=await taskFixture('departure',photos);try{const d=f.w.document;d.querySelector('[data-no-damage]').click();
 const gallery=d.querySelector('.ops-review-gallery');assert.match(gallery.textContent,/Fotos desta conferência · 2/);assert.equal(gallery.querySelectorAll('a').length,2);assert.equal(gallery.closest('details'),null);assert.equal(gallery.querySelector('a').href,photos[0].url);assert.equal(gallery.querySelector('a').target,'_blank');assert.match(gallery.textContent,/Ampliar foto/);assert.match(gallery.textContent,/Banheiro/);assert.match(gallery.textContent,/Foto da conferência/);gallery.querySelector('a').click();assert.equal(d.querySelector('.ops-photo-viewer img').src,photos[0].url);assert.equal(d.querySelector('.ops-photo-viewer').getAttribute('open'),'');d.querySelector('.ops-photo-viewer button').click();assert.equal(d.querySelector('.ops-photo-viewer'),null);
 }finally{f.close()}
});
test('review explicitly says when no photos were sent instead of leaving an empty collapsed section',async()=>{const f=await taskFixture('departure');try{const d=f.w.document;d.querySelector('[data-no-damage]').click();assert.match(d.querySelector('.ops-review-gallery').textContent,/Nenhuma foto foi enviada nesta conferência/);assert.equal(d.querySelector('.ops-review-gallery a'),null)}finally{f.close()}});
