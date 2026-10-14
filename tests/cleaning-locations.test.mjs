import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {locationMarkup,mountLocations,locationValid,renderLocationsAdmin} from '../cleaning-locations.js';
import {database,client,owner,worker,other,admin,member,property,release,request,futureMorning} from './cleaning/helpers.mjs';
let db,c;const doms=[];
const locations=async(p={},actor=owner)=>(await c.one('select cleaning_locations($1,$2) result',[actor,p])).result;
const api=actor=>async(action,p={})=>action==='locations'?locations(p,actor):{result:await c.mutate(action,p,actor)};
const until=async f=>{for(let i=0;i<120;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI not settled');};
before(async()=>{db=await database({locations:true});c=client(db);await c.mutate('member',member());await c.mutate('member',member('Profissional',true),worker);await c.mutate('member',member('Outra pessoa'),other);await release(c,owner);await release(c,worker);});
after(async()=>{doms.forEach(d=>d.window.close());await db.close();});
test('all 5571 official municipalities have UF; same city name needs a specific state',async()=>{
 assert.equal((await c.one('select count(*)::int n from cleaning_cities')).n,5571);const cities=(await locations({query:'Bom Jesus'})).cities;assert.ok(cities.some(x=>x.uf==='PI'));assert.ok(cities.some(x=>x.uf==='RS'));assert.ok(cities.every(x=>x.label.includes(x.uf)));
 await assert.rejects(()=>c.mutate('property',{...property(),city:'Bom Jesus'}),/city_selection_required/);
 await assert.rejects(()=>c.mutate('property',{...property(),city:'Guarapaei'}),/invalid_city/);
 await assert.rejects(()=>c.mutate('property',{...property(),city_ibge:3550308}),/invalid_city/);
});
test('case, accents and spaces normalize to existing city/neighborhood without growing the catalog',async()=>{
 const count=(await c.one('select count(*)::int n from cleaning_neighborhoods')).n;
 const p=await c.mutate('property',{...property(),city:'  GUARAPARI / es ',bairro:' MUQUICABA  '});assert.equal(p.city,'Guarapari');assert.equal(p.bairro,'Muquiçaba');assert.equal(p.city_ibge,3202405);
 const m=await c.mutate('member',{...member('Profissional',true),city:'GUARAPARI',bairros:['setiba',' Setiba ','muquicaba']},worker);assert.deepEqual(m.bairros,['Muquiçaba','Setiba']);assert.equal(m.city_ibge,3202405);assert.equal((await c.one('select count(*)::int n from cleaning_neighborhoods')).n,count);
 await c.mutate('member',member('Profissional',true),worker);
});
test('invalid neighborhoods, unsupported-city neighborhoods and incomplete street address are rejected server-side',async()=>{
 await assert.rejects(()=>c.mutate('property',{...property(),bairro:'Setbia'}),/invalid_neighborhood/);
 await assert.rejects(()=>c.mutate('member',{...member('Profissional',true),bairros:['Centor']},worker),/invalid_neighborhood/);
 await assert.rejects(()=>c.mutate('property',{...property(),city:'São Paulo / SP',city_ibge:3550308}),/invalid_neighborhood/);
 for(const address of ['','  a  ','Rua\nindevida'])await assert.rejects(()=>c.mutate('property',{...property(),address}),/invalid_address/);
 await assert.rejects(()=>db.query("update cleaning_members set city='Cidade inventada' where user_id=$1",[worker]),/invalid_city/);
 await assert.rejects(()=>db.query("update cleaning_properties set bairro='Setbia' where id=(select id from cleaning_properties limit 1)"),/invalid_neighborhood/);
});
test('an inclusion request is private, deduplicated and never creates a selectable neighborhood',async()=>{
 const input={city_id:3550308,name:'Bairro QA pendente'};const a=await c.mutate('location_interest',input);const b=await c.mutate('location_interest',{...input,name:' bairro QA PENDENTE '});assert.equal(a.id,b.id);assert.equal((await locations({city_id:3550308})).neighborhoods.length,0);assert.equal((await locations({},other)).requests.length,0);assert.equal((await locations({},admin)).requests.length,1);
 await assert.rejects(()=>c.mutate('location_review',{city_id:3550308,name:input.name,checked:true,kind:'bairro',source:'https://qa.example.test/fonte'}),/cleaning_admin_required/);
 await assert.rejects(()=>c.mutate('location_review',{city_id:3550308,name:input.name,request_id:a.id,kind:'bairro',source:'https://qa.example.test/fonte'},admin),/location_review_required/);
 const n=await c.mutate('location_review',{city_id:3550308,name:input.name,request_id:a.id,kind:'bairro',source:'https://qa.example.test/fonte',checked:true,aliases:['Bairro QA alternativo']},admin);assert.equal((await locations({city_id:3550308})).neighborhoods[0].id,n.id);assert.equal((await locations()).requests.length,0);
 const p=await c.mutate('property',{...property(),city:'São Paulo / SP',city_ibge:3550308,bairro:'bairro qa alternativo'});assert.equal(p.city,'São Paulo');assert.equal(p.bairro,input.name);
 const audit=await c.one("select actor_id from cleaning_history where entity='cleaning_neighborhoods' and entity_id=$1 order by created_at desc limit 1",[n.id]);assert.equal(audit.actor_id,admin);
 await assert.rejects(()=>c.mutate('location_review',{city_id:3550308,name:input.name,kind:'bairro',source:'https://qa.example.test/fonte',checked:true},admin),/neighborhood_already_exists/);
});
test('neighborhood aliases cannot hijack another canonical region; rejected requests retain explanation',async()=>{
 const count=(await c.one('select count(*)::int n from cleaning_neighborhoods')).n;
 await assert.rejects(()=>c.mutate('location_review',{city_id:3202405,name:'Nova região QA',kind:'regiao',source:'https://qa.example.test/fonte',checked:true,aliases:['Setiba']},admin),/neighborhood_already_exists/);assert.equal((await c.one('select count(*)::int n from cleaning_neighborhoods')).n,count);
 const r=await c.mutate('location_interest',{city_id:3202405,name:'Setbia'});await c.mutate('location_review',{request_id:r.id,decision:'reject',resolution:'Erro de digitação: selecione Setiba na lista.'},admin);assert.equal((await c.one('select state from cleaning_location_requests where id=$1',[r.id])).state,'rejected');
});
test('validated selections retain offers, assignment, snapshots and unknown PMS import drafts',async()=>{
 const p=await c.mutate('property',property(26));const j=await request(c,p,futureMorning());assert.ok((await c.read(worker)).offers.some(x=>x.id===j.id));const accepted=await c.mutate('accept',{job_id:j.id,expected_net_cents:10000},worker);assert.equal(accepted.state,'awaiting_pix');assert.deepEqual((await c.read(owner,j.id)).job.snapshot,accepted.snapshot);
 await db.query("update profiles set role='admin',pms_access_status='active' where id=$1",[owner]);await c.one('select cleaning_import_pms($1)',[owner]);const imported=(await c.read()).properties.find(p=>p.pms_import_pending);assert.ok(imported);assert.equal(imported.city_ibge,null);assert.equal(imported.city,'');assert.equal(imported.bairro,'');
});
async function ui(initial={city:'Guarapari'},multiple=false,call=api(owner)){
 const dom=new JSDOM(`<form><label>Nome<input name="name" value="Progresso preservado"></label>${locationMarkup(initial,multiple)}<button>Salvar</button></form>`,{url:'https://qa.example.test'});doms.push(dom);const f=dom.window.document.querySelector('form');await mountLocations(f,{api:call,initial,multiple});return {dom,w:dom.window,f};
}
test('touch-friendly city search clears old selection immediately; typing a typo cannot submit a valid region',async()=>{
 const {w,f}=await ui({city:'Guarapari',bairro:'Setiba'});assert.equal(locationValid(f),true);assert.equal(f.elements.city_ibge.value,'3202405');assert.equal(f.elements.bairro.tagName,'SELECT');f.elements.city_search.value='Guarapaei';f.elements.city_search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(locationValid(f),false);await until(()=>f.querySelector('[data-location-status]').textContent.includes('Cidade não encontrada'));assert.equal(f.elements.city_ibge.value,'');assert.equal(f.elements.name.value,'Progresso preservado');
});
test('professional picks canonical neighborhoods without free-text entry',async()=>{
 const {f}=await ui({city:'Guarapari',bairros:['Setiba','Muquiçaba']},true);assert.equal(f.querySelector('textarea[name=bairros]'),null);assert.equal(f.querySelectorAll('[name=bairros]:checked').length,2);assert.equal(locationValid(f,true),true);
});
test('connection failure preserves other fields, offers explicit retry and never invents cities',async()=>{
 let fail=true;const {f}=await ui({city:'Guarapari'},false,async(...args)=>{if(fail)throw Error('offline');return api(owner)(...args);});assert.equal(locationValid(f),false);assert.equal(f.elements.name.value,'Progresso preservado');const retry=f.querySelector('[data-location-retry]');assert.equal(retry.hidden,false);fail=false;retry.click();await until(()=>f.elements.city_ibge.value==='3202405');assert.equal(f.elements.name.value,'Progresso preservado');
});
test('catalog and command endpoints are service-only; new tables have RLS',async()=>{
 for(const role of ['anon','authenticated'])for(const signature of ['cleaning_locations(uuid,jsonb)','cleaning_mutate(uuid,text,jsonb)','cleaning_mutate_before_locations(uuid,text,jsonb)'])assert.equal((await c.one('select has_function_privilege($1,$2,\'execute\') allowed',[role,'public.'+signature])).allowed,false);
 const rows=(await db.query("select relrowsecurity from pg_class where relname in ('cleaning_cities','cleaning_neighborhoods','cleaning_neighborhood_keys','cleaning_location_requests')")).rows;assert.equal(rows.length,4);assert.ok(rows.every(x=>x.relrowsecurity));
});


test('administration can select a pending request, verify its city/source and release it without a hidden mandatory neighborhood',async()=>{
 const r=await c.mutate('location_interest',{city_id:3202405,name:'Região QA para revisão'});const dom=new JSDOM('<main></main>',{url:'https://qa.example.test'});doms.push(dom);const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};const body=w.document.querySelector('main');let saved=false;
 const esc=v=>String(v??'').replace(/[&<>"']/g,'');
 await renderLocationsAdmin(body,{api:api(admin),run:async(a,p,done)=>{await c.mutate(a,p,admin);saved=true;done();},load:()=>{},notice:()=>{},esc,input:(l,n,v='',t='text',extra='')=>`<label>${l}<input name="${n}" value="${v}" type="${t}" ${extra}></label>`,options:items=>items.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')});
 body.querySelector(`[data-region-request="${r.id}"] [data-region-fill]`).click();await until(()=>body.querySelector('[name=city_ibge]').value==='3202405'&&body.querySelector('[name=bairro]')&&!body.querySelector('[name=bairro]').disabled);
 const f=body.querySelector('#location-review');assert.equal(f.elements.request_id.value,r.id);f.elements.source.value='https://qa.example.test/fonte';f.elements.checked.checked=true;f.elements.kind.value='regiao';assert.equal(f.checkValidity(),true);f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>saved);assert.equal((await c.one('select state from cleaning_location_requests where id=$1',[r.id])).state,'approved');
});


test('professionals in a homonymous municipality never receive or accept the other states services',async()=>{
 const cities=(await locations({query:'Bom Jesus'})).cities,pi=cities.find(x=>x.name==='Bom Jesus'&&x.uf==='PI'),rs=cities.find(x=>x.name==='Bom Jesus'&&x.uf==='RS');
 for(const city of [pi,rs])await c.mutate('location_review',{city_id:city.id,name:'Região QA homônima',kind:'regiao',source:'https://qa.example.test/fonte',checked:true},admin);
 await c.mutate('member',{...member('Profissional RS',true),city:'Bom Jesus / RS',city_ibge:rs.id,bairros:['Região QA homônima']},other);await release(c,other);
 const p=await c.mutate('property',{...property(),city:'Bom Jesus / PI',city_ibge:pi.id,bairro:'Região QA homônima'}),j=await request(c,p,futureMorning(15));assert.equal((await c.read(other)).offers.some(x=>x.id===j.id),false);await assert.rejects(()=>c.mutate('accept',{job_id:j.id,expected_net_cents:13000},other),/service_unavailable/);
});


async function edge(actor=owner){
 let handler;const calls=[];const dbClient={auth:{getUser:async()=>({data:{user:actor?{id:actor,email_confirmed_at:'2026-10-01T00:00:00Z'}:null},error:null})},rpc:async(name,p)=>{calls.push({name,p});try{return {data:name==='cleaning_locations'?await locations(p.p,actor):await c.mutate(p.p_action,p.p,actor),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
 const source=(await readFile(new URL('../supabase/functions/cleaning-platform/index.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(js,{createClient:()=>dbClient,Deno:{env:{get:()=>''},serve:h=>handler=h},Response,Request,crypto,Uint8Array,ArrayBuffer,atob,URL,exports:{}});
 return {calls,post:p=>handler(new Request('https://qa.example.test/cleaning-platform',{method:'POST',headers:{authorization:'Bearer QA','content-type':'application/json'},body:JSON.stringify(p)}))};
}
test('actual Edge handler authenticates location lookup and routes review/interest through the protected SQL boundary',async()=>{
 const anonymous=await edge(null);assert.equal((await anonymous.post({action:'locations',query:'Guarapari'})).status,401);assert.equal(anonymous.calls.length,0);
 const e=await edge();const lookup=await e.post({action:'locations',query:'Guarapari'});assert.equal(lookup.status,200);assert.equal((await lookup.json()).cities[0].id,3202405);
 const rejected=await e.post({action:'property',...property(),city:'Guarapaei'});assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'invalid_city');
 const interested=await e.post({action:'location_interest',city_id:3202405,name:'Bairro QA edge'});assert.equal(interested.status,200);
 const unauthorized=await e.post({action:'location_review',city_id:3202405,name:'Bairro QA edge',kind:'bairro',checked:true,source:'https://qa.example.test/fonte'});assert.equal(unauthorized.status,403);assert.equal((await unauthorized.json()).error,'cleaning_admin_required');
});
