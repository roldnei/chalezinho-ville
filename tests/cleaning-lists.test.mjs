import {locationMarkup,mountLocations,locationValid} from '../cleaning-locations.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountList} from '../cleaning-lists.js';
import {renderAdmin} from '../faxinas-admin.js';
import {renderManualAdmin} from '../cleaning-manual.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(label,name,value='',type='text',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}></label>`;
const checked=(label,name,value)=>`<label><input name="${name}" type="checkbox" ${value?'checked':''}>${label}</label>`;
const options=(items,value)=>items.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('');
const visible=root=>[...root.querySelectorAll('[data-list-row]')].filter(n=>!n.hidden);
const event=(w,node,type)=>node.dispatchEvent(new w.Event(type,{bubbles:true,cancelable:true}));
let serial=0;
function fixture({scope='test-'+serial++,id='participants',count=37}={}){
 const dom=new JSDOM('<main></main>'),w=dom.window,body=w.document.querySelector('main');
 const records=Array.from({length:count},(_,i)=>{const node=w.document.createElement('form');node.innerHTML=`<label>Nome<input name="name" value="Registro ${i}"></label><button>Salvar</button>`;body.append(node);return {node,key:String(i),title:i===30?'Márcia João':'Cadastro '+String(i).padStart(2,'0'),subtitle:i%2?'Centro':'Praia',search:['(27) 99900-'+String(i).padStart(4,'0'),'2799900'+String(i).padStart(4,'0')],tags:[i%2?'owner':'worker'],badges:[i%2?'Proprietário':'Profissional']};});
 const root=mountList(body,{id,scope,label:'Participantes',records,filters:[{value:'owner',label:'Proprietários'},{value:'worker',label:'Profissionais'}]});
 return {dom,w,body,root,records};
}
test('37 registrations paginate in 10/25/50 and never disappear from the last page',()=>{
 const {dom,w,root}=fixture();assert.equal(visible(root).length,10);assert.match(root.querySelector('[role=status]').textContent,/1–10 de 37/);
 const buttons=root.querySelectorAll('.list-pagination button');assert.equal(buttons[0].disabled,true);
 for(let i=0;i<3;i++)buttons[1].click();assert.equal(visible(root).length,7);assert.equal(visible(root)[0].dataset.listRow,'30');assert.equal(buttons[1].disabled,true);
 const size=root.querySelectorAll('select')[1];size.value='25';event(w,size,'change');assert.equal(visible(root).length,25);buttons[1].click();assert.equal(visible(root).length,12);
 size.value='50';event(w,size,'change');assert.equal(visible(root).length,37);assert.equal(buttons[1].disabled,true);dom.window.close();
});
test('search finds accents, mixed case, multiple words and a formatted phone across every page',()=>{
 const {dom,w,root}=fixture(),s=root.querySelector('input[type=search]');for(const term of ['MARCIA joao','27999000030','(27) 99900-0030']){s.value=term;event(w,s,'input');assert.deepEqual(visible(root).map(n=>n.dataset.listRow),['30']);}dom.window.close();
});
test('filters combine with search and reset clearly from a no-result state',()=>{
 const {dom,w,root}=fixture(),s=root.querySelector('input[type=search]'),f=root.querySelector('select');f.value='owner';event(w,f,'change');assert.match(root.querySelector('[role=status]').textContent,/de 18 · 37 no total/);
 s.value='MARCIA';event(w,s,'input');assert.equal(visible(root).length,0);assert.equal(root.querySelector('.list-empty').hidden,false);assert.equal(root.querySelector('.list-pagination').hidden,true);
 root.querySelector('.list-empty button').click();assert.equal(s.value,'');assert.equal(f.value,'');assert.equal(visible(root).length,10);assert.equal(w.document.activeElement,s);dom.window.close();
});
test('editing then searching and paging retains the same form, values and submit handler',()=>{
 const {dom,w,root,records}=fixture();const first=records[0].node,row=visible(root)[0];assert.equal(row.open,false);row.open=true;const name=first.elements.name;name.value='Edição em andamento';event(w,name,'input');assert.match(row.textContent,/Alterações não salvas/);
 let saved;first.onsubmit=e=>{e.preventDefault();saved=first.elements.name.value;};const s=root.querySelector('input[type=search]');s.value='marcia';event(w,s,'input');s.value='';event(w,s,'input');root.querySelectorAll('.list-pagination button')[1].click();root.querySelectorAll('.list-pagination button')[0].click();assert.equal(records[0].node,first);assert.equal(name.value,'Edição em andamento');event(w,first,'submit');assert.equal(saved,'Edição em andamento');dom.window.close();
});
test('list state survives redraws, clamps after a removal and stays isolated by account and screen',()=>{
 const scope='same-account-'+serial++;const a=fixture({scope});const size=a.root.querySelectorAll('select')[1];size.value='25';event(a.w,size,'change');a.root.querySelectorAll('.list-pagination button')[1].click();
 const redraw=fixture({scope,count:12});assert.equal(redraw.root.querySelectorAll('select')[1].value,'25');assert.equal(visible(redraw.root).length,12);assert.match(redraw.root.querySelector('.list-page').textContent,/Página 1 de 1/);
 const other=fixture({scope:'another-account-'+serial++}),screen=fixture({scope,id:'properties'});assert.equal(other.root.querySelectorAll('select')[1].value,'10');assert.equal(screen.root.querySelectorAll('select')[1].value,'10');for(const f of [a,redraw,other,screen])f.dom.window.close();
});
test('untrusted names remain text and empty lists have no useless pager or reset',()=>{
 const f=fixture({count:0});assert.equal(f.root.querySelector('.list-empty').hidden,false);assert.equal(f.root.querySelector('.list-pagination').hidden,true);assert.equal(f.root.querySelector('.list-empty button').hidden,true);
 const node=f.w.document.createElement('form');mountList(f.body,{id:'escaping',label:'Imóveis',records:[{node,key:'1',title:'<img src=x onerror=alert(1)>',subtitle:'<script>bad</script>'}]});assert.equal(f.body.querySelector('img'),null);assert.equal(f.body.querySelector('script'),null);f.dom.window.close();
});
function adminFixture(tab='participants'){
 const dom=new JSDOM('<main></main>'),w=dom.window,app=w.document.querySelector('main'),calls=[];
 const participants=Array.from({length:37},(_,i)=>({user_id:'member-'+i,name:'Pessoa '+i,city:i%2?'Centro':'Praia',phone:'(27) 99900-'+String(i).padStart(4,'0'),owner:true,worker:true,owner_released:i%2===0,worker_released:i%2===0,worker_approved:true,blocked:false}));
 const properties=participants.map((m,i)=>({id:'property-'+i,name:'Imóvel '+i,city:'Guarapari',bairro:i%2?'Centro':'Setiba',pms_property_id:i%2?'pms-'+i:null,rules:{},price_override_cents:null,auto_clean:false,show_pms:false}));
 const hub={participants,properties,directory:[],pms_properties:[],jobs:[],receivers:[],administrators:[],history:[],configuration:{version:1,settings:{pilot:true,payment_method:'manual_pix',provider:{environment:'sandbox'},manual_pix:{},manual_confirmation_minutes:60,manual_payout_hours:24,service:{scope:'Limpeza padrão',checklist:[],linen_change:true}}},manual:{payments:[],receivers:[]}};
 const ctx={app,hub,run:(a,p)=>calls.push({a,p}),load:()=>{},esc,money:v=>'R$ '+(v/100).toFixed(2),input,checked,options,notice:()=>{},dt:String,cents:v=>Math.round(Number(v)*100),tab,setTab:()=>{},listScope:'admin-test-'+serial++};return {dom,w,app,calls,ctx,hub};
}
function withFormData(w,fn){const original=globalThis.FormData;globalThis.FormData=w.FormData;try{fn();}finally{globalThis.FormData=original;}}
test('admin edits exactly the searched participant on page 4 and submits the original permission action',()=>{
 const f=adminFixture();renderAdmin(f.ctx);const root=f.app.querySelector('[data-list=admin-participants]');assert.equal(visible(root).length,10);assert.equal(root.querySelectorAll('details[open]').length,0);
 const s=root.querySelector('input[type=search]');s.value='Pessoa 30';event(f.w,s,'input');const form=visible(root)[0].querySelector('form');form.elements.owner_released.checked=false;form.elements.worker_released.checked=true;withFormData(f.w,()=>event(f.w,form,'submit'));
 assert.equal(f.calls[0].a,'release');assert.equal(f.calls[0].p.user_id,'member-30');assert.equal(f.calls[0].p.owner_released,false);assert.equal(f.calls[0].p.worker_released,true);assert.equal(f.calls[0].p.owner_fee,null);f.dom.window.close();
});
test('PMS property search retains independent integration controls and exact property id',()=>{
 const f=adminFixture('properties');renderAdmin(f.ctx);const root=f.app.querySelector('[data-list=admin-properties]'),s=root.querySelector('input[type=search]');s.value='imovel 30';event(f.w,s,'input');const form=visible(root)[0].querySelector('form');form.elements.duration_minutes.value='180';form.elements.price_override.value='155.50';withFormData(f.w,()=>event(f.w,form,'submit'));assert.equal(f.calls[0].a,'property_rules');assert.equal(f.calls[0].p.property_id,'property-30');assert.equal(f.calls[0].p.price_override_cents,15550);assert.equal(f.calls[0].p.rules.duration_minutes,180);assert.equal(f.calls[0].p.auto_clean,false);f.dom.window.close();
});
test('manual Pix lists separate receivers and payments; a searched bank credit goes only to its payment',()=>{
 const f=adminFixture('finance');f.hub.manual.payments=Array.from({length:37},(_,i)=>({id:'pay-'+i,job_id:'job-'+i,property_name:'Chalé '+i,owner_name:'Proprietário '+i,worker_name:'Pessoa '+i,amount_cents:11000,net_cents:10000,status:'pending',payout:'pending',entries:[]}));renderManualAdmin(f.ctx,f.app);
 const root=f.app.querySelector('[data-list=manual-payments]'),receivers=f.app.querySelector('[data-list=manual-receivers]');assert.equal(visible(root).length,10);assert.equal(visible(receivers).length,10);
 const s=root.querySelector('input[type=search]');s.value='chale 30';event(f.w,s,'input');const form=visible(root)[0].querySelector('[data-bank=credit]');form.elements.amount.value='110.00';form.elements.bank_reference.value='SIMULACAO-SEM-DINHEIRO';form.elements.bank_at.value='2026-10-13T12:00:00';form.elements.checked_statement.checked=true;withFormData(f.w,()=>event(f.w,form,'submit'));assert.equal(f.calls[0].a,'manual_credit');assert.equal(f.calls[0].p.payment_id,'pay-30');assert.equal(f.calls[0].p.amount_cents,11000);assert.equal(f.calls[0].p.checked_statement,true);assert.equal(visible(receivers).length,10);f.dom.window.close();
});

