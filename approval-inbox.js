(()=>{
'use strict';
const C=window.CHALEZINHO_CONFIG,root=document.querySelector('[data-approval-root]'),shortcuts=[...document.querySelectorAll('[data-approval-shortcut]')];
if(!root&&!shortcuts.length)return;
const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Não informado';
let snapshot=null,inFlight=false,category='all',query='',timer,epoch=0,detailOpen=false;
const groups=()=>[...new Set(snapshot.items.map(x=>x.category))];
function safeHref(value){const u=new URL(value,location.href);return u.origin===location.origin&&['pms-operacao.html','admin.html','faxinas-admin.html','villegram-admin.html'].some(p=>u.pathname==='/'+p)?u.pathname.slice(1)+u.search:'aprovacoes.html'}
function cards(){
 const rows=snapshot.items.filter(x=>(category==='all'||x.category===category)&&(!query||[x.title,x.property_name,x.requester].join(' ').toLocaleLowerCase('pt-BR').includes(query)));
 root.querySelector('[data-approval-list]').innerHTML=rows.length?rows.map(x=>`<a class="approval-item approval-list-row" href="${esc(safeHref(x.href))}" data-approval-key="${esc(x.key)}"><span class="approval-tag">${esc(x.category)}</span><h2>${esc(x.title)}</h2><p><strong>${esc(x.property_name||'Gestão geral')}</strong> · ${esc(x.requester||'Solicitante não informado')}</p>${x.completed_execution?`<p class="approval-executed">Executada em ${esc(date(x.pending_since))} · aguardando sua aprovação</p><p class="approval-evidence-count">${Number(x.answered_count)||0}/${Number(x.item_count)||0} itens conferidos · <strong>${Number(x.photo_count)||0} foto(s)</strong></p>${x.photo_count===0?'<p class="approval-warning">Enviada sem fotos</p>':''}`:`<p class="approval-subtle">Recebida em ${esc(date(x.pending_since))}</p>`}${x.issues?`<p class="approval-warning">${x.issues} problema(s) para analisar</p>`:''}<span class="approval-open">${x.key.startsWith('ops:')?'Ver fotos e respostas →':'Abrir para aprovar →'}</span></a>`).join(''):'<p>Nenhuma aprovação pendente neste filtro.</p>';
 root.querySelectorAll('[data-approval-key]').forEach(a=>a.onclick=e=>{const row=snapshot.items.find(x=>x.key===a.dataset.approvalKey);if(row?.key.startsWith('ops:')){e.preventDefault();openTask(row.key.slice(4))}});
}
function render(){
 if(!root||detailOpen)return;if(category!=='all'&&!groups().includes(category))category='all';
 root.innerHTML=`<div class="approval-count">${snapshot.total} ${snapshot.total===1?'item depende':'itens dependem'} de você</div><p class="approval-subtle">Lista atualizada em ${esc(date(snapshot.updated_at))} · atualização automática a cada 30 segundos</p><div class="approval-controls"><label>Tipo<select data-approval-category><option value="all">Todos (${snapshot.total})</option>${groups().map(g=>`<option value="${esc(g)}" ${category===g?'selected':''}>${esc(g)} (${snapshot.items.filter(x=>x.category===g).length})</option>`).join('')}</select></label><label>Buscar<input data-approval-search type="search" value="${esc(query)}" placeholder="Chalé, pessoa ou solicitação"></label><button data-approval-refresh>Atualizar</button></div><div data-approval-list class="approval-items"></div>`;
 root.querySelector('[data-approval-category]').onchange=e=>{category=e.target.value;cards()};root.querySelector('[data-approval-search]').oninput=e=>{query=e.target.value.toLocaleLowerCase('pt-BR');cards()};root.querySelector('[data-approval-refresh]').onclick=refresh;cards();
}
async function openTask(id){
 detailOpen=true;root.hidden=true;const detail=document.querySelector('[data-approval-detail]');detail.hidden=false;detail.innerHTML='<button data-back-approvals>← Voltar às aprovações</button><div data-approval-task></div>';
 let dispose;detail.querySelector('[data-back-approvals]').onclick=()=>{dispose?.();detailOpen=false;detail.hidden=true;root.hidden=false;render();refresh()};
 dispose=await window.VilleOperations.mount(detail.querySelector('[data-approval-task]'),{sb,initial:'tasks',taskId:id,reviewOnly:true,onSummary:()=>refresh()});
}
async function refresh(){
 if(inFlight||document.hidden)return;inFlight=true;clearTimeout(timer);const version=epoch;
 try{
  const {data:{session}}=await sb.auth.getSession();if(version!==epoch)return;
  if(!session){shortcuts.forEach(a=>a.hidden=true);if(root){location.href='auth.html?mode=login&return='+encodeURIComponent('aprovacoes.html');}return;}
  const {data,error}=await sb.rpc('admin_approval_inbox');if(version!==epoch)return;if(error)throw error;
  if(!data||!Array.isArray(data.items)||data.total!==data.items.length)throw Error('invalid_inbox');snapshot=data;
  shortcuts.forEach(a=>{a.hidden=false;a.dataset.state='ready';a.innerHTML=`Aprovações <b>${data.total}</b>`;a.setAttribute('aria-label',`${data.total} itens aguardando minha aprovação`)});render();
 }catch(e){
  const denied=e.code==='42501';shortcuts.forEach(a=>{a.hidden=denied;if(!denied){a.dataset.state='error';a.textContent='Aprovações · verificar';a.setAttribute('aria-label','Não foi possível atualizar aprovações')}});
  if(root&&!detailOpen){root.innerHTML=`<p role="alert">${denied?'Esta fila é exclusiva da administração.':'Não foi possível atualizar as aprovações. As pendências não foram consideradas zeradas.'}</p>${denied?'':'<button data-inbox-retry>Tentar novamente</button>'}`;root.querySelector('[data-inbox-retry]')?.addEventListener('click',refresh);}
 }finally{inFlight=false;timer=setTimeout(refresh,30000)}
}
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh()});document.addEventListener('approval-changed',refresh);
sb.auth.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'){epoch++;snapshot=null;shortcuts.forEach(a=>a.hidden=true);if(root)root.innerHTML='<p>Entre novamente para consultar suas aprovações.</p>'}});
refresh();
})();
