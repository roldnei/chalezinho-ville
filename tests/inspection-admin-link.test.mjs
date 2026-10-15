import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../conferencias-admin.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
async function setup({assigned='existing',status='pending',error,delay}={}){
 const dom=new JSDOM('<main id="inspection-admin"></main>',{url:'https://example.test/conferencias-admin.html?tarefa=task',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.test',supabaseKey:'public'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'session'}}})}})};
 w.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);let data;
  if(body.action==='people')data={people:[{id:'existing',name:'Pessoa existente',phone:null},{id:'other',name:'Outra pessoa'}]};
  if(body.action==='detail')data={task:{id:'task',assigned_to:assigned,status,stage:'preparation',property_name:'Chalé DEV',items:['Cama'],rules:[]},results:[],photos:[],history:[]};
  if(body.action==='issue_link'){if(delay)await delay;if(error)return {ok:false,json:async()=>({ok:false,error})};data={token:'e'.repeat(64),name:'Pessoa existente',phone:null};}
  return {ok:true,json:async()=>({ok:true,data})};
 };
 await w.eval(source);return {w,doc:w.document,calls,close:()=>w.close()};
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