async function customerFixture({mixedJobs=false,noPersonalJobs=false}={}){
 const {readFile}=await import('node:fs/promises');const f=adminFixture();const {w,hub}=f;const html=await readFile(new URL('../faxinas/contratar/index.html',import.meta.url),'utf8');f.dom.window.close();f.dom=new JSDOM(html,{url:'https://qa.example.test/faxinas/contratar/',runScripts:'outside-only'});f.w=f.dom.window;const browser=f.w,user='owner-'+serial++;
 hub.member={name:'QA proprietária',owner:true,owner_released:true,worker:false};hub.favorites=[];hub.notifications=[];hub.offers=[];hub.directory=hub.participants.map(m=>({user_id:m.user_id,name:m.name,city:m.city,bairros:['Centro'],count:0}));hub.properties=hub.properties.map(p=>({...p,owner_id:user,rooms:1,bathrooms:1,area:35}));hub.properties.push({...hub.properties[0],id:'foreign',owner_id:'another-owner',name:'Não mostrar outro proprietário'});
 hub.admin=true;
 if(mixedJobs){const base={starts_at:'2026-10-15T12:00:00Z',duration_minutes:120,bairro:'Setiba',state:'requested',snapshot:{quote_required:false,owner_total_cents:11000,worker_net_cents:10000}};hub.jobs=[...(noPersonalJobs?[]:[{...base,id:'mine',owner_id:user,worker_id:null,property_name:'Signature · meu pedido'},{...base,id:'assigned',owner_id:'another-owner',worker_id:user,property_name:'Serviço atribuído a mim'}]),{...base,id:'foreign',owner_id:'another-owner',worker_id:'another-worker',property_name:'Pedido privado de outro proprietário'},{...base,id:'qa',owner_id:'qa-owner',worker_id:'qa-worker',is_test:true,property_name:'QA Faxinas imóvel de teste — sem operação real'},{...base,id:'own-qa',owner_id:user,worker_id:null,is_test:true,property_name:'QA da minha conta'}];}
 browser.scrollTo=()=>{};browser.AbortSignal=AbortSignal;browser.mountList=mountList;browser.offline=async()=>null;browser.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.example.test',supabaseKey:'QA'};browser.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'QA',user:{id:user}}}})}})};
 browser.fetch=async(_url,opts)=>{const {action,...p}=JSON.parse(opts.body);if(action==='favorite'){f.calls.push({a:action,p});hub.favorites.push(p.worker_id);}return {ok:true,json:async()=>action==='bootstrap'?{ok:true,environment:'development',settings:hub.configuration.settings}:{ok:true,...hub}};};
 let source=await readFile(new URL('../faxinas.js',import.meta.url),'utf8');source=source.replace("import {mountList} from './cleaning-lists.js';",'const mountList=window.mountList;').replace("import {offline,compressPhoto} from './cleaning-offline.js';",'const offline=window.offline,compressPhoto=()=>{};');browser.locationMarkup=locationMarkup;browser.mountLocations=mountLocations;browser.locationValid=locationValid;source=source.replace("import {locationMarkup,mountLocations,locationValid} from './cleaning-locations.js';",'const {locationMarkup,mountLocations,locationValid}=window;');browser.eval(source+'\nwindow.qa={go};');
 for(let n=0;n<100;n++){if(browser.document.querySelector('.directory-heading'))return f;await new Promise(r=>setTimeout(r,10));}throw Error('Customer UI did not settle');
}
test('owner searches 37 authorized properties and edits the correct property without exposing another owner',async()=>{
 const f=await customerFixture();await f.w.qa.go('properties');const root=f.w.document.querySelector('[data-list=properties]');assert.equal(root.querySelectorAll('[data-list-row]').length,37);assert.equal(visible(root).length,10);assert.doesNotMatch(root.textContent,/Não mostrar outro proprietário/);
 const s=root.querySelector('input[type=search]');s.value='imovel 30';event(f.w,s,'input');const row=visible(root)[0];assert.equal(row.dataset.listRow,'property-30');assert.ok(row.querySelector('.list-summary [data-edit-property]'));row.querySelector('[data-edit-property]').click();assert.equal(f.w.document.querySelector('[name=name]').value,'Imóvel 30');f.dom.window.close();
});
test('home limits professional previews; full directory searches all 37 and favorites preserve the search',async()=>{
 const f=await customerFixture();assert.equal(f.w.document.querySelectorAll('[data-directory-favorite]').length,4);assert.ok(f.w.document.querySelector('[data-view=directory]'));await f.w.qa.go('directory');let root=f.w.document.querySelector('[data-list=directory]');assert.equal(root.querySelectorAll('[data-list-row]').length,37);
 const s=root.querySelector('input[type=search]');s.value='Pessoa 30';event(f.w,s,'input');visible(root)[0].querySelector('[data-directory-favorite]').click();for(let n=0;n<100;n++){if(f.w.document.querySelector('[data-list=directory]')!==root)break;await new Promise(r=>setTimeout(r,10));}
 root=f.w.document.querySelector('[data-list=directory]');assert.equal(f.calls[0].a,'favorite');assert.equal(f.calls[0].p.worker_id,'member-30');assert.equal(root.querySelector('input[type=search]').value,'Pessoa 30');assert.equal(visible(root).length,1);assert.match(visible(root)[0].textContent,/★ Favorita/);f.dom.window.close();
});

