import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFile} from 'node:fs/promises';
async function screen(stage='preparation',token=true,options={}){
 const dom=new JSDOM('<main id="inspection-app"></main>',{url:'https://dev.example/conferencias.html?tarefa=task'+(token?'#acesso='+'a'.repeat(64):''),runScripts:'outside-only'}),w=dom.window,calls=[];
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.example',supabaseKey:'public'};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:token?null:{access_token:'qa',user:{id:'worker'}}}})}})};
 const stores=new Map([['ville-ops-uploads',new Map((options.pending||[]).map(p=>[p.upload_id,p]))]]);w.indexedDB={open(name){const req={};setTimeout(()=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);req.result={close(){},createObjectStore(){},transaction(){const tx={objectStore:()=>({getAll:()=>({result:[...store.values()]}),put:v=>{store.set(v.upload_id,v);return{}},delete:id=>{store.delete(id);return{}}})};setTimeout(()=>tx.oncomplete?.(),0);return tx}};req.onsuccess()},0);return req}};
 const task={id:'task',assigned_to:'worker',property_id:1,property_name:'Ville teste',stage,status:'pending',items:['Cama','Hidro / spa','Piscina'],rules:[{}, {hidden:true,required:false,photo_required:false}, {equipment:'pool',required:true,photo_required:stage==='preparation',allow_na:false}]};
 const photos=[{id:'p0',item_index:0},{id:'p2',item_index:2}];let uploadFailed=!!options.failUpload;
 w.fetch=async(url,opts)=>{const p=JSON.parse(opts.body);calls.push({url,p});assert.equal(url,'https://dev.example/functions/v1/team-inspections');assert.equal(!!p.token,token);if(p.action==='upload'){if(uploadFailed)return {ok:false,json:async()=>({ok:false,error:'photo_upload_failed_retry'})};if(!photos.some(photo=>photo.id===p.upload_id))photos.push({id:p.upload_id,item_index:p.item_index});}
 const data=p.action==='detail'?{task,profile:null,results:[],photos:[...photos]}:p.action==='photo_read'?{src:'data:image/jpeg;base64,QA'}:{ok:true};return {ok:true,json:async()=>({ok:true,data})}};
 for(const file of ['operations-workspace.js','conferencias.js'])w.eval(await readFile(new URL('../'+file,import.meta.url),'utf8'));
 const wait=async f=>{for(let i=0;i<100&&!f();i++)await new Promise(r=>setTimeout(r,5));assert.ok(f())};await wait(()=>w.document.querySelector('.ops-wizard'));return {w,dom,calls,wait,stores,allowUpload:()=>{uploadFailed=false}};
}
test('link renders the shared PMS wizard, one item at a time, without admin navigation or guest data',async()=>{const f=await screen();try{const d=f.w.document;assert.equal(d.querySelector('.ops-step').textContent,'1 de 2');assert.equal(d.querySelector('.ops-wizard h3').textContent,'Cama');assert.equal(d.querySelector('.ops-tabs'),null);assert.equal(d.querySelector('.ops-task-settings'),null);assert.equal(d.querySelector('[href*="conferencias-admin"]'),null);d.querySelector('[data-next]').click();assert.equal(d.querySelector('.ops-step').textContent,'2 de 2');assert.equal(d.querySelector('.ops-wizard h3').textContent,'Piscina');assert.match(d.body.textContent,/Tire uma foto da piscina/);assert.equal(d.querySelector('[name=result] option[value=not_applicable]'),null);assert.doesNotMatch(d.body.textContent,/Hidro \/ spa/);d.querySelector('[data-save-progress]').click();await f.wait(()=>f.calls.some(c=>c.p.action==='save'));d.querySelector('[data-next]').click();const finish=d.querySelector('[data-finish]');finish.click();finish.click();await f.wait(()=>d.body.textContent.includes('Conferência concluída'));assert.equal(f.calls.filter(c=>c.p.action==='complete').length,1);assert.equal(f.calls.find(c=>c.p.action==='complete').p.results.filter(r=>r.item_index===1)[0].result,'not_applicable')}finally{f.dom.window.close()}});
test('departure link retains the PMS damage-first flow and does not request photos when everything is fine',async()=>{const f=await screen('departure');try{const d=f.w.document;assert.match(d.body.textContent,/Encontrou alguma avaria/);assert.equal(d.querySelector('[data-camera]'),null);d.querySelector('[data-no-damage]').click();assert.match(d.body.textContent,/Tudo pronto para enviar/);assert.doesNotMatch(d.querySelector('.ops-review').textContent,/Hidro \/ spa/);d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('Conferência concluída'));assert.equal(f.calls.some(c=>c.p.action==='upload'),false)}finally{f.dom.window.close()}});
test('login access uses the identical wizard with unchanged Auth credentials',async()=>{const f=await screen('preparation',false);try{assert.ok(f.w.document.querySelector('.ops-wizard'));assert.equal(f.calls.some(c=>c.p.token),false);assert.equal(f.w.document.querySelector('[name=result] option[value=not_applicable]'),null)}finally{f.dom.window.close()}});

