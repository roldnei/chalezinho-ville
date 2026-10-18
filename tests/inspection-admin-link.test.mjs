import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../conferencias-admin.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
async function setup({assigned='existing',status='pending',error,delay,contactError,assignError}={}){
 const dom=new JSDOM('<main id="inspection-admin"></main>',{url:'https://example.test/conferencias-admin.html?tarefa=task',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.test',supabaseKey:'public'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'session'}}})}})};
 let people=[{id:'existing',name:'Pessoa existente',phone:null},{id:'other',name:'Outra pessoa'}];
 w.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);let data;
  if(body.action==='people')data={people};
  if(body.action==='detail')data={task:{id:'task',assigned_to:assigned,status,stage:'preparation',property_name:'Chalé DEV',items:['Cama'],rules:[]},results:[],photos:[],history:[]};
  if(body.action==='contact'){if(contactError)return {ok:false,json:async()=>({ok:false,error:contactError})};const person={id:body.user_id||'new-person',name:body.name,phone:body.phone};people=people.filter(p=>p.id!==person.id).concat(person);data={user_id:person.id};}
  if(body.action==='assign'){if(assignError)return {ok:false,json:async()=>({ok:false,error:assignError})};assigned=body.user_id;data={ok:true};}
  if(body.action==='issue_link'){if(delay)await delay;if(error)return {ok:false,json:async()=>({ok:false,error})};const person=people.find(p=>p.id===assigned);data={token:'e'.repeat(64),name:person.name,phone:person.phone||null};}
  return {ok:true,json:async()=>({ok:true,data})};
 };
 await w.eval(source);return {w,doc:w.document,calls,setError:v=>error=v,close:()=>w.close()};
}
test('existing email assignee is prefilled and receives a visible link without a new contact',async()=>{
 const s=await setup();try{const {doc,calls,w}=s,form=doc.querySelector('[data-contact]');
 assert.equal(form.elements.user_id.value,'existing');assert.equal(form.elements.name.value,'Pessoa existente');
 doc.querySelector('[data-link]').click();await tick();
 const input=doc.querySelector('[data-access-link]');assert.equal(input.value,'https://example.test/conferencias.html#acesso='+'e'.repeat(64));
 assert.equal(calls.filter(c=>c.action==='issue_link').length,1);assert.equal(calls.filter(c=>c.action==='contact').length,0);
 const wa=new URL(doc.querySelector('[data-whatsapp]').href);assert.equal(wa.pathname,'/');assert.match(wa.searchParams.get('text'),/Pessoa existente/);
 assert.match(doc.querySelector('[data-link-message]').textContent,/Link pronto/);
 let copied;w.navigator.clipboard={writeText:async t=>{copied=t}};doc.querySelector('[data-copy]').click();await tick();assert.equal(copied,input.value);
 }finally{s.close()}
});
test('failure is explained beside the generation button and can be retried',async()=>{const s=await setup({error:'task_locked'});try{s.doc.querySelector('[data-link]').click();await tick();assert.match(s.doc.querySelector('[data-link-message]').textContent,/encerrada/);assert.equal(s.doc.querySelector('[data-link]').disabled,false)}finally{s.close()}});
test('missing or unsaved assignment cannot issue a link',async()=>{for(const assigned of [null,'existing']){const s=await setup({assigned});try{if(assigned)s.doc.querySelector('[data-person]').value='other';s.doc.querySelector('[data-link]').click();await tick();assert.equal(s.calls.some(c=>c.action==='issue_link'),false);assert.match(s.doc.querySelector('[data-link-message]').textContent,/responsável/)}finally{s.close()}}});
test('repeated taps issue only one capability while the request is pending',async()=>{let resolve;const delay=new Promise(r=>resolve=r),s=await setup({delay});try{const b=s.doc.querySelector('[data-link]');b.click();b.click();await tick();assert.equal(s.calls.filter(c=>c.action==='issue_link').length,1);resolve();await tick();assert.equal(b.disabled,false)}finally{s.close()}});
test('submitted task explains why a new link is disabled',async()=>{const s=await setup({status:'inspection'});try{assert.equal(s.doc.querySelector('[data-link]').disabled,true);assert.match(s.doc.querySelector('[data-link-message]').textContent,/justificativa/)}finally{s.close()}});