test('an administrator using the personal app sees only owned/assigned non-test jobs, while management retains all history',async()=>{
 const f=await customerFixture({mixedJobs:true});assert.deepEqual([...f.w.document.querySelectorAll('[data-job]')].map(n=>n.dataset.job),['mine']);assert.doesNotMatch(f.w.document.querySelector('#app').textContent,/QA Faxinas|QA da minha conta|Pedido privado de outro proprietário/);
 await f.w.qa.go('services');const root=f.w.document.querySelector('[data-list=services]');assert.deepEqual(visible(root).map(n=>n.dataset.listRow),['mine']);assert.match(root.querySelector('[role=status]').textContent,/1–1 de 1/);const search=root.querySelector('input[type=search]');search.value='QA';event(f.w,search,'input');assert.equal(visible(root).length,0);
 const management=f.w.document.createElement('main');renderAdmin({...f.ctx,app:management,tab:'jobs'});assert.equal(management.querySelectorAll('[data-admin-job]').length,5);assert.match(management.textContent,/QA Faxinas imóvel de teste/);f.dom.window.close();
});
test('an administrator with no personal requests sees an honest empty list and a direct request button instead of QA fixtures',async()=>{
 const f=await customerFixture({mixedJobs:true,noPersonalJobs:true});assert.equal(f.w.document.querySelectorAll('[data-job]').length,0);await f.w.qa.go('services');const app=f.w.document.querySelector('#app');assert.equal(app.querySelectorAll('[data-list-row]').length,0);assert.match(app.textContent,/Nenhum pedido enviado por enquanto/);assert.ok(app.querySelector('[data-view=request]'));assert.doesNotMatch(app.textContent,/QA Faxinas|Pedido privado/);assert.equal(f.hub.jobs.length,3);f.dom.window.close();
});
