(()=>{
'use strict';
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),root=document.querySelector('#inspection-app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={preparation:'Conferência pós-limpeza',departure:'Conferência pós-hospedagem',pending:'Não iniciada',in_progress:'Em andamento',blocked:'Pendente',inspection:'Enviada para aprovação',approved:'Finalizada'};
const dt=x=>new Date(x).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const errors={invalid_profile:'Confira seu nome e telefone com DDD. Se o número já estiver em outro cadastro, peça ajuda à administração.',access_unavailable:'Este acesso foi encerrado ou não está disponível. Peça um novo link à administração.',inspection_unavailable:'Não foi possível conectar. Suas respostas foram mantidas. Tente novamente.'};
let token=new URLSearchParams(location.hash.slice(1)).get('acesso'),taskId=new URLSearchParams(location.search).get('tarefa'),scope='',current=null,dispose=null;
if(token){sessionStorage.setItem('ville-inspection-access',token);history.replaceState(null,'',location.pathname+location.search)}else if(taskId)token=sessionStorage.getItem('ville-inspection-access');
const api=async(action,p={})=>{const {data:{session}}=await sb.auth.getSession();const response=await fetch(C.supabaseUrl+'/functions/v1/team-inspections',{method:'POST',headers:{'Content-Type':'application/json',apikey:C.supabaseKey,...(session?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify({...p,action,...(token?{token}:{})})});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'inspection_unavailable');return data.data};
function failure(e){root.innerHTML='<section class="card"><h2>Não foi possível abrir</h2><p>'+esc(errors[e.message]||'Não foi possível carregar esta conferência. Tente novamente.')+'</p><button data-reload>Tentar novamente</button></section>';root.querySelector('[data-reload]').onclick=()=>init()}
async function init(){try{
 if(dispose){dispose();dispose=null}
 const {data:{session}}=await sb.auth.getSession();if(!session&&!token){root.innerHTML='<section class="card"><h2>Entre para começar</h2><p>Use sua conta ou abra o link recebido pelo WhatsApp.</p><a class="button primary" href="auth.html?mode=login&return='+encodeURIComponent('conferencias.html'+location.search)+'">Entrar</a></section>';return}
 scope=token?'link:'+token.slice(0,16):session.user.id;
 if(taskId){await open(taskId);return}
 const d=await api('list');if(token&&d.tasks.length===1){await open(d.tasks[0].id);return}list(d.tasks);
}catch(e){failure(e)}}
function list(tasks){tasks.sort((a,b)=>(a.status==='in_progress'?-1:0)-(b.status==='in_progress'?-1:0)||a.scheduled_for.localeCompare(b.scheduled_for));root.innerHTML=tasks.length?tasks.map(t=>`<button class="card task" data-task="${t.id}"><strong>${esc(t.property_name)}</strong><span>${labels[t.stage]}</span><span>${dt(t.scheduled_for)} · ${labels[t.status]}</span></button>`).join(''):'<section class="card"><p>Você não tem conferências pendentes</p></section>';root.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>open(b.dataset.task))}
async function open(id){try{if(dispose){dispose();dispose=null}taskId=id;history.replaceState(null,'',location.pathname+'?tarefa='+id);current=await api('detail',{task_id:id});if(current.profile&&!current.profile.completed){profile();return}await draw()}catch(e){failure(e)}}
function profile(){root.innerHTML=`<section class="card"><h2>Olá, ${esc(current.profile.name)}!</h2><p>Confirme seus dados para começar.</p><form data-profile><label>Nome completo<input name="name" required minlength="2" value="${esc(current.profile.name)}"></label><label>Seu telefone / WhatsApp com DDD<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="27 99999-9999" value="${esc(current.profile.phone)}"></label><label>E-mail (opcional)<input name="email" type="email"></label><p data-message role="status"></p><button class="primary">Salvar e continuar</button></form></section>`;root.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');if(b.disabled)return;b.disabled=true;try{const data=Object.fromEntries(new FormData(form));data.phone=data.phone.replace(/\D/g,'');if(data.phone.length===10||data.phone.length===11)data.phone='55'+data.phone;if(!/^55[1-9][0-9][2-9][0-9]{7,8}$/.test(data.phone)){throw Error('invalid_profile')}await api('profile',data);current=await api('detail',{task_id:taskId});await draw()}catch(err){root.querySelector('[data-message]').textContent=errors[err.message]||'Não foi possível salvar. Tente novamente.'}finally{b.disabled=false}}}
// Preserve drafts and photos from the previous screen when the same link is reopened.
async function migrateDraft(userId,version){
 const oldKey=`ville-inspection:${scope}:${taskId}`,newKey=`ops-draft:${userId}:${taskId}`;
 try{const draft=JSON.parse(localStorage.getItem(oldKey));if(Array.isArray(draft)&&!localStorage.getItem(newKey)){localStorage.setItem(newKey,JSON.stringify({results:draft,step:0,version}));localStorage.removeItem(oldKey)}}catch{}
 try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ville-inspection-pending',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'upload_id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const old=await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),r=tx.objectStore('photos').getAll();tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)});for(const p of old.filter(p=>p.scope===scope&&p.task_id===taskId)){await window.VilleOperations.queue('put',{...p,user_id:userId});await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(p.upload_id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}db.close()}catch{}
}
async function draw(){
 const userId=current.task.assigned_to||scope,version=current.task.template_version||1,photoCache=new Map();await migrateDraft(userId,version);
 const state={operator:{id:userId,role:'staff'},team:[],properties:[{id:current.task.property_id,name:current.task.property_name}],stays:[],tasks:[]};
 const adapter=async(action,p={})=>{
  if(action==='hub')return state;
  if(action==='task'){const d=await api('detail',{task_id:p.task_id});const photos=await Promise.all(d.photos.map(async photo=>{if(!photoCache.has(photo.id)){const f=await api('photo_read',{task_id:p.task_id,photo_id:photo.id});photoCache.set(photo.id,f.src)}return {...photo,url:photoCache.get(photo.id),stage:d.task.stage}}));return {task:{...d.task,title:labels[d.task.stage],template_version:d.task.template_version||1,checklist_snapshot:d.task.items,item_rules_snapshot:d.task.rules},results:d.results,photos};}
  if(action==='save_progress')return api('save',p);
  if(action==='complete_task')return api('complete',p);
  if(action==='upload')return api('upload',p);
  throw Error('access_unavailable');
 };
 dispose=await window.VilleOperations.mount(root,{inspection:{taskId,api:adapter,onBack:()=>{taskId=null;history.replaceState(null,'',location.pathname);init()},onError:failure,onComplete:()=>{sessionStorage.removeItem('ville-inspection-access');root.innerHTML='<section class="card"><h2>Conferência concluída</h2><p>Obrigado! A administração recebeu suas respostas e fotos.</p><p>O link desta conferência foi encerrado.</p><a class="button" href="conferencias.html">Minhas conferências</a></section>';token=null;}}});
}
window.addEventListener('hashchange',()=>{const incoming=new URLSearchParams(location.hash.slice(1)).get('acesso');if(!incoming)return;token=incoming;taskId=null;sessionStorage.setItem('ville-inspection-access',token);history.replaceState(null,'',location.pathname);init()});
init();
})();