const wait=async fn=>{for(let i=0;i<80&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn())};
const invite=(s,name='Maria Faxina',phone='(27) 99999-9977')=>{const f=s.doc.querySelector('[data-contact]');f.elements.name.value=name;f.elements.phone.value=phone;f.dispatchEvent(new s.w.Event('submit',{cancelable:true}));return f};
test('new worker invitation is visible without an account and saves, assigns and generates WhatsApp with no email',async()=>{
 const s=await setup({assigned:null});try{
  assert.equal(s.doc.querySelector('[data-contact-details]').hidden,false);assert.equal(s.doc.querySelector('[data-contact] [name=email]'),null);
  const form=invite(s);form.dispatchEvent(new s.w.Event('submit',{cancelable:true}));await wait(()=>s.doc.querySelector('[data-access-link]'));
  assert.deepEqual(s.calls.filter(c=>['contact','assign','issue_link'].includes(c.action)).map(c=>c.action),['contact','assign','issue_link']);
  const contact=s.calls.find(c=>c.action==='contact');assert.equal(contact.email,undefined);assert.equal(contact.phone,'5527999999977');assert.equal(contact.user_id,'');
  assert.equal(s.calls.find(c=>c.action==='assign').user_id,'new-person');assert.match(s.doc.querySelector('[data-responsible]').textContent,/Maria Faxina/);
  const link=s.doc.querySelector('[data-access-link]').value,wa=new URL(s.doc.querySelector('[data-whatsapp]').href);assert.equal(wa.pathname,'/5527999999977');assert.ok(wa.searchParams.get('text').includes(link));assert.match(wa.searchParams.get('text'),/Maria Faxina/);
 }finally{s.close()}
});
test('inviting someone new clears an existing identity before any new contact is saved',async()=>{
 const s=await setup();try{assert.equal(s.doc.querySelector('[data-contact-details]').hidden,true);s.doc.querySelector('[data-new-person]').click();const f=s.doc.querySelector('[data-contact]');assert.equal(s.doc.querySelector('[data-contact-details]').hidden,false);assert.equal(f.elements.user_id.value,'');assert.equal(f.elements.name.value,'');assert.equal(s.calls.some(c=>c.action==='assign'),false);invite(s);await wait(()=>s.doc.querySelector('[data-access-link]'));assert.equal(s.calls.find(c=>c.action==='contact').user_id,'');}finally{s.close()}
});
test('invalid phone and failed contact save preserve entered values and cannot issue or assign',async()=>{
 for(const failure of ['invalid','network']){const s=await setup({assigned:null,contactError:failure==='network'?'inspection_unavailable':null});try{const f=invite(s,'Maria',failure==='invalid'?'123':'27999999977');await wait(()=>!f.querySelector('button').disabled);assert.equal(f.elements.name.value,'Maria');assert.equal(f.elements.phone.value,failure==='invalid'?'123':'27999999977');assert.equal(s.calls.some(c=>c.action==='assign'||c.action==='issue_link'),false);if(failure==='invalid')assert.equal(s.calls.some(c=>c.action==='contact'),false);assert.ok(s.doc.querySelector('[data-link-message]').textContent);}finally{s.close()}}
});
test('link failure after assignment can retry without recreating the person',async()=>{
 const s=await setup({assigned:null,error:'inspection_unavailable'});try{invite(s);await wait(()=>s.calls.some(c=>c.action==='issue_link')&&s.doc.querySelector('[data-link]')&&!s.doc.querySelector('[data-link]').disabled);assert.equal(s.doc.querySelector('[data-access-link]'),null);s.setError(null);s.doc.querySelector('[data-link]').click();await wait(()=>s.doc.querySelector('[data-access-link]'));assert.equal(s.calls.filter(c=>c.action==='contact').length,1);assert.equal(s.calls.filter(c=>c.action==='assign').length,1);assert.equal(s.calls.filter(c=>c.action==='issue_link').length,2);}finally{s.close()}
});
test('failed assignment never creates a share link and completed tasks disable new invitations',async()=>{
 const s=await setup({assigned:null,assignError:'invalid_assignee'});try{invite(s);await wait(()=>s.calls.some(c=>c.action==='assign')&&!s.doc.querySelector('[data-contact] button').disabled);assert.equal(s.calls.some(c=>c.action==='issue_link'),false);assert.equal(s.doc.querySelector('[data-access-link]'),null);}finally{s.close()}
 for(const status of ['inspection','approved']){const s=await setup({assigned:null,status});try{assert.equal(s.doc.querySelector('[data-new-person]').disabled,true);assert.equal(s.doc.querySelector('[data-contact-fields]').disabled,true);invite(s);await tick();assert.equal(s.calls.some(c=>c.action==='contact'),false);}finally{s.close()}}
});