const queued=(upload_id,item_index=0,extra={})=>({upload_id,item_index,task_id:'task',user_id:'worker',base64:'QA',content_type:'image/webp',...extra});
function review(f){const d=f.w.document;d.querySelector('[data-next]').click();d.querySelector('[data-next]').click();return d;}
test('server receipts clear stale local uploads without sending duplicate photos; other tasks and users remain untouched',async()=>{
 const otherTask=queued('other-task',0,{task_id:'other'}),otherUser=queued('other-user',0,{user_id:'other'});
 const f=await screen('preparation',true,{pending:[queued('p0'),otherTask,otherUser]});try{
  const d=review(f);d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('Conferência concluída'));
  assert.equal(f.calls.filter(c=>c.p.action==='upload').length,0);assert.deepEqual([...f.stores.get('ville-ops-uploads').keys()],['other-task','other-user']);
 }finally{f.dom.window.close()}
});
test('completion sends a genuinely pending photo with its original id before submitting the checklist',async()=>{
 const f=await screen('preparation',true,{pending:[queued('missing')]});try{
  const d=review(f);await f.wait(()=>d.querySelector('[data-retry="missing"]'));d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('Conferência concluída'));
  const sent=f.calls.filter(c=>c.p.action==='upload');assert.equal(sent.length,1);assert.equal(sent[0].p.upload_id,'missing');assert.equal(f.stores.get('ville-ops-uploads').size,0);
  assert.ok(f.calls.findIndex(c=>c.p.action==='upload')<f.calls.findIndex(c=>c.p.action==='complete'));
 }finally{f.dom.window.close()}
});
test('network failure preserves pending data and exposes retry on the review screen, then completion recovers',async()=>{
 const f=await screen('preparation',true,{pending:[queued('offline')],failUpload:true});try{
  const d=review(f);d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('A foto foi mantida'));
  assert.equal(f.calls.some(c=>c.p.action==='complete'),false);assert.ok(f.stores.get('ville-ops-uploads').has('offline'));await f.wait(()=>d.querySelector('[data-retry="offline"]')&&!d.querySelector('[data-finish]').disabled);
  f.allowUpload();d.querySelector('[data-retry="offline"]').click();await f.wait(()=>!d.querySelector('[data-retry="offline"]')&&!d.querySelector('[data-finish]').disabled);d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('Conferência concluída'));
  assert.equal(f.stores.get('ville-ops-uploads').size,0);
 }finally{f.dom.window.close()}
});
test('another photo of the same item cannot discard an unsent photo and an unclassified damage is preserved',async()=>{
 const f=await screen('preparation',true,{pending:[queued('unclassified',-1)]});try{
  const d=review(f);d.querySelector('[data-finish]').click();await f.wait(()=>d.body.textContent.includes('Indique o local da foto pendente'));
  assert.ok(f.stores.get('ville-ops-uploads').has('unclassified'));assert.equal(f.calls.some(c=>c.p.action==='complete'),false);
 }finally{f.dom.window.close()}
});
