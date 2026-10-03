(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const validViews=new Set(["menu","today","calendar","calendar_links","reservations","notifications","changes","finance","access","guests","properties","settings"]);
const requestedView=new URLSearchParams(location.search).get("view")==="guarantees"?"reservations":new URLSearchParams(location.search).get("view");
let propertyGallery=[], propertyCover="";
let session=null,state=null,currentView=validViews.has(requestedView)?requestedView:"today",calendarMonth=new Date().toISOString().slice(0,7),filters={search:"",status:"all",property:"all"};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
const shortDate=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}):"—";
const dateTime=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const prop=id=>state?.properties.find(p=>Number(p.id)===Number(id));
const byReservation=(rows,id)=>rows.filter(x=>String(x.reservation_id)===String(id));
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando pagamento",hold:"Pagamento iniciado",cancelled:"Cancelada",not_confirmed:"Não confirmada",no_show:"Não compareceu",pending:"Pendente",paid:"Pago",refused:"Recusado",under_review:"Em análise",processing:"Processando",awaiting_payment:"Aguardando pagamento",expired:"Expirado",requested:"Solicitada",quoted:"Aguardando análise",rejected:"Recusada",payment_expired:"Pagamento não realizado",accepted:"Aceita",applied:"Aplicada",active:"Ativa",authorized:"Autorizada",guaranteed:"Autorizada",partially_captured:"Capturada parcialmente",partially_refunded:"Estornado parcialmente",refunded:"Estornado",failed:"Falhou",pending_authorization:"Aguardando autorização",released:"Liberada",captured:"Capturada",incident_reported:"Ocorrência registrada",capture_requested:"Captura solicitada",upgraded:"Substituído"}[s]||String(s||"—").replaceAll("_"," "));
const sourceLabel=s=>({direct:"Site",manual:"Manual",airbnb:"Airbnb",booking:"Booking.com",ical:"Calendário externo",operational:"Bloqueio operacional"}[s]||s);
const statusClass=s=>["confirmed","paid","applied","checked_in","checked_out"].includes(s)?"is-success":["cancelled","not_confirmed","refused","expired","no_show"].includes(s)?"is-muted":["under_review","pending_payment","hold","awaiting_payment"].includes(s)?"is-warning":"";

async function api(action,body={}){
  const endpoint=["authorize","authorize_saved","status","report_incident","decide_incident","attach_incident_evidence","capture","release","refund","retry_refund","authorization_history","recover_authorization"].includes(action)&&body.guarantee_id?C.guaranteeEngine:ENGINE;
  const r=await fetch(endpoint+"?action="+action,{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...body})});
  const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));
  if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});
  return d;
}

async function boot(){
  const {data:{session:s}}=await sb.auth.getSession();session=s;
  if(!session){location.href="auth.html?mode=login&return="+encodeURIComponent("admin.html"+location.search);return}
  const {data:p}=await sb.from("profiles").select("role,full_name").eq("id",session.user.id).single();
  if(p?.role==="host"){location.href="meus-imoveis.html";return}
  if(p?.role!=="admin"){$("#admin-loading").textContent="Esta área é restrita à administração.";return}
  $("#admin-user").textContent=p.full_name||session.user.email;
  bind();await load();
}
function bind(){
  $("#admin-nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(!b||!state)return;showView(b.dataset.view);document.body.classList.remove("admin-menu-open")});
  $("#admin-refresh").onclick=()=>load(true);
  $("#admin-notification-shortcut").onclick=()=>{if(state)showView("notifications")};
  $("#admin-menu").onclick=()=>document.body.classList.toggle("admin-menu-open");
  $("#admin-logout").onclick=async()=>{await sb.auth.signOut();location.href="auth.html"};
  $$('[data-close-drawer]').forEach(x=>x.onclick=closeDrawer);
  $$('[data-close-modal]').forEach(x=>x.onclick=closeModal);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeDrawer();closeModal()}});
}
async function load(silent=false){
  if(!silent){$("#admin-loading").hidden=false;$("#admin-content").hidden=true}
  try{
    const start=new Date();start.setMonth(start.getMonth()-2);const end=new Date();end.setMonth(end.getMonth()+12);
    const [hub,cancelRequestsResult,guestResult]=await Promise.all([
      api("admin_hub",{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}),
      api("reservation_cancel_request",{operation:"list"}).then(value=>({value}),error=>({error})),
      api("admin_guests").then(value=>({value}),error=>({error}))
    ]);
    state={...hub,cancel_requests:cancelRequestsResult.value?.requests||[],guest_contacts:guestResult.value?.contacts||[],guest_links:guestResult.value?.links||[],guest_error:!!guestResult.error};
    applyGuestContacts();
    updateCounts();showView(currentView);pollSameDayPriority();const requestId=new URLSearchParams(location.search).get("request");if(requestId&&!window.sameDayLinkOpened){window.sameDayLinkOpened=true;openSameDayReview(requestId)}
    $("#admin-loading").hidden=true;$("#admin-content").hidden=false;$("#admin-app").setAttribute("aria-busy","false");
  }catch(e){$("#admin-loading").textContent="Não foi possível carregar a operação. Atualize a página ou tente novamente em instantes."}
}
function updateCounts(){
  const t=today(),todayRows=state.reservations.filter(r=>r.status==="confirmed"&&(r.check_in===t||r.check_out===t));
  const unread=state.notifications.filter(n=>!n.read_at).length;
  $("#nav-today-count").textContent=todayRows.length;$("#nav-alert-count").textContent=unread;$("#top-alert-count").textContent=unread;
  $("#nav-alert-count").hidden=!unread;$("#top-alert-count").hidden=!unread;
}
function showView(view){
  if(!validViews.has(view))view="today";
  currentView=view;$$('#admin-nav [data-view]').forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  const nextUrl=view==="today"?"admin.html":`admin.html?view=${encodeURIComponent(view)}`;
  history.replaceState(null,"",nextUrl);
  const names={calendar_links:["INTEGRAÇÕES POR IMÓVEL","Links de calendários"],guests:["CADASTRO E HISTÓRICO","Hóspedes"],access:["AUDIÊNCIA DO SITE","Acessos"],today:["OPERAÇÃO DE HOJE","Visão geral"],calendar:["AGENDA UNIFICADA","Calendário"],reservations:["TODAS AS ESTADIAS","Reservas"],notifications:["CENTRAL DE ATENÇÃO","Notificações"],changes:["PEDIDOS DOS HÓSPEDES","Alterações de reserva"],finance:["MOVIMENTAÇÃO","Financeiro"],properties:["PORTFÓLIO","Imóveis"],settings:["REGRAS DA OPERAÇÃO","Configurações"]};
  $("#admin-context").textContent=names[view][0];$("#admin-title").textContent=names[view][1];
  ({calendar_links:renderCalendarLinks,guests:renderGuests,access:renderAccess,today:renderToday,calendar:renderCalendar,reservations:renderReservations,notifications:renderNotifications,changes:renderChanges,finance:renderFinance,properties:renderProperties,settings:renderSettings}[view]||renderToday)();
}
function guestError(error){return ({invalid_phone:'Informe DDD e telefone; para números internacionais, use + e o código do país.',invalid_contact:'Informe um nome de 2 a 160 caracteres.',stay_not_found:'O período não está mais disponível no calendário. Atualize e confira as datas.',stay_already_linked:'Esta estadia já possui outro hóspede. Remova o vínculo anterior antes de trocar.',guest_directory_volume_limit:'O cadastro atingiu o limite de consulta. Solicite ampliação antes de continuar.'})[error.message]||'Não foi possível concluir. Atualize a página e tente novamente.';}
function stayKey(r){return String(r.id).includes(':')?r.id:'reservation:'+r.id;}
function guestStayRows(){return [...state.reservations.map(r=>({...r,stay_key:stayKey(r)})),...state.channel_periods.filter(r=>r.status!=='integration_error').map(r=>({...r,check_in:r.start,check_out:r.end,stay_key:r.id}))].sort((a,b)=>{const t=today(),au=a.check_out>=t,bu=b.check_out>=t;return au!==bu?(au?-1:1):au?a.check_in.localeCompare(b.check_in):b.check_in.localeCompare(a.check_in)});}
function stayDescription(r){return `${sourceLabel(r.source)} · ${prop(r.property_id)?.name||'Imóvel'} · ${date(r.check_in||r.start)} a ${date(r.check_out||r.end)}${r.confirmation_code?' · '+r.confirmation_code:''}`;}
function applyGuestContacts(){
 for(const r of [...state.reservations,...(state.channel_periods||[])]){
  const link=state.guest_links.find(l=>l.stay_key===stayKey(r)),guest=state.guest_contacts.find(g=>g.id===link?.guest_id);
  if(guest){r.guest_name=guest.name;r.guest_phone=guest.phone;r.contact_id=guest.id;}
 }
}
function stayButton(r){return !String(r.id).includes(':')?`data-reservation="${esc(r.id)}"`:['airbnb','booking','ical'].includes(r.source)&&r.status!=='integration_error'?`data-guest-stay="${esc(r.id)}"`:'disabled';}
let guestSearch='';
function renderGuests(){
 $('#admin-content').innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>CONTATOS DA OPERAÇÃO</small><h2>Hóspedes</h2></div><button id="new-guest" ${state.guest_error?'disabled':''}>+ Novo hóspede</button></div><p>Um cadastro pode ser vinculado a várias estadias. Atualize o telefone aqui ou abra uma reserva no calendário.</p>${state.guest_error?'<p role="alert">Não foi possível consultar os hóspedes. Clique em Atualizar para tentar novamente.</p>':'<label class="admin-search">Buscar por nome ou telefone<input id="guest-search" type="search" placeholder="Nome ou telefone"></label><div id="guest-results" class="admin-stack"></div>'}</section>`;
 $('#new-guest').onclick=()=>openGuest();
 if(state.guest_error)return;
 $('#guest-search').value=guestSearch;$('#guest-search').oninput=e=>{guestSearch=e.target.value;renderGuestResults()};renderGuestResults();
}
function renderGuestResults(){
 const q=guestSearch.trim().toLocaleLowerCase('pt-BR'),digits=q.replace(/\D/g,'');
 const rows=state.guest_contacts.filter(g=>!q||g.name.toLocaleLowerCase('pt-BR').includes(q)||(digits&&g.phone?.includes(digits)));
 $('#guest-results').innerHTML=rows.map(g=>`<article class="admin-operation-card"><div><h3>${esc(g.name)}</h3><p>${esc(g.phone||'Telefone não informado')}</p><small>${state.guest_links.filter(l=>l.guest_id===g.id).length} estadia(s) vinculada(s)</small></div><button data-edit-guest="${esc(g.id)}">Ver e editar</button></article>`).join('')||empty('Nenhum hóspede encontrado.');
 $$('[data-edit-guest]').forEach(b=>b.onclick=()=>openGuest(b.dataset.editGuest));
}
async function refreshGuestView(){await load(true);if(!$('#reservation-drawer').hidden)closeDrawer();}
function openGuest(id=null,stay=null){
 if(state.guest_error){alert('Cadastro indisponível. Atualize a página antes de continuar.');return;}
 const g=state.guest_contacts.find(g=>g.id===id)||{id:crypto.randomUUID(),name:'',phone:'',notes:''},links=state.guest_links.filter(l=>l.guest_id===g.id);
 const available=guestStayRows().filter(r=>!state.guest_links.some(l=>l.stay_key===r.stay_key));
 $('#admin-modal-content').innerHTML=`<small>CADASTRO DE HÓSPEDE</small><h2>${id?'Editar hóspede':'Novo hóspede'}</h2>${stay?`<p>Vincular a ${esc(stayDescription(stay))}</p>`:''}<form id="guest-form" class="admin-form"><label>Nome<input name="name" required minlength="2" maxlength="160" autocomplete="off" value="${esc(g.name)}"></label><label>Telefone<input name="phone" type="tel" maxlength="30" placeholder="(27) 99999-9999" value="${esc(g.phone)}"></label><label>Observações internas<textarea name="notes" maxlength="2000" rows="2">${esc(g.notes)}</textarea></label><p>Este contato é compartilhado por todas as estadias vinculadas.</p><p class="admin-form-message" role="status"></p><button class="admin-primary" type="submit">${stay?'Salvar e vincular':'Salvar hóspede'}</button></form>${id?`<section><h3>Estadias vinculadas</h3>${links.map(l=>{const current=guestStayRows().find(r=>r.stay_key===l.stay_key);return `<article class="guest-linked-stay"><p>${esc(stayDescription(current||l))}</p>${!current?'<small>Período ausente no calendário consultado. Confira se houve alteração de datas.</small>':''}<button type="button" data-unlink-stay="${esc(l.stay_key)}">Desvincular</button></article>`}).join('')||'<p>Nenhuma estadia vinculada.</p>'}<form id="guest-link-form" class="admin-form"><label>Vincular outra estadia<select name="stay_key" required><option value="">Selecione uma estadia</option>${available.map(r=>`<option value="${esc(r.stay_key)}">${esc(stayDescription(r))}</option>`).join('')}</select></label><p role="status"></p><button type="submit" ${available.length?'':'disabled'}>Vincular estadia</button></form><p>Se uma reserva externa mudar de datas, confira e refaça o vínculo com o novo período.</p></section>`:''}`;
 openModal();const form=$('#guest-form');let saved=false;
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button'),m=form.querySelector('[role="status"]');b.disabled=true;m.textContent='Salvando…';
  try{await api('admin_guests',{operation:'save',id:g.id,name:form.elements.name.value,phone:form.elements.phone.value,notes:form.elements.notes.value});saved=true;if(stay)await linkGuestStay(g.id,stay.stay_key);await refreshGuestView();openGuest(g.id);$('#guest-form [role="status"]').textContent=stay?'Hóspede salvo e vinculado.':'Hóspede salvo.';}
  catch(err){m.textContent=(saved&&stay?'O contato foi salvo, mas o vínculo não foi concluído. ':'')+guestError(err);b.disabled=false;}
 };
 const lf=$('#guest-link-form');if(lf)lf.onsubmit=async e=>{e.preventDefault();const b=lf.querySelector('button');b.disabled=true;try{await linkGuestStay(g.id,lf.elements.stay_key.value);await refreshGuestView();openGuest(g.id);$('#guest-link-form [role="status"]').textContent='Estadia vinculada.';}catch(err){lf.querySelector('[role="status"]').textContent=guestError(err);b.disabled=false;}};
 $$('[data-unlink-stay]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('admin_guests',{operation:'unlink',guest_id:g.id,stay_key:b.dataset.unlinkStay});await refreshGuestView();openGuest(g.id);}catch(err){$('#guest-form [role="status"]').textContent=guestError(err);b.disabled=false;}});
}
async function linkGuestStay(guestId,key){return api('admin_guests',{operation:'link',guest_id:guestId,...(key.startsWith('reservation:')?{reservation_id:key.slice(12)}:{stay_key:key})});}
function openStayGuest(key){
 if(state.guest_error){alert('Cadastro indisponível. Atualize a página antes de continuar.');return;}
 const stay=guestStayRows().find(r=>r.stay_key===key);if(!stay)return;
 const link=state.guest_links.find(l=>l.stay_key===key);if(link){openGuest(link.guest_id);return;}
 $('#admin-modal-content').innerHTML=`<small>HÓSPEDE DA ESTADIA</small><h2>Vincular contato</h2><p>${esc(stayDescription(stay))}</p><form id="stay-guest-form" class="admin-form"><label>Hóspede cadastrado<select name="guest_id" required><option value="">Selecione um hóspede</option>${state.guest_contacts.map(g=>`<option value="${esc(g.id)}">${esc(g.name)} · ${esc(g.phone||'Sem telefone')}</option>`).join('')}</select></label><p role="status"></p><button type="submit" class="admin-primary" ${state.guest_contacts.length?'':'disabled'}>Vincular hóspede</button><button type="button" id="stay-new-guest">Cadastrar novo hóspede</button></form>`;
 openModal();$('#stay-new-guest').onclick=()=>openGuest(null,stay);const f=$('#stay-guest-form');f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{const id=f.elements.guest_id.value;await linkGuestStay(id,key);await refreshGuestView();openGuest(id);$('#guest-form [role="status"]').textContent='Hóspede vinculado.';}catch(err){f.querySelector('[role="status"]').textContent=guestError(err);b.disabled=false;}};
}

let accessDays=30,accessRequest=0;
async function renderAccess(){
 const request=++accessRequest;
 $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-section-head"><h2>Acessos ao site e aos chalés</h2><label>Período <select id="access-period">${[7,30,90].map(d=>`<option value="${d}" ${d===accessDays?"selected":""}>Últimos ${d} dias</option>`).join("")}</select></label></div><p>Visualizações contam aberturas de páginas, incluindo recargas. Sessões são visitas neste navegador/aba, renovadas após 30 minutos sem abrir uma página; não representam pessoas únicas.</p><div id="access-results" role="status">Carregando acessos…</div></section>`;
 $("#access-period").onchange=e=>{accessDays=Number(e.target.value);renderAccess()};
 try{
  const d=await api("admin_access_metrics",{days:accessDays});
  if(currentView!=="access"||request!==accessRequest)return;
  const top=d.ranking.filter(p=>p.views>0&&p.views===d.ranking[0]?.views);
  const total=d.ranking.reduce((n,p)=>n+p.views,0);
  $("#access-results").innerHTML=`<div class="admin-kpis">${kpi("Visualizações do site",d.page_views,"Páginas públicas e reserva")}${kpi("Sessões",d.sessions,"Estimativa por navegador/aba")}${kpi("Chalé mais acessado",top.length?esc(top.map(p=>p.name).join(" / ")):"Sem dados",top.length>1?"Empate em visualizações":"Por visitas à página do chalé")}</div><div style="overflow-x:auto"><table style="width:100%;text-align:left"><caption>Ranking de acessos aos chalés</caption><thead><tr><th scope="col">Chalé</th><th scope="col">Visualizações</th><th scope="col">Sessões</th><th scope="col">Participação</th><th scope="col">Reservas confirmadas</th><th scope="col">Conversão</th></tr></thead><tbody>${d.ranking.map(p=>`<tr><th scope="row">${esc(p.name)}</th><td>${p.views}</td><td>${p.sessions}</td><td>${total?(100*p.views/total).toLocaleString("pt-BR",{maximumFractionDigits:1}):"0"}%</td><td>${p.confirmed_bookings??0}</td><td>${p.conversion_percent==null?"—":p.conversion_percent.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%"}</td></tr>`).join("")}</tbody></table></div><p>${d.page_views?"":"Nenhum acesso registrado neste período. "}Conversão = reservas confirmadas e pagas vinculadas às sessões que visitaram este chalé ÷ sessões do chalé. Canceladas e reservas sem vínculo não entram. Uma sessão pode gerar mais de uma reserva. A coleta começa com a ativação deste recurso; não recupera visitas anteriores. Preferências de privacidade e bloqueadores podem reduzir a contagem. Acessos de desenvolvimento são testes, não audiência de produção.</p>`;
 }catch{
  if(currentView==="access"&&request===accessRequest)$("#access-results").textContent="Não foi possível consultar os acessos. Os números não foram tratados como zero. Tente atualizar ou escolher outro período.";
 }
}
function kpi(label,value,detail,tone="") {return `<article class="admin-kpi ${tone}"><small>${label}</small><strong>${value}</strong><span>${detail}</span></article>`}
function reservationCard(r,context=""){
  const p=prop(r.property_id),orders=byReservation(state.experience_orders,r.id).filter(o=>o.status==="active");
  const items=orders.flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  return `<button class="admin-stay-card" data-reservation="${r.id}">
    <div><small>${esc(context||sourceLabel(r.source))}</small><h3>${esc(r.guest_name||"Hóspede não informado")}</h3><p>${esc(p?.name||"Imóvel")} · ${r.guests} hóspede${r.guests===1?"":"s"}</p></div>
    <div class="admin-stay-dates"><strong>${shortDate(r.check_in)}</strong><span>→</span><strong>${shortDate(r.check_out)}</strong><small>${esc((p?.check_in_time||"15:00").slice(0,5))} / ${esc((p?.check_out_time||"11:00").slice(0,5))}</small></div>
    <div class="admin-stay-meta"><span class="admin-status ${statusClass(r.status)}">${statusLabel(r.status)}</span>${items.length?`<em>${items.length} experiência${items.length>1?"s":""}</em>`:""}</div>
  </button>`;
}
function renderToday(){
  const t=today(),tom=new Date(t+"T12:00:00");tom.setDate(tom.getDate()+1);const tomorrow=tom.toISOString().slice(0,10);
  const active=state.reservations.filter(r=>r.status==="confirmed"),arrivals=active.filter(r=>r.check_in===t),departures=active.filter(r=>r.check_out===t),inHouse=active.filter(r=>r.check_in<=t&&r.check_out>t),next=active.filter(r=>r.check_in===tomorrow);
  const pendingMods=state.modifications.filter(m=>["requested","quoted"].includes(m.status));
  const underReview=state.payments.filter(p=>p.status==="under_review");
  const unread=state.notifications.filter(n=>!n.read_at);
  $("#admin-content").innerHTML=`
    <div class="admin-kpis">${kpi("Entradas hoje",arrivals.length,arrivals.length?"Preparar recepção":"Nenhuma chegada")}${kpi("Saídas hoje",departures.length,departures.length?"Conferir checkout":"Nenhuma saída")}${kpi("Hospedados",inHouse.length,"Estadias em andamento")}${kpi("Precisam de atenção",pendingMods.length+underReview.length+unread.filter(n=>n.severity==="critical").length,"Ações e alertas",pendingMods.length||underReview.length?"attention":"")}</div>
    <div class="admin-two-col">
      <section class="admin-panel"><div class="admin-panel-head"><div><small>HOJE</small><h2>Entradas</h2></div><span>${arrivals.length}</span></div><div class="admin-stack">${arrivals.length?arrivals.map(r=>reservationCard(r,"CHECK-IN · "+(prop(r.property_id)?.check_in_time||"15:00").slice(0,5))).join(""):empty("Nenhuma entrada prevista para hoje.")}</div></section>
      <section class="admin-panel"><div class="admin-panel-head"><div><small>HOJE</small><h2>Saídas</h2></div><span>${departures.length}</span></div><div class="admin-stack">${departures.length?departures.map(r=>reservationCard(r,"CHECK-OUT · "+(prop(r.property_id)?.check_out_time||"11:00").slice(0,5))).join(""):empty("Nenhuma saída prevista para hoje.")}</div></section>
    </div>
    <div class="admin-two-col">
      <section class="admin-panel"><div class="admin-panel-head"><div><small>AMANHÃ</small><h2>Próximas entradas</h2></div><span>${next.length}</span></div><div class="admin-stack">${next.length?next.map(r=>reservationCard(r,"AMANHÃ")).join(""):empty("Nenhuma entrada prevista para amanhã.")}</div></section>
      <section class="admin-panel"><div class="admin-panel-head"><div><small>ATENÇÃO</small><h2>Pendências</h2></div><button data-go-notifications>Ver todas</button></div><div class="admin-stack">${renderAttentionItems(unread.slice(0,6),pendingMods,underReview)}</div></section>
    </div>`;
  bindCards();const go=$("[data-go-notifications]");if(go)go.onclick=()=>showView("notifications");
}
function empty(text){return `<div class="admin-empty">${esc(text)}</div>`}
function renderAttentionItems(unread,mods,payments){
  const rows=[];
  state.guarantees.filter(g=>g.attention_code||(['guaranteed','incident_reported'].includes(g.status)&&(!Number.isFinite(Date.parse(g.provider_capture_before||''))||Date.parse(g.provider_capture_before||'')<=Date.now()+86400000))).slice(0,6).forEach(g=>rows.push(`<button class="admin-attention warning" data-reservation="${g.reservation_id}"><strong>Caução precisa de atenção</strong><span>${esc(guaranteeAttention(g.attention_code)||'Verifique o prazo da autorização e a cobertura da estadia.')}</span></button>`));
  unread.forEach(n=>rows.push(`<button class="admin-attention ${n.severity}" data-notification="${n.id}" data-reservation="${n.reservation_id||""}"><strong>${esc(n.title)}</strong><span>${esc(n.message||"")}</span><small>${dateTime(n.created_at)}</small></button>`));
  mods.slice(0,3).forEach(m=>rows.push(`<button class="admin-attention warning" data-reservation="${m.reservation_id}"><strong>Alteração aguardando análise</strong><span>${date(m.requested_check_in)} a ${date(m.requested_check_out)}</span></button>`));
  payments.slice(0,3).forEach(p=>rows.push(`<button class="admin-attention warning" data-reservation="${p.reservation_id}"><strong>Pagamento em análise</strong><span>${brl(p.amount_cents)}</span></button>`));
  return rows.length?rows.join(""):empty("Nenhuma pendência agora.");
}
function bindCards(){
  $$('[data-guest-stay]').forEach(b=>b.onclick=()=>openStayGuest(b.dataset.guestStay));
  $$('[data-reservation]').forEach(b=>b.onclick=e=>{const id=b.dataset.reservation;const notification=state.notifications.find(n=>n.id===b.dataset.notification);if(notification?.entity_type==="same_day_request")openSameDayReview(notification.entity_id);else if(id)openReservation(id);const nid=b.dataset.notification;if(nid)markNotification(nid)});
}

function monthBounds(value){const [y,m]=value.split("-").map(Number),start=`${y}-${String(m).padStart(2,"0")}-01`,endDate=new Date(Date.UTC(y,m,1)),end=endDate.toISOString().slice(0,10);return {y,m,start,end,days:new Date(Date.UTC(y,m,0)).getUTCDate()}}
function renderCalendar(){
  const b=monthBounds(calendarMonth),direct=state.reservations.filter(r=>["confirmed","pending_payment","hold"].includes(r.status)&&r.check_in<b.end&&r.check_out>b.start),manual=(state.calendar_blocks||[]).filter(x=>x.status==="active"&&x.start_date<b.end&&x.end_date>b.start).map(x=>({...x,id:`block:${x.id}`,source:"operational",start:x.start_date,end:x.end_date,guest_name:x.reason,status:"blocked"})),external=[...state.channel_periods.filter(x=>x.start<b.end&&x.end>b.start),...manual];
  const dayHeads=Array.from({length:b.days},(_,i)=>{const d=new Date(Date.UTC(b.y,b.m-1,i+1));return `<span class="${d.toISOString().slice(0,10)===today()?"today":""}"><b>${i+1}</b><small>${d.toLocaleDateString("pt-BR",{weekday:"narrow",timeZone:"UTC"})}</small></span>`}).join("");
  $("#admin-content").innerHTML=`<section class="admin-panel calendar-panel"><div class="admin-calendar-toolbar"><div><button data-month-prev>‹</button><input id="calendar-month" type="month" value="${calendarMonth}"><button data-month-next>›</button><button data-month-today>Hoje</button><button id="manage-calendar-links">Gerenciar links</button></div><div class="calendar-legend"><span class="direct">Site</span><span class="airbnb">Airbnb</span><span class="booking">Booking</span><span class="ical">Outros calendários</span><span class="operational">Operação</span><span class="pending">Pagamento</span></div></div>
    <div class="calendar-scroll"><div class="admin-calendar-grid" style="--days:${b.days}"><div class="calendar-corner">Imóvel</div><div class="calendar-days">${dayHeads}</div>${state.properties.filter(p=>p.active).map(p=>calendarRow(p,b,direct,external)).join("")}</div></div>
    <div class="calendar-mobile-agenda">${[...direct.map(x=>({...x,start:x.check_in,end:x.check_out})),...external].sort((a,b)=>a.start.localeCompare(b.start)).map(x=>calendarAgendaItem(x)).join("")||empty("Nenhuma ocupação neste mês.")}</div></section>`;
  $("#manage-calendar-links").onclick=()=>showView("calendar_links");$$('[data-calendar-availability]').forEach(b=>b.onclick=()=>openAvailability(Number(b.dataset.calendarAvailability)));
  $("#calendar-month").onchange=e=>{calendarMonth=e.target.value;renderCalendar()};
  $("[data-month-prev]").onclick=()=>changeMonth(-1);$("[data-month-next]").onclick=()=>changeMonth(1);$("[data-month-today]").onclick=()=>{calendarMonth=today().slice(0,7);renderCalendar()};bindCards();
}
function changeMonth(delta){const [y,m]=calendarMonth.split("-").map(Number),d=new Date(Date.UTC(y,m-1+delta,1));calendarMonth=d.toISOString().slice(0,7);renderCalendar()}
function calendarRow(p,b,direct,external){
  const events=[...direct.filter(r=>Number(r.property_id)===Number(p.id)).map(r=>({...r,start:r.check_in,end:r.check_out,source:r.source||"direct"})),...external.filter(e=>Number(e.property_id)===Number(p.id))];
  const laneEnds=[];events.sort((a,c)=>a.start.localeCompare(c.start));
  const bars=events.map(e=>{let lane=laneEnds.findIndex(end=>end<=e.start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=e.end;const start=Math.max(1,Math.floor((Date.parse(e.start)-Date.parse(b.start))/86400000)+1),finish=Math.min(b.days+1,Math.floor((Date.parse(e.end)-Date.parse(b.start))/86400000)+1),left=(start-1)/b.days*100,width=Math.max(2,(finish-start)/b.days*100);const label=e.guest_name||e.calendar_label||sourceLabel(e.source);const contact=e.guest_phone||"Telefone não informado";const packages=e.id&&!String(e.id).includes(":")?byReservation(state.experience_orders,e.id).flatMap(o=>o.experience_order_items||[]).filter(x=>x.status==="active").length:0;return `<button class="calendar-event ${esc(e.source)} ${e.status==="pending_payment"||e.status==="hold"?"pending":""}" style="left:${left}%;width:${width}%;top:${8+lane*44}px" ${stayButton(e)} aria-label="${esc(label)} · ${esc(contact)}" title="${esc(label)} · ${esc(e.calendar_label||sourceLabel(e.source))} · ${esc(contact)} · ${date(e.start)} a ${date(e.end)}"><strong>${esc(label)}</strong><small class="calendar-guest-phone">${esc(contact)}</small>${packages?`<em>+${packages} pacote${packages>1?"s":""}</em>`:""}</button>`}).join("");
  return `<div class="calendar-property"><strong>${esc(p.name)}</strong><small>${esc(p.code)}</small><button data-calendar-availability="${p.id}">Disponibilidade</button></div><div class="calendar-track" style="min-height:${Math.max(150,laneEnds.length*44+16)}px">${Array.from({length:b.days},()=>"<i></i>").join("")}${bars}</div>`;
}
function calendarAgendaItem(e){const p=prop(e.property_id);return `<button class="calendar-agenda-item" ${stayButton(e)}><span class="calendar-source ${esc(e.source)}">${esc(sourceLabel(e.source))}</span><div><strong>${esc(e.guest_name||e.calendar_label||"Hóspede não informado")}</strong><small>${esc(e.guest_phone||"Telefone não informado")}</small><small>${esc(p?.name||"")} · ${date(e.start||e.check_in)} a ${date(e.end||e.check_out)}</small></div></button>`}

function renderReservations(){
  const rows=filteredReservations();
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>GESTÃO DE RESERVAS</small><h2>Estadias</h2></div><button id="new-reservation">+ Nova reserva manual</button></div><div class="admin-filters"><label class="admin-search">Buscar<input id="reservation-search" value="${esc(filters.search)}" placeholder="Nome, código, telefone ou e-mail"></label><label>Status<select id="reservation-status"><option value="all">Todos</option>${["confirmed","pending_payment","hold","cancelled","not_confirmed","no_show"].map(s=>`<option value="${s}" ${filters.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select></label><label>Imóvel<select id="reservation-property"><option value="all">Todos</option>${state.properties.map(p=>`<option value="${p.id}" ${String(filters.property)===String(p.id)?"selected":""}>${esc(p.name)}</option>`).join("")}</select></label></div><div class="admin-reservation-summary"><strong>${rows.length}</strong> reservas encontradas</div><div class="admin-reservation-list">${rows.length?rows.map(r=>reservationCard(r)).join(""):empty("Nenhuma reserva corresponde aos filtros.")}</div></section>`;
  $("#new-reservation").onclick=openManualReservation;$("#reservation-search").oninput=e=>{filters.search=e.target.value;renderReservations()};$("#reservation-status").onchange=e=>{filters.status=e.target.value;renderReservations()};$("#reservation-property").onchange=e=>{filters.property=e.target.value;renderReservations()};bindCards();
}
function filteredReservations(){
  const q=filters.search.trim().toLowerCase(),reference=today();
  return state.reservations.filter(r=>(filters.status==="all"||r.status===filters.status)&&(filters.property==="all"||String(r.property_id)===String(filters.property))&&(!q||[r.guest_name,r.guest_email,r.guest_phone,r.confirmation_code,prop(r.property_id)?.name].some(v=>String(v||"").toLowerCase().includes(q)))).sort((a,b)=>{
    const aUpcoming=a.check_out>=reference,bUpcoming=b.check_out>=reference;
    if(aUpcoming!==bUpcoming)return aUpcoming?-1:1;
    return aUpcoming?a.check_in.localeCompare(b.check_in):b.check_in.localeCompare(a.check_in);
  })
}

let sameDayPolling=false;
async function pollSameDayPriority(){
 if(!session||!state||document.hidden||sameDayPolling)return;sameDayPolling=true;
 try{const {requests}=await api('same_day_request',{operation:'list'}),count=requests.filter(r=>r.status==='pending').length;
 let bar=$('#same-day-priority');if(!bar){bar=document.createElement('button');bar.id='same-day-priority';bar.className='same-day-priority';$('#admin-app').prepend(bar);bar.onclick=()=>showView('notifications')}
 bar.hidden=count===0;bar.textContent=`URGENTE · ${count} pedido(s) de reserva para hoje — analisar`;
 if(currentView==='notifications')renderSameDayQueue();
 }catch{}finally{sameDayPolling=false}
}
setInterval(pollSameDayPriority,30000);
async function renderSameDayQueue(){
 const host=$('#same-day-queue');if(!host)return;
 try{const {requests}=await api('same_day_request',{operation:'list'});if(!host.isConnected)return;
 const pending=requests.filter(r=>r.status==='pending');host.innerHTML=`<h3>Prioridade · Pedidos para hoje (${pending.length})</h3>${pending.map(r=>`<button class="notification-row critical unread" data-same-day="${esc(r.id)}"><strong>${esc(r.guest_name)} · ${esc(prop(r.property_id)?.name||'Imóvel')}</strong><span>${date(r.check_in)} a ${date(r.check_out)} · Analisar pedido</span></button>`).join('')||'<p>Nenhum pedido aguardando aprovação.</p>'}`;
 host.querySelectorAll('[data-same-day]').forEach(b=>b.onclick=()=>openSameDayReview(b.dataset.sameDay));
 }catch{if(host.isConnected)host.textContent='Não foi possível consultar os pedidos para hoje.'}
}
async function openSameDayReview(id){
 $('#admin-modal-content').innerHTML='<p>Consultando pedido…</p>';openModal();
 try{const {request:r}=await api('same_day_request',{operation:'get',id});
 const labels={pending:'Aguardando aprovação',approved:'Aprovado para pagamento',rejected:'Recusado',expired:'Expirado',booked:'Reserva criada'};
 $('#admin-modal-content').innerHTML=`<small>URGENTE · RESERVA PARA HOJE</small><h2>${esc(prop(r.property_id)?.name||'Imóvel')}</h2><p><strong>${esc(r.guest_name)}</strong> · ${esc(r.guest_phone)}</p><p>${date(r.check_in)} a ${date(r.check_out)} · ${r.guests} hóspedes</p><p><strong>Chegada prevista:</strong> ${r.estimated_arrival_time?esc(r.estimated_arrival_time)+' (horário de Guarapari)':'Não informada'}</p><p>${esc(r.note)}</p><p>${labels[r.status]||esc(r.status)} · prazo: ${dateTime(r.expires_at)}</p><p>A aprovação libera o checkout por até 1 hora, sem cobrança e sem garantir as datas. A disponibilidade será conferida novamente no pagamento.</p>${r.status==='pending'?'<label>Resposta ao hóspede<textarea id="same-day-decision-note" maxlength="1000"></textarea></label><button id="approve-same-day">Aprovar para pagamento</button><button id="reject-same-day">Recusar pedido</button>':`<p>${esc(r.decision_note||'')}</p>`}<p id="same-day-review-status" role="status"></p>`;
 for(const [selector,operation] of [['#approve-same-day','approve'],['#reject-same-day','reject']]){const button=$(selector);if(button)button.onclick=async()=>{const buttons=$$('#admin-modal-content button');buttons.forEach(b=>b.disabled=true);try{await api('same_day_request',{operation,id,decision_note:$('#same-day-decision-note').value});await load(true);await openSameDayReview(id)}catch(e){$('#same-day-review-status').textContent=e.message==='dates_unavailable'?'Datas indisponíveis: aprovação não realizada.':'O pedido expirou, já foi analisado ou não pôde ser atualizado. Reabra para conferir.';buttons.forEach(b=>b.disabled=false)}}}
 }catch{$('#admin-modal-content').innerHTML='<h2>Pedido indisponível</h2><p>O pedido não foi encontrado ou não pôde ser consultado.</p>'}
}

function renderNotifications(){
  const rows=[...state.notifications].sort((a,b)=>(b.severity==='critical')-(a.severity==='critical'));
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>AVISOS OPERACIONAIS</small><h2>O que precisa da sua atenção</h2></div><button id="mark-all-read">Marcar todas como lidas</button></div><div id="same-day-queue"></div><div class="notification-list">${rows.length?rows.map(n=>`<button class="notification-row ${n.read_at?"read":"unread"} ${n.severity}" data-notification="${n.id}" data-reservation="${n.reservation_id||""}"><i></i><div><small>${esc(n.severity==="critical"?"URGENTE":n.severity==="warning"?"ATENÇÃO":"ATUALIZAÇÃO")}</small><strong>${esc(n.title)}</strong><p>${esc(n.message||"")}</p></div><time>${dateTime(n.created_at)}</time></button>`).join(""):empty("Nenhuma notificação registrada.")}</div></section>`;
  $("#mark-all-read").onclick=async()=>{await api("admin_notification_action",{operation:"mark_all_read"});state.notifications.forEach(n=>n.read_at=new Date().toISOString());updateCounts();renderNotifications()};bindCards();renderSameDayQueue();
}
async function markNotification(id){const n=state.notifications.find(x=>x.id===id);if(!n||n.read_at)return;await api("admin_notification_action",{operation:"mark_read",notification_id:id}).catch(()=>{});n.read_at=new Date().toISOString();updateCounts()}

function renderFinance(){
  const paid=state.payments.filter(p=>p.status==="paid"),realPaid=paid.filter(p=>p.provider!=="mock"),testPaid=paid.filter(p=>p.provider==="mock"),pending=state.payments.filter(p=>["processing","under_review","awaiting_payment"].includes(p.status)),refused=state.payments.filter(p=>p.status==="refused"),total=realPaid.reduce((s,p)=>s+Number(p.amount_cents||0),0),testTotal=testPaid.reduce((s,p)=>s+Number(p.amount_cents||0),0);
  $("#admin-content").innerHTML=`<div class="admin-kpis">${kpi("Recebido",brl(total),realPaid.length+" pagamentos reais")}${kpi("Simulado",brl(testTotal),testPaid.length+" pagamentos de teste")}${kpi("Em andamento",pending.length,"Aguardando conclusão")}${kpi("Recusados",refused.length,"Podem exigir contato")}${kpi("Cobranças adicionais",state.charges.length,"Experiências e alterações")}</div><section class="admin-panel"><div class="admin-panel-head"><div><small>MOVIMENTAÇÃO RECENTE</small><h2>Pagamentos</h2></div></div><div class="finance-list">${state.payments.slice(0,100).map(p=>{const r=state.reservations.find(x=>x.id===p.reservation_id),isTest=p.provider==="mock";return `<button data-reservation="${p.reservation_id}" class="finance-row"><div><strong>${esc(r?.guest_name||r?.confirmation_code||"Reserva")}</strong><span>${esc(prop(r?.property_id)?.name||"")} · ${dateTime(p.created_at)}${isTest?" · TESTE":""}</span></div><span class="admin-status ${statusClass(p.status)}">${statusLabel(p.status)}</span><b>${brl(p.amount_cents)}</b></button>`}).join("")||empty("Nenhum pagamento registrado.")}</div></section>`;bindCards();
}

function renderChanges(){
  const rows=state.modifications.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>PEDIDOS DE ALTERAÇÃO</small><h2>Análise e acompanhamento</h2></div><span>${rows.filter(m=>["requested","quoted"].includes(m.status)).length} para analisar</span></div><div class="admin-card-grid">${rows.length?rows.map(m=>changeCard(m)).join(""):empty("Nenhuma alteração de reserva registrada.")}</div></section>`;
  $$('[data-change-approve]').forEach(b=>b.onclick=()=>openChangeDecision(b.dataset.changeApprove,false));
  $$('[data-change-reject]').forEach(b=>b.onclick=()=>openChangeDecision(b.dataset.changeReject,true));
  bindCards();
}
function changeCard(m){
  const r=state.reservations.find(x=>x.id===m.reservation_id),p=prop(m.requested_property_id||r?.property_id),open=["requested","quoted"].includes(m.status),amount=m.admin_additional_amount_cents??m.estimated_additional_amount_cents??0;
  const guidance=m.status==="awaiting_payment"?`Aguardando ${brl(amount)} até ${dateTime(m.payment_due_at)}.`:m.status==="payment_expired"?"Prazo encerrado; a reserva original foi mantida.":m.status==="applied"?"Alteração concluída e aplicada à reserva.":"";
  return `<article class="admin-operation-card"><div><small>${esc(r?.confirmation_code||"RESERVA")} · ${esc(p?.name||"")}</small><h3>${esc(r?.guest_name||"Hóspede")}</h3><p>${date(m.requested_check_in)} → ${date(m.requested_check_out)}</p><span class="admin-status ${statusClass(m.status)}">${statusLabel(m.status)}</span>${guidance?`<p>${esc(guidance)}</p>`:""}</div>${open?`<div class="admin-card-actions"><button data-change-approve="${m.id}">Aprovar</button><button class="danger" data-change-reject="${m.id}">Recusar</button></div>`:`<button data-reservation="${m.reservation_id}">Abrir reserva</button>`}</article>`;
}
function openChangeDecision(id,reject){
  const m=state.modifications.find(x=>x.id===id),suggested=Number(m?.estimated_additional_amount_cents||0)/100;
  $("#admin-modal-content").innerHTML=`<small>ALTERAÇÃO DE RESERVA</small><h2>${reject?"Recusar solicitação":"Aprovar solicitação"}</h2><p>${reject?"A reserva original continuará válida.":"As novas datas serão protegidas durante o prazo de pagamento. A alteração só será aplicada depois do pagamento ou da confirmação de uma alteração gratuita."}</p><form id="change-decision-form" class="admin-form">${reject?"":`<label>Valor adicional (R$)<input name="amount" type="number" min="0" step="0.01" value="${suggested}"></label>`}<label>Observação para o histórico<textarea name="note" rows="3"></textarea></label><p class="admin-form-message"></p><button class="${reject?"admin-danger":"admin-primary"}">${reject?"Confirmar recusa":"Aprovar e avisar hóspede"}</button></form>`;
  openModal();$("#change-decision-form").onsubmit=e=>decideChange(e,id,reject);
}
async function decideChange(e,id,reject){e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Processando…";try{await api("modification_action",{operation:"decide",request_id:id,decision:reject?"reject":"approve",additional_amount_cents:reject?0:Math.round(Number(f.amount.value||0)*100),admin_note:f.note.value});closeModal();await load(true);renderChanges()}catch(err){m.textContent=({dates_unavailable:"As novas datas não estão mais disponíveis.",minimum_stay:"A estadia não atende ao mínimo de noites.",modification_payment_deadline_passed:"O prazo disponível antes do check-in é insuficiente."})[err.message]||"Não foi possível concluir esta decisão."}finally{b.disabled=false}}

function renderGuarantees(){
  const rows=state.guarantees.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>GARANTIAS DE HOSPEDAGEM</small><h2>Pré-autorizações e ocorrências</h2></div></div><div class="admin-card-grid">${rows.length?rows.map(g=>guaranteeCard(g)).join(""):empty("Nenhuma garantia registrada.")}</div></section>`;
  $$('[data-guarantee]').forEach(b=>b.onclick=()=>openGuarantee(b.dataset.guarantee));
}
function guaranteeCard(g){const r=state.reservations.find(x=>x.id===g.reservation_id),verified=g.provider==="pagbank_sandbox"&&!!g.provider_authorization_id;return `<article class="admin-operation-card"><div><small>${esc(r?.confirmation_code||"RESERVA")} · ${esc(prop(r?.property_id)?.name||"")}</small><h3>${esc(r?.guest_name||"Hóspede")}</h3><p>${verified?"Pré-autorização PagBank":"Caução sem pré-autorização confirmada"} · ${brl(g.amount_cents)}</p><span class="admin-status ${statusClass(g.status)}">${verified?statusLabel(g.financial?.status||g.status):"Não autorizada no PagBank"}</span></div><button data-guarantee="${g.id}">Ver garantia</button></article>`}
function guaranteeAttention(code){return ({authorization_declined:"Cartão recusado. Solicite ao hóspede a atualização em Minha conta; a reserva continua confirmada.",renewal_consent_required:"A estadia exige renovação. O hóspede precisa autorizar possíveis bloqueios simultâneos ao atualizar o cartão.",authorization_result_uncertain:"Resultado incerto: consulte o PagBank e recupere a autorização pelo histórico antes de tentar novamente.",authorization_cleanup_pending:"A liberação de uma autorização anterior está pendente. Não solicite novos bloqueios.",card_token_missing:"Falta cartão vinculado; o hóspede pode informá-lo em Minha conta.",authorization_attempts_exhausted:"Limite de três tentativas em 24 horas atingido.",authorization_expired:"Autorização vencida. A reserva exige regularização da caução.",incident_requires_review:"Renovação bloqueada por ocorrência em análise.",identity_unavailable:"Revise os dados do hóspede antes de solicitar a caução.",reservation_changed:"Datas alteradas: a cobertura da caução será reavaliada.",captured_guarantee_dates_changed:"Datas alteradas após captura: revisão manual necessária.",unexpected_provider_capture:"Cobrança inesperada no provedor: investigar antes de qualquer nova operação."})[code]||"";}
async function loadAuthorizationHistory(id){
 const box=$("#guarantee-authorization-history");if(!box)return;
 try{const d=await api("authorization_history",{guarantee_id:id});if(!box.isConnected)return;
  const labels={requested:"Solicitação em andamento",uncertain:"Aguardando conciliação",authorized:"Autorizada",declined:"Recusada",release_pending:"Liberação pendente",released:"Liberada",captured:"Capturada",expired:"Vencida"};
  box.innerHTML='<h3>Autorizações da reserva</h3><p>'+(d.coverage?.covers_checkout?'Autorização atual cobre o checkout.':d.coverage?.active?'A autorização está ativa, mas não cobre o checkout. Acompanhe a renovação.':'Não há cobertura ativa confirmada.')+'</p>'+(d.authorizations||[]).map(a=>`<article><p>${esc(labels[a.state]||a.state)} · ${brl(a.amount_cents)} · ${dateTime(a.created_at)}</p><small>${esc(a.reference_id)}${a.capture_before?' · Válida até '+dateTime(a.capture_before):''}</small>${!a.provider_charge_id&&['requested','uncertain'].includes(a.state)?`<form data-recover-authorization="${a.id}" class="admin-form"><p>Se o PagBank criou a autorização, copie os identificadores do portal. O sistema verificará se ela pertence a esta solicitação.</p><label>ID da cobrança<input name="charge" placeholder="CHAR_…" required></label><label>ID do pedido<input name="order" placeholder="ORDE_…" required></label><p role="status"></p><button>Conferir e vincular autorização</button></form>`:''}</article>`).join('');
  box.querySelectorAll('[data-recover-authorization]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
   try{await api('recover_authorization',{guarantee_id:id,authorization_id:f.dataset.recoverAuthorization,charge_id:f.elements.charge.value.trim(),order_id:f.elements.order.value.trim()});await load(true);openGuarantee(id)}
   catch{f.querySelector('[role="status"]').textContent='Não foi possível verificar o vínculo. Confira os IDs e a referência no PagBank.';b.disabled=false;}
  });
 }catch{box.textContent='Histórico indisponível. Consulte novamente antes de iniciar outra operação.';}
}
function openGuarantee(id){
 const g=state.guarantees.find(x=>x.id===id);if(!g)return;
 const r=state.reservations.find(x=>x.id===g.reservation_id), captured=Number(g.captured_amount_cents||0),refunded=Number(g.refunded_amount_cents||0);
 const retryRefund=(g.guarantee_refunds||[]).find(x=>x.state==="uncertain"&&x.provider_error_code==="40008");
 const active=Boolean(g.provider_authorization_id)&&["guaranteed","incident_reported"].includes(g.status)&&Date.parse(g.provider_capture_before||'')>Date.now()+3600000,pending=(g.incidents||[]).filter(i=>i.decision==="pending"), approved=(g.incidents||[]).find(i=>i.decision==="approved"&&i.status==="open");
 const categories={damage:"Dano",broken_item:"Item quebrado",missing_item:"Item desaparecido",extra_cleaning:"Limpeza extraordinária",penalty:"Multa",other:"Outra ocorrência"};
 $("#admin-modal-content").innerHTML=`<small>GARANTIA · ${esc(r?.confirmation_code||"RESERVA")}</small><h2>Caução da reserva</h2><p>${esc(r?.guest_name||"Hóspede")} · ${esc(prop(r?.property_id)?.name||"")} · ${date(r?.check_in)} a ${date(r?.check_out)}</p>
 <dl class="reservation-finance-values"><dt>Valor exigido</dt><dd>${brl(g.amount_cents)}</dd><dt>Capturado por danos</dt><dd>${brl(captured)}</dd><dt>Estornado</dt><dd>${brl(refunded)}</dd><dt>Disponível para captura</dt><dd>${brl(active?Number(g.amount_cents)-captured:0)}</dd><dt>Liberação confirmada</dt><dd>${g.release_confirmed||g.status==="released"?brl(g.status==="released"?g.amount_cents:g.released_amount_cents):captured>=Number(g.amount_cents)?"Sem saldo a liberar · captura integral":"Aguardando comprovação do provedor"}</dd></dl>
 <p>Estado: ${esc(statusLabel(g.financial?.status||g.status))}. ${g.provider_capture_before?`Validade: ${dateTime(g.provider_capture_before)}.`:""}</p>
 <p role="status">${esc(guaranteeAttention(g.attention_code||g.provider_error_code))}</p><div id="guarantee-authorization-history">Consultando histórico de autorizações…</div>
 ${!active&&["guaranteed","incident_reported"].includes(g.status)?"<p>Captura indisponível: confirme a autorização e sua validade. É necessária uma margem superior a uma hora antes do vencimento.</p>":""}
 <h3>Ocorrências</h3>${(g.incidents||[]).map(i=>`<article><p>${esc(categories[i.category]||"Ocorrência")} · ${esc(i.description)} · ${brl(i.requested_capture_cents)}</p><p>${esc(i.decision||i.status)} · ${dateTime(i.created_at)}</p>${i.decision==="pending"&&i.status==="open"?`<button type="button" data-incident="${i.id}" data-decision="approved" ${active?"":"disabled"}>Aprovar cobrança</button><button type="button" data-incident="${i.id}" data-decision="no_charge">Encerrar sem cobrança</button><button type="button" data-attach-incident="${i.id}">Adicionar comprovantes</button>`:""}${(i.evidence||[]).map(e=>`<button type="button" data-evidence="${esc(e.path)}">Abrir ${esc(e.name||"comprovante")}</button>`).join("")}</article>`).join("")||"<p>Nenhuma ocorrência.</p>"}
 <form id="guarantee-form" class="admin-form"><h3>Nova ocorrência</h3><label>Categoria<select name="category">${Object.entries(categories).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></label><label>Descrição<input name="description" placeholder="Descreva o ocorrido" minlength="5"></label><label>Valor proposto (R$)<input name="amount" type="number" min="0" step="0.01" value="0"></label><label>Fotos<input name="damage_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label>Recibo<input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><p>Registrar uma ocorrência não cobra o hóspede. A cobrança exige decisão e comprovantes.</p><p class="admin-form-message" role="status"></p><div class="drawer-actions"><button type="button" data-guarantee-action="report_incident">Registrar ocorrência</button>${approved&&g.status==="incident_reported"?`<button type="button" data-guarantee-action="capture" data-capture-cents="${approved.requested_capture_cents}" ${active?"":"disabled"}>Cobrar ${brl(approved.requested_capture_cents)}</button>`:""}${g.status==="guaranteed"?'<button type="button" data-guarantee-action="release">Liberar caução</button>':""}${g.status==="pending"?'<button type="button" data-guarantee-action="authorize_saved">Solicitar pré-autorização do cartão vinculado</button>':""}<button type="button" data-guarantee-action="status">Consultar PagBank</button></div>
 ${retryRefund?`<p>O PagBank recusou temporariamente a devolução de ${brl(retryRefund.requested_cents)}. Nenhum estorno foi confirmado.</p><button type="button" data-guarantee-action="retry_refund">Reenviar estorno pendente</button>`:""}
 ${(g.guarantee_refunds||[]).filter(x=>["prepared","dispatching","uncertain"].includes(x.state)).map(x=>`<p>Estorno pendente: ${brl(x.requested_cents)}; confirmado: ${brl(x.confirmed_cents)}. ${x.provider_error_code==="40005"?"O PagBank mantém a chave em uso. Aguardando conciliação; não crie outra solicitação.":"Consulte o PagBank para acompanhar."}</p>`).join("")}
 ${captured>refunded&&!(g.guarantee_refunds||[]).some(x=>["prepared","dispatching","uncertain"].includes(x.state))?`<h3>Estornar cobrança de dano</h3><label>Valor a devolver (R$)<input name="refund_amount" type="number" min="0.01" max="${(captured-refunded)/100}" step="0.01"></label><label>Justificativa<input name="refund_reason" minlength="5"></label><button type="button" data-guarantee-action="refund">Solicitar estorno</button>`:""}</form>`;
 openModal();const f=$("#guarantee-form");f.dataset.operationKey=crypto.randomUUID();f.dataset.refundId=retryRefund?.id||"";
 loadAuthorizationHistory(id);
 $("#admin-modal-content").querySelectorAll("[data-attach-incident]").forEach(b=>b.onclick=()=>{
  f.dataset.incidentId=b.dataset.attachIncident;
  f.querySelector('[data-guarantee-action="report_incident"]').dataset.guaranteeAction="attach_incident_evidence";
  f.querySelector('[data-guarantee-action="attach_incident_evidence"]').textContent="Salvar comprovantes nesta ocorrência";
  f.querySelector('.admin-form-message').textContent="Selecione fotos e recibo abaixo e salve os comprovantes.";
 });
 $("#admin-modal-content").querySelectorAll("[data-evidence]").forEach(b=>b.onclick=async()=>{
  const {data,error}=await sb.storage.from("guarantee-evidence").createSignedUrl(b.dataset.evidence,60);
  if(error)f.querySelector('.admin-form-message').textContent="Não foi possível abrir o comprovante.";
  else window.open(data.signedUrl,"_blank","noopener");
 });

 f.querySelectorAll("[data-guarantee-action]").forEach(b=>b.onclick=()=>runGuaranteeAction(id,b.dataset.guaranteeAction,b.dataset.captureCents));
 $("#admin-modal-content").querySelectorAll("[data-incident]").forEach(b=>b.onclick=async()=>{
   b.disabled=true;const m=f.querySelector(".admin-form-message");m.textContent="Registrando decisão…";
   try{await api("decide_incident",{guarantee_id:id,incident_id:b.dataset.incident,decision:b.dataset.decision});await load(true);openReservation(g.reservation_id);openGuarantee(id);}
   catch(e){m.textContent=e.message==="incident_evidence_missing"?"Anexe fotos e recibo para aprovar a cobrança.":"Não foi possível registrar a decisão.";b.disabled=false;}
 });
}
async function uploadGuaranteeEvidence(id,form,status){
 const damage=[...(form.damage_files?.files||[])],receipt=[...(form.receipt_file?.files||[])];
 if(!damage.length||receipt.length!==1||damage.length>10)throw new Error("incident_files_required");
 const evidence=[];
 for(const [kind,files] of [["damage",damage],["receipt",receipt]])for(const file of files){
  const types={"image/jpeg":"jpg","image/png":"png","image/webp":"webp",...(kind==="receipt"?{"application/pdf":"pdf"}:{})};
  if(!types[file.type]||!file.size||file.size>8388608)throw new Error("incident_file_invalid");
  const path=`${id}/${kind}/${crypto.randomUUID()}.${types[file.type]}`;
  status.textContent=`Enviando ${file.name}…`;
  const {error}=await sb.storage.from("guarantee-evidence").upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw new Error("incident_upload_failed");
  evidence.push({kind,path,name:file.name.slice(0,120),content_type:file.type});
 }
 return evidence;
}
async function runGuaranteeAction(id,operation,captureCents){
 const f=$("#guarantee-form"),m=f.querySelector(".admin-form-message"),buttons=f.querySelectorAll("button");
 buttons.forEach(b=>b.disabled=true);m.textContent="Processando…";
 try{
  const hasFiles=f.damage_files.files.length||f.receipt_file.files.length;
  const evidence=["report_incident","attach_incident_evidence"].includes(operation)&&hasFiles?await uploadGuaranteeEvidence(id,f,m):[];
  const result=await api(operation,{guarantee_id:id,refund_id:f.dataset.refundId,incident_id:f.dataset.incidentId,operation_key:f.dataset.operationKey,
   amount_cents:operation==="capture"?Number(captureCents):Math.round(Number(operation==="refund"?f.refund_amount.value:f.amount.value||0)*100),
   description:f.description.value,category:f.category.value,reason:f.refund_reason?.value,evidence});
  const reservationId=state.guarantees.find(g=>g.id===id)?.reservation_id;
  await load(true);if(reservationId)openReservation(reservationId);openGuarantee(id);
  const message=$("#guarantee-form .admin-form-message");
  if(result.refund&&result.refund.state!=="confirmed")message.textContent=`Estorno pendente de confirmação. Devolvido: ${brl(result.refund.confirmed_cents)}. ${result.refund.provider_error_code==="40008"?"PagBank: reembolso temporariamente indisponível (40008).":"Use Consultar PagBank para conciliar."}`;
  else if(result.guarantee?.status?.includes("requested")||result.guarantee?.status?.includes("uncertain")||result.reconciliation==="unavailable")message.textContent="Resultado pendente. Consulte o PagBank antes de nova ação.";
  else message.textContent=operation==="report_incident"?"Ocorrência registrada, sem cobrança.":operation==="refund"?"Estorno confirmado pelo PagBank.":"Estado consultado e atualizado.";
 }catch(e){m.textContent=({incident_files_required:"Inclua fotos e recibo para solicitar cobrança.",invalid_incident:"Confira a descrição e o valor da ocorrência.",refund_provider_balance_mismatch:"O saldo do PagBank não confere. Consulte a cobrança antes de estornar.",refund_exceeds_captured:"O estorno ultrapassa o valor capturado disponível.",previous_refund_pending:"Há um estorno pendente. Consulte o PagBank.",capture_result_uncertain:"Captura pendente de conciliação. Consulte o PagBank."})[e.message]||"Não foi possível concluir. Consulte o estado da cobrança antes de repetir.";}
 finally{buttons.forEach(b=>b.disabled=false);}
}


function renderSettings(){
  const s=state.settings||{},health=state.channel_health||{};
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>DESENVOLVIMENTO</small><h2>Cancelamento por tarifa</h2></div></div><p>Edite os prazos e salve para criar uma nova versão. Novas cotações de desenvolvimento passam a usar a versão salva. Reservas já aceitas preservam sua versão; o site público continua na configuração atual.</p><div class="admin-two-col">${(state.cancellation_policies||[]).map(row=>{const r=row.cancellation_policy_rules||{},d=r.policy_documents||{},nonref=row.rate_plan_code==="non_refundable";return `<form class="admin-form cancellation-policy-form" data-rate-plan="${esc(row.rate_plan_code)}"><h3>${nonref?"Tarifa não reembolsável":"Tarifa reembolsável"} · versão ${esc(d.version||"—")}</h3><label>Cancelamento comercial gratuito (horas)<input name="commercial_free_cancellation_hours" type="number" min="0" max="720" required value="${Number(r.commercial_free_cancellation_hours??24)}"></label><p>A janela comercial não reduz os prazos já concedidos nem direitos legais. Salvar cria uma nova versão para futuras reservas.</p><label>Prazo adicional preservado após contratação (dias corridos)<input name="withdrawal_days" type="number" min="7" max="30" required value="${Number(r.withdrawal_days||7)}"></label>${nonref?"":`<label>Reembolso integral antes do check-in (dias completos)<input name="full_refund_days_before_checkin" type="number" min="1" max="365" required value="${Number(r.full_refund_days_before_checkin||20)}"></label><label>Hospedagem devolvida após esse prazo (%)<input name="late_accommodation_refund_percent" type="number" min="0" max="100" required value="${Number(r.late_accommodation_refund_percent??50)}"></label>`}<p>Após o direito de arrependimento, ${nonref?"hospedagem não reembolsável":"aplica-se o prazo e percentual acima"}. Limpeza e experiências não prestadas: devolução integral.</p><details><summary>Ler texto desta versão</summary><p style="white-space:pre-line">${esc(d.body||"")}</p></details><p class="admin-form-message" role="status"></p><button class="admin-primary">Salvar nova versão</button></form>`}).join("")||"<p>As tarifas de desenvolvimento ainda não foram configuradas.</p>"}</div></section><div class="admin-two-col"><section class="admin-panel"><div class="admin-panel-head"><div><small>PAGAMENTOS</small><h2>Regras comerciais</h2></div></div><form id="admin-payment-settings" class="admin-form"><p>Configure o máximo de parcelas e as parcelas sem juros em <strong>Imóveis → Editar imóvel</strong>. As parcelas restantes dependem das taxas consultadas no PagBank.</p><label>Gateway<select name="active_provider"><option value="pagbank_sandbox" ${s.active_provider==="pagbank_sandbox"?"selected":""}>PagBank sandbox</option><option value="disabled" ${s.active_provider!=="pagbank_sandbox"?"selected":""}>Pagamentos desativados</option></select></label><label class="admin-checkbox"><input type="checkbox" name="pix_enabled" ${s.pix_enabled?"checked":""}> PIX ativo</label><label class="admin-checkbox"><input type="checkbox" name="card_enabled" ${s.card_enabled?"checked":""}> Cartão ativo</label><label>Validade do Pix (minutos)<input name="pix_expiration_minutes" type="number" min="5" max="1440" value="${Number(s.pix_expiration_minutes||15)}"></label><label>Prazo de pagamento de experiências (minutos)<input name="post_booking_payment_minutes" type="number" min="5" max="1440" value="${Number(s.post_booking_payment_minutes||15)}"></label><label>Prazo de alteração aprovada (horas)<input name="modification_payment_deadline_hours" type="number" min="1" max="168" value="${Number(s.modification_payment_deadline_hours||24)}"></label><p class="admin-form-message"></p><button class="admin-primary">Salvar regras</button></form></section><section class="admin-panel"><div class="admin-panel-head"><div><small>CANAIS</small><h2>Integrações</h2></div></div><div class="integration-health"><article class="${health.airbnb?"is-success":"is-warning"}"><strong>Airbnb</strong><span>${health.airbnb?"Calendários sincronizados":"Sincronização indisponível"}</span></article><article class="${health.booking?"is-success":"is-warning"}"><strong>Booking.com</strong><span>${health.booking?"Calendários sincronizados":health.booking_configured?"Sincronização indisponível":"Configuração pendente"}</span></article>${state.integrations.map(i=>`<article><strong>${esc(sourceLabel(i.provider))} · ${esc(prop(i.property_id)?.name||"")}</strong><span>${i.active?"Ativa":"Pausada"}</span></article>`).join("")}</div></section></div>`;
  $("#admin-payment-settings").onsubmit=saveSettings;
  $$(".cancellation-policy-form").forEach(f=>f.onsubmit=saveCancellationPolicy);
}
async function saveCancellationPolicy(e){e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando nova versão…";try{const nonref=f.dataset.ratePlan==="non_refundable";await api("admin_cancellation_policy_action",{rate_plan_code:f.dataset.ratePlan,commercial_free_cancellation_hours:Number(f.elements.commercial_free_cancellation_hours.value),withdrawal_days:Number(f.elements.withdrawal_days.value),full_refund_days_before_checkin:nonref?20:Number(f.elements.full_refund_days_before_checkin.value),late_accommodation_refund_percent:nonref?0:Number(f.elements.late_accommodation_refund_percent.value)});await load(true);const updated=$(`.cancellation-policy-form[data-rate-plan="${f.dataset.ratePlan}"] .admin-form-message`);if(updated)updated.textContent="Nova versão salva e vinculada à tarifa de desenvolvimento."}catch(err){m.textContent=err.message==="invalid_policy_configuration"?"Revise os prazos e percentuais.":"Não foi possível salvar a política."}finally{b.disabled=false}}
async function saveSettings(e){e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando…";try{const d=await api("ops_settings_action",{operation:"payment_settings",active_provider:f.elements.active_provider.value,pix_enabled:f.elements.pix_enabled.checked,card_enabled:f.elements.card_enabled.checked,pix_expiration_minutes:Number(f.pix_expiration_minutes.value),post_booking_payment_minutes:Number(f.post_booking_payment_minutes.value),modification_payment_deadline_hours:Number(f.modification_payment_deadline_hours.value)});state.settings=d.settings;m.textContent="Regras atualizadas."}catch{m.textContent="Não foi possível salvar."}finally{b.disabled=false}}

function renderProperties(){
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>PORTFÓLIO</small><h2>Imóveis</h2></div><button id="new-property">+ Novo imóvel</button></div><div class="property-admin-grid">${state.properties.map(p=>`<button class="property-admin-card ${p.active?"":"inactive"}" data-property-edit="${p.id}"><img src="${esc(p.cover_image||'')}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:12px"><small>${esc(p.code)}</small><h3>${esc(p.name)}</h3><p>${esc(p.property_type)} · até ${p.max_guests} hóspedes</p><span>Check-in ${esc((p.check_in_time||"15:00").slice(0,5))} · Checkout ${esc((p.check_out_time||"11:00").slice(0,5))}</span><em>${p.active?"Ativo":"Pausado"}</em></button>`).join("")}</div></section>`;
  $("#new-property").onclick=()=>openProperty(null);$$('[data-property-edit]').forEach(b=>b.onclick=()=>openProperty(Number(b.dataset.propertyEdit)));
}
let calendarLinksRequest=0;
async function renderCalendarLinks(){
 const request=++calendarLinksRequest;
 $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><h2>Links de calendários</h2><button id="back-to-calendar">Ver calendário</button></div><p>Cadastre vários calendários por imóvel. Os períodos dos links ativos aparecem juntos na agenda e são considerados na disponibilidade.</p><form id="choose-calendar-property" class="admin-form"><label>Imóvel<select name="property_id" required>${state.properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><button type="submit">Adicionar ou gerenciar links</button><button type="button" id="configure-availability">Configurar disponibilidade</button></form><div id="calendar-links-list" role="status">Carregando links…</div></section>`;
 $("#back-to-calendar").onclick=()=>showView("calendar");$("#configure-availability").onclick=()=>openAvailability(Number($("#choose-calendar-property").elements.property_id.value));
 $("#choose-calendar-property").onsubmit=e=>{e.preventDefault();openPropertyCalendars(Number(e.currentTarget.elements.property_id.value))};
 try{const data=await api("admin_calendar",{operation:"list"});if(currentView!=="calendar_links"||request!==calendarLinksRequest)return;
  $("#calendar-links-list").innerHTML=data.sources.map(s=>`<article class="admin-operation-card"><div><small>${esc(prop(s.property_id)?.name||"Imóvel")} · ${esc(sourceLabel(s.provider))}</small><h3>${esc(s.label)}</h3><p style="overflow-wrap:anywhere">${esc(s.feed_url||"Link antigo ainda não migrado para este cadastro")}</p><p>${!s.feed_url?"Configuração antiga em uso; informe o link para gerenciar aqui.":!s.enabled?"Desativado":s.last_error?"Erro de sincronização — conferir link":"Ativo"}</p></div><button data-calendar-manage="${s.property_id}">Editar ou excluir</button></article>`).join("")||empty("Nenhum link cadastrado. Escolha um imóvel para adicionar.");
  $$("[data-calendar-manage]").forEach(b=>b.onclick=()=>openPropertyCalendars(Number(b.dataset.calendarManage)));
 }catch{if(currentView==="calendar_links"&&request===calendarLinksRequest)$("#calendar-links-list").textContent="Não foi possível consultar os links. Tente atualizar.";}
}

async function openPropertyCalendars(propertyId){
 $("#admin-modal-content").innerHTML="<h2>Calendários</h2><p>Carregando…</p>";openModal();
 try{
  const data=await api("admin_calendar",{operation:"list"}),out=data.exports.find(x=>Number(x.property_id)===propertyId),sources=data.sources.filter(x=>Number(x.property_id)===propertyId);
  const form=source=>`<form class="admin-form calendar-source-form" data-source-id="${esc(source?.id||"")}"><h3>${source?esc(source.label):"Adicionar calendário"}</h3><label>Nome do calendário<input name="label" maxlength="120" required value="${esc(source?.label||"")}" placeholder="Ex.: Booking — Signature"></label><label>Link iCal externo<input name="feed_url" type="url" required autocomplete="off" value="${esc(source?.feed_url||"")}" placeholder="https://…"></label><label class="admin-checkbox"><input name="enabled" type="checkbox" ${source?.enabled!==false?"checked":""}> Usar na disponibilidade</label>${source?`<p>${source.enabled?"Ativo":"Desativado"}. ${!source.feed_url?"Link pendente. Integração anterior preservada até a configuração ou exclusão.":source.last_checked_at?`Última consulta: ${dateTime(source.last_checked_at)}. ${source.last_error?"Erro na sincronização; disponibilidade protegida.":`${source.event_count??0} bloqueios encontrados.`}`:"Ainda não consultado."}</p>`:""}<p class="admin-form-message" role="status"></p><div class="calendar-source-actions"><button type="submit">${source?"Salvar alterações":"Cadastrar calendário"}</button>${source?'<button type="button" data-test-calendar>Testar agora</button><button type="button" data-delete-calendar>Excluir calendário</button>':""}</div></form>`;
  $("#admin-modal-content").innerHTML=`<div class="calendar-settings"><small>CALENDÁRIOS · ${esc(prop(propertyId)?.name)}</small><h2>Calendários do imóvel</h2><button type="button" id="back-property-availability">Voltar à disponibilidade</button><p>Ambiente de testes. Use o link nos anúncios reais somente após a publicação aprovada do sistema.</p><label>iCal do nosso site — copiar para as plataformas<input id="calendar-export-url" readonly value="${esc(out?.url||"")}"></label><button id="copy-calendar-export">Copiar link do site</button><button id="rotate-calendar-export">Renovar link</button><p id="calendar-export-message" role="status"></p><p>Um único link por imóvel. Exporta reservas próprias e bloqueios, sem dados pessoais. A atualização nas plataformas não é instantânea.</p>${form(null)}<h3>Calendários cadastrados (${sources.length})</h3>${sources.map(form).join("")||"<p>Nenhum calendário cadastrado.</p>"}</div>`;
  $("#back-property-availability").onclick=()=>openAvailability(propertyId);
  $("#copy-calendar-export").onclick=async()=>{try{await navigator.clipboard.writeText(out.url);$("#calendar-export-message").textContent="Link copiado."}catch{$("#calendar-export-url").select();$("#calendar-export-message").textContent="Selecione e copie o link acima."}};
  $("#rotate-calendar-export").onclick=async()=>{if(!confirm("O link anterior deixará de funcionar. Será necessário atualizar as plataformas. Renovar?"))return;try{await api("admin_calendar",{operation:"rotate",property_id:propertyId});await openPropertyCalendars(propertyId)}catch{$("#calendar-export-message").textContent="Não foi possível renovar."}};
  for(const f of $$('.calendar-source-form')){
   const message=f.querySelector('.admin-form-message'),source_id=f.dataset.sourceId||null;
   const busy=v=>f.querySelectorAll('button').forEach(b=>b.disabled=v);
   f.onsubmit=async e=>{e.preventDefault();busy(true);message.textContent="Validando…";try{await api("admin_calendar",{operation:"save",property_id:propertyId,source_id,label:f.elements.label.value,feed_url:f.elements.feed_url.value,enabled:f.elements.enabled.checked});await load(true);await openPropertyCalendars(propertyId);$("#calendar-export-message").textContent="Calendário salvo. Agenda atualizada."}catch(err){message.textContent=err.message==="calendar_duplicate"?"Este link já está cadastrado neste imóvel.":"Não foi possível salvar. Confira o nome e o link HTTPS de um calendário iCal válido. A configuração anterior foi preservada."}finally{busy(false)}};
   const test=f.querySelector('[data-test-calendar]');if(test)test.onclick=async()=>{busy(true);message.textContent="Consultando…";try{const r=await api("admin_calendar",{operation:"test",property_id:propertyId,source_id});message.textContent=r.result.healthy?`Consulta concluída: ${r.result.events} bloqueios.`:"Falha na consulta. Confira o link salvo."}catch{message.textContent="Não foi possível consultar."}finally{busy(false)}};
   const remove=f.querySelector('[data-delete-calendar]');if(remove)remove.onclick=async()=>{if(!confirm("Excluir este calendário? Seus bloqueios deixarão de ser considerados nas próximas consultas. As reservas próprias e os outros calendários serão mantidos."))return;busy(true);try{await api("admin_calendar",{operation:"delete",property_id:propertyId,source_id});await load(true);await openPropertyCalendars(propertyId);$("#calendar-export-message").textContent="Calendário excluído. Agenda atualizada."}catch{message.textContent="Não foi possível excluir."}finally{busy(false)}};
  }
 }catch{$("#admin-modal-content").innerHTML="<h2>Calendários</h2><p>Não foi possível carregar a configuração.</p>"}
}
let propertyCalendarRequest=0;
async function renderPropertyCalendar(propertyId,month){
 const request=++propertyCalendarRequest,host=$('#property-availability-calendar');if(!host)return;
 host.innerHTML='<p role="status">Carregando calendário do imóvel…</p>';
 const b=monthBounds(month);
 try{
 const hub=await api('admin_hub',{start:b.start,end:b.end});if(request!==propertyCalendarRequest||!host.isConnected)return;
 const events=[...(hub.reservations||[]).filter(x=>Number(x.property_id)===propertyId&&['confirmed','hold','pending_payment'].includes(x.status)).map(x=>({...x,start:x.check_in,end:x.check_out,label:x.guest_name||'Reserva do site'})),...(hub.channel_periods||[]).filter(x=>Number(x.property_id)===propertyId).map(x=>({...x,label:x.calendar_label||sourceLabel(x.source)})),...(hub.calendar_blocks||[]).filter(x=>Number(x.property_id)===propertyId&&x.status==='active').map(x=>({...x,start:x.start_date,end:x.end_date,label:x.reason||'Bloqueio operacional'}))];
 const offset=new Date(b.start+'T12:00:00Z').getUTCDay();
 host.innerHTML=`<div class="property-calendar-toolbar"><button type="button" data-property-month="-1" aria-label="Mês anterior">‹</button><label>Mês<input id="property-calendar-month" type="month" value="${month}"></label><button type="button" data-property-month="1" aria-label="Próximo mês">›</button></div><p>Ocupações deste imóvel. Dias sem ocupação ainda dependem das regras de estadia e da consulta de disponibilidade.</p><div class="property-month-grid">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<strong>${d}</strong>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:b.days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,rows=events.filter(x=>x.start<=day&&x.end>day);return `<button type="button" class="property-month-day ${rows.length?'occupied':''}" data-property-day="${day}" aria-label="${date(day)}: ${rows.length?'com ocupação':'sem ocupação registrada'}"><b>${i+1}</b><small>${rows.length?'Ocupado':'—'}</small></button>`}).join('')}</div><div id="property-day-detail" aria-live="polite"></div>`;
 $('#property-calendar-month').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))renderPropertyCalendar(propertyId,e.target.value)};
 $$('[data-property-month]').forEach(button=>button.onclick=()=>{const d=new Date(Date.UTC(b.y,b.m-1+Number(button.dataset.propertyMonth),1));renderPropertyCalendar(propertyId,d.toISOString().slice(0,7))});
 $$('[data-property-day]').forEach(button=>button.onclick=()=>{const day=button.dataset.propertyDay,rows=events.filter(x=>x.start<=day&&x.end>day);$('#property-day-detail').innerHTML=`<h4>${date(day)}</h4>${rows.map(x=>`<p><strong>${esc(x.label)}</strong> · ${esc(sourceLabel(x.source||'direct'))}<br>${date(x.start)} a ${date(x.end)}</p>`).join('')||'<p>Nenhuma ocupação registrada neste dia.</p>'}`});
 }catch{if(host.isConnected&&request===propertyCalendarRequest)host.innerHTML='<p role="alert">Não foi possível carregar as ocupações. Reabra a disponibilidade para tentar novamente.</p>'}
}
async function renderPropertyConnections(propertyId){
 const host=$('#property-calendar-connections');if(!host)return;
 try{const data=await api('admin_calendar',{operation:'list'});if(!host.isConnected)return;
 const sources=data.sources.filter(s=>Number(s.property_id)===propertyId);
 host.innerHTML=`<h3>Conectar calendários</h3><p>Inclua, edite ou exclua links do Airbnb, Booking e de outros calendários para este imóvel.</p>${sources.map(s=>`<div class="property-calendar-source"><strong>${esc(s.label)}</strong><span>${s.enabled?'Ativo':'Desativado'}${s.last_error?' · Conferir sincronização':''}</span></div>`).join('')||'<p>Nenhum calendário conectado.</p>'}<button type="button" id="property-manage-links">Gerenciar calendários conectados</button>`;
 $('#property-manage-links').onclick=()=>openPropertyCalendars(propertyId);
 }catch{if(host.isConnected)host.textContent='Não foi possível consultar os calendários conectados.'}
}

async function openAvailability(propertyId){
 $('#admin-modal-content').innerHTML='<h2>Disponibilidade</h2><p>Carregando…</p>';openModal();
 try{
 const data=await api('admin_availability',{operation:'get',property_id:propertyId}),r=data.rules;
 const choice=(name,label,options)=>{if(!options.some(([v])=>String(v)===String(r[name])))options.push([r[name],String(r[name])+' (configurado)']);return `<label>${label}<select name="${name}">${options.map(([value,title])=>`<option value="${value}" ${String(value)===String(r[name])?'selected':''}>${title}</option>`).join('')}</select></label>`};
 const number=(name,label,min,max)=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" required value="${r[name]}"></label>`;
 const days=(key,title)=>`<fieldset><legend>${title}</legend>${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>`<label class="admin-checkbox"><input name="${key}" type="checkbox" value="${i}" ${r[key].includes(i)?'checked':''}>${label}</label>`).join('')}</fieldset>`;
 const custom=x=>`<div class="custom-stay-row admin-form-grid"><label>Entrada de<input name="custom_start" type="date" required value="${esc(x.start||'')}"></label><label>Entrada até<input name="custom_end" type="date" required value="${esc(x.end||'')}"></label><label>Mínimo de noites<input name="custom_min" type="number" min="1" max="1125" required value="${x.min_nights||1}"></label><label>Máximo de noites<input name="custom_max" type="number" min="1" max="1125" required value="${x.max_nights||1125}"></label><button type="button" data-remove-duration>Excluir período</button></div>`;
 $('#admin-modal-content').innerHTML=`<small>${esc(prop(propertyId)?.name)}</small><h2>Disponibilidade do imóvel</h2><button type="button" id="back-property-details">Voltar aos dados do imóvel</button><section><h3>Calendário do imóvel</h3><div id="property-availability-calendar"></div></section><h3>Configurações de disponibilidade</h3><form id="availability-form" class="admin-form"><div class="admin-form-grid">${number('min_nights','Mínimo de noites',1,1125)}${number('weekend_min_nights','Mínimo quando inclui sexta ou sábado',1,1125)}${number('max_nights','Máximo de noites',1,1125)}${choice('lead_days','Tempo de antecedência',[[0,'Mesmo dia'],[1,'1 dia'],[2,'2 dias'],[3,'3 dias'],[7,'7 dias']])}${choice('same_day_cutoff','Aviso prévio para o mesmo dia',Array.from({length:24},(_,i)=>{const hour=String(i).padStart(2,'0')+':00';return [hour,hour]}))}${choice('preparation_days','Tempo de preparação',[[0,'Nenhum'],[1,'1 noite antes e depois de cada reserva'],[2,'2 noites antes e depois de cada reserva']])}${choice('window_months','Período de disponibilidade',[3,6,9,12,24,36].map(n=>[n,n+' meses de antecedência']))}</div><p>Horários de Brasília. A janela limita a última noite da estadia. Preparação vale para reservas do site e períodos importados; não cria uma hospedagem.</p>${days('checkin_days','Dias permitidos para check-in')}${days('checkout_days','Dias permitidos para checkout')}<h3>Durações por período de entrada</h3><p>Substituem os mínimos e máximos gerais para entradas no período. Os períodos não podem se sobrepor.</p><div id="custom-stays">${r.custom_stays.map(custom).join('')}</div><button type="button" id="add-custom-stay">Adicionar período</button><label class="admin-checkbox"><input name="use_pricelabs_min" type="checkbox" ${r.use_pricelabs_min?'checked':''}> Respeitar também o mínimo do PriceLabs (vale o maior)</label><label class="admin-checkbox"><input name="allow_same_day_requests" type="checkbox" ${r.allow_same_day_requests?'checked':''}> Permitir pedidos de reserva para hoje, sujeitos à aprovação</label><p>Reservas Airbnb e outros bloqueios continuam sendo importados. As regras acima controlam novas reservas do site; iCal não altera regras do Airbnb ou Booking.</p><p role="status" id="availability-message"></p><button type="submit">Salvar disponibilidade</button></form><section id="property-calendar-connections"></section>`;
 organizeAvailability();$('#back-property-details').onclick=()=>openProperty(propertyId);renderPropertyCalendar(propertyId,today().slice(0,7));renderPropertyConnections(propertyId);
 const wire=()=>$$('[data-remove-duration]').forEach(b=>b.onclick=()=>b.closest('.custom-stay-row').remove());wire();
 $('#add-custom-stay').onclick=()=>{if($$('.custom-stay-row').length>=100)return;$('#custom-stays').insertAdjacentHTML('beforeend',custom({}));wire()};
 $('#availability-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('[type=submit]'),message=$('#availability-message');button.disabled=true;message.textContent='Salvando…';
 const rules={};for(const k of ['min_nights','weekend_min_nights','max_nights','lead_days','preparation_days','window_months'])rules[k]=Number(f.elements[k].value);
 rules.same_day_cutoff=f.elements.same_day_cutoff.value;for(const k of ['checkin_days','checkout_days'])rules[k]=[...f.querySelectorAll(`[name="${k}"]:checked`)].map(x=>Number(x.value));for(const k of ['use_pricelabs_min','allow_same_day_requests'])rules[k]=f.elements[k].checked;
 rules.custom_stays=[...f.querySelectorAll('.custom-stay-row')].map(x=>({start:x.querySelector('[name=custom_start]').value,end:x.querySelector('[name=custom_end]').value,min_nights:Number(x.querySelector('[name=custom_min]').value),max_nights:Number(x.querySelector('[name=custom_max]').value)}));
 try{await api('admin_availability',{operation:'save',property_id:propertyId,updated_at:data.updated_at,rules});await load(true);await openAvailability(propertyId);$('#availability-message').textContent='Disponibilidade salva. Agenda atualizada.'}catch(err){message.textContent=err.message==='availability_conflict'?'Este imóvel foi alterado em outra tela. Feche e abra novamente antes de salvar.':'Confira os limites, os dias selecionados e se há períodos sobrepostos.'}finally{button.disabled=false}};
 }catch{$('#admin-modal-content').innerHTML='<h2>Disponibilidade</h2><p>Não foi possível carregar as regras. Feche e tente novamente.</p>'}
}

function openProperty(id){const p=id?state.properties.find(x=>Number(x.id)===Number(id)):null;$("#admin-modal-content").innerHTML=`<small>IMÓVEL</small><h2>${p?"Editar imóvel":"Cadastrar novo imóvel"}</h2>${p?'<section class="property-availability-entry"><h3>Disponibilidade</h3><p>Veja o calendário, configure as regras de estadia e gerencie os calendários conectados deste imóvel.</p><button type="button" id="open-property-availability">Abrir disponibilidade</button></section>':""}<form id="property-form" class="admin-form"><input type="hidden" name="id" value="${p?.id||""}"><div class="admin-form-grid"><label>Nome<input name="name" required value="${esc(p?.name||"")}" placeholder="Ex.: Ville Signature"></label><label>Código interno<input name="code" required value="${esc(p?.code||"")}" placeholder="Ex.: CH1"></label><label>Endereço da página<input name="slug" required value="${esc(p?.slug||"")}" placeholder="ville-signature"></label><label>Tipo<select name="property_type">${[["chalet","Chalé"],["apartment","Apartamento"],["house","Casa"],["cabin","Cabana"],["other","Outro"]].map(([v,l])=>`<option value="${v}" ${p?.property_type===v?"selected":""}>${l}</option>`).join("")}</select></label><label>Máximo de hóspedes<input name="max_guests" type="number" min="1" max="50" value="${p?.max_guests||2}"></label><label>Taxa de limpeza (R$)<input name="cleaning_fee" type="number" min="0" step="0.01" value="${Number(p?.cleaning_fee||0)}"></label><label>Garantia (R$)<input name="guarantee_amount" type="number" min="0" step="0.01" value="${Number(p?.guarantee_amount_cents||0)/100}"></label><label>Até parcelas no cartão<input name="max_installments" type="number" min="1" max="12" required value="${Number(p?.features?.payment_terms?.max_installments??12)}"></label><label>Parcelas sem juros para hóspede<input name="no_interest_installments" type="number" min="0" max="12" required value="${Number(p?.features?.payment_terms?.no_interest_installments??6)}"></label><label>Juros após as parcelas gratuitas<select name="interest_payer"><option value="guest" ${p?.features?.payment_terms?.interest_payer!=="merchant"?"selected":""}>Por conta do hóspede</option><option value="merchant" ${p?.features?.payment_terms?.interest_payer==="merchant"?"selected":""}>Por conta do estabelecimento</option></select></label><label>Horário de check-in<input name="check_in_time" type="time" value="${esc((p?.check_in_time||"15:00").slice(0,5))}"></label><label>Horário de checkout<input name="check_out_time" type="time" value="${esc((p?.check_out_time||"11:00").slice(0,5))}"></label></div><label>Chamada curta<input name="tagline" value="${esc(p?.tagline||"")}" placeholder="Como o imóvel será apresentado"></label><label>Descrição<textarea name="summary" rows="4">${esc(p?.summary||"")}</textarea></label><section class="property-media-editor"><h3>Fotos do imóvel</h3><p>Envie até 40 imagens. Escolha a capa e ajuste a ordem com as setas. JPG, PNG, WebP ou AVIF, até 5 MB por imagem. As versões para celular e computador são geradas automaticamente antes do envio.</p><input id="property-media-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><div id="property-media-list" class="property-media-list"></div><p id="property-media-message" role="status"></p></section><label class="admin-checkbox"><input name="active" type="checkbox" ${p?.active!==false?"checked":""}> Imóvel ativo para novas reservas</label><p class="admin-form-message"></p><button class="admin-primary">Salvar imóvel</button></form>`;openModal();
  propertyGallery=(Array.isArray(p?.gallery)?p.gallery:[]).map(item=>typeof item==="string"?{url:item,alt:""}:item).filter(item=>item?.url);
  propertyCover=p?.cover_image||propertyGallery[0]?.url||"";
  if(propertyCover&&!propertyGallery.some(item=>item.url===propertyCover)) propertyGallery.unshift({url:propertyCover,alt:""});
  renderPropertyMedia();$("#property-media-files").onchange=uploadPropertyMedia;
  $("#property-form").onsubmit=saveProperty;if(p)$("#open-property-availability").onclick=()=>openAvailability(Number(p.id))}
function renderPropertyMedia(){
  const list=$("#property-media-list");list.replaceChildren();
  propertyGallery.forEach((item,i)=>{
    const row=document.createElement("div");row.className="property-media-row";
    const img=document.createElement("img");VilleImages.set(img,item.url,{sizes:"120px"});img.alt=item.alt||"Foto do imóvel";img.loading="lazy";row.append(img);
    const controls=document.createElement("div");
    const alt=document.createElement("input");alt.type="text";alt.maxLength=180;alt.placeholder="Descreva a foto para acessibilidade";alt.value=item.alt||"";alt.setAttribute("aria-label","Descrição da foto "+(i+1));alt.oninput=()=>item.alt=alt.value;controls.append(alt);
    [["Capa",()=>{propertyCover=item.url;renderPropertyMedia()}],["↑",()=>move(i,-1)],["↓",()=>move(i,1)],["Remover",()=>{propertyGallery.splice(i,1);if(propertyCover===item.url)propertyCover=propertyGallery[0]?.url||"";renderPropertyMedia()}]].forEach(([label,action])=>{const button=document.createElement("button");button.type="button";button.textContent=label;button.onclick=action;if(label==="Capa"&&propertyCover===item.url){button.textContent="✓ Capa";button.setAttribute("aria-pressed","true")}controls.append(button)});
    row.append(controls);list.append(row);
  });
}
function move(i,delta){const next=i+delta;if(next<0||next>=propertyGallery.length)return;[propertyGallery[i],propertyGallery[next]]=[propertyGallery[next],propertyGallery[i]];renderPropertyMedia()}
async function uploadPropertyMedia(e){
 const files=[...e.target.files],status=$("#property-media-message"),input=e.target,save=$("#property-form button.admin-primary");
 if(propertyGallery.length+files.length>40){status.textContent="O limite é de 40 fotos por imóvel.";input.value="";return}
 input.disabled=true;save.disabled=true;let failed=0;
 try{for(const file of files){
  const uploaded=[];
  try{
   if(!["image/jpeg","image/png","image/webp","image/avif"].includes(file.type)||file.size>5242880)throw Error("Formato inválido ou acima de 5 MB.");
   status.textContent=`Otimizando ${file.name}…`;
   const variants=await VilleImages.compress(file),prefix=`${session.user.id}/responsive-${crypto.randomUUID()}`;
   let publicUrl="";
   for(const variant of variants){
    const path=`${prefix}-w${variant.width}.webp`;
    const {error}=await sb.storage.from("property-media").upload(path,variant.blob,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
    if(error)throw error;uploaded.push(path);
    publicUrl=sb.storage.from("property-media").getPublicUrl(path).data.publicUrl;
   }
   propertyGallery.push({url:publicUrl,alt:file.name.replace(/\.[^.]+$/,"").replace(/[-_]/g," ")});
   if(!propertyCover)propertyCover=publicUrl;renderPropertyMedia();
  }catch(err){failed++;if(uploaded.length)await sb.storage.from("property-media").remove(uploaded);console.warn("Foto não enviada",err);}
 }
 status.textContent=`${propertyGallery.length} foto(s) prontas. ${failed?failed+" arquivo(s) não puderam ser enviados; confira formato e limite de 5 MB. ":""}Salve o imóvel para publicar a galeria.`;
 }finally{input.disabled=false;save.disabled=false;input.value=""}
}
async function saveProperty(e){e.preventDefault();if($("#property-media-files")?.disabled)return;const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando…";try{await api("admin_property_action",{operation:"save",id:x.id.value||null,name:x.name.value,code:x.code.value,slug:x.slug.value,property_type:x.property_type.value,max_guests:Number(x.max_guests.value),cleaning_fee:Number(x.cleaning_fee.value),guarantee_amount_cents:Math.round(Number(x.guarantee_amount.value||0)*100),max_installments:Number(x.max_installments.value),no_interest_installments:Number(x.no_interest_installments.value),interest_payer:x.interest_payer.value,check_in_time:x.check_in_time.value,check_out_time:x.check_out_time.value,tagline:x.tagline.value,summary:x.summary.value,cover_image:propertyCover,gallery:propertyGallery,active:x.active.checked});closeModal();await load(true)}catch(err){m.textContent="Não foi possível salvar. Verifique se código e endereço já não estão em uso."}finally{b.disabled=false}}

function openManualReservation(){
  const t=today();$("#admin-modal-content").innerHTML=`<small>NOVA RESERVA</small><h2>Adicionar reserva manual</h2><p>Use para reservas feitas fora do site. A disponibilidade será conferida em todos os calendários antes de salvar.</p><form id="manual-reservation-form" class="admin-form"><div class="admin-form-grid"><label>Imóvel<select name="property_id" required>${state.properties.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Hóspedes<input name="guests" type="number" min="1" value="2" required></label><label>Check-in<input name="check_in" type="date" min="${t}" required></label><label>Checkout<input name="check_out" type="date" min="${t}" required></label><label>Nome do hóspede<input name="guest_name" required></label><label>Telefone<input name="guest_phone" inputmode="tel"></label><label>E-mail<input name="guest_email" type="email"></label><label>Total combinado (R$)<input name="total_amount" type="number" min="0" step="0.01" value="0"></label></div><p class="admin-form-message"></p><button class="admin-primary">Salvar reserva</button></form>`;openModal();$("#manual-reservation-form").onsubmit=saveManualReservation;
}
async function saveManualReservation(e){e.preventDefault();const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Conferindo disponibilidade…";try{await api("admin_reservation_action",{operation:"create_manual",property_id:Number(x.property_id.value),guests:Number(x.guests.value),check_in:x.check_in.value,check_out:x.check_out.value,guest_name:x.guest_name.value,guest_phone:x.guest_phone.value,guest_email:x.guest_email.value,total_amount:Number(x.total_amount.value||0)});closeModal();await load(true);renderReservations()}catch(err){m.textContent=err.message==="occupied"?"Essas datas já estão ocupadas em um dos calendários.":err.message==="capacity"?"A quantidade de hóspedes ultrapassa a capacidade do imóvel.":"Não foi possível criar a reserva."}finally{b.disabled=false}}

function openReservation(id){
  const r=state.reservations.find(x=>x.id===id);if(!r)return;const p=prop(r.property_id),payments=byReservation(state.payments,id),orders=byReservation(state.experience_orders,id),charges=byReservation(state.charges,id),mods=byReservation(state.modifications,id),guarantees=byReservation(state.guarantees,id),notes=byReservation(state.notes,id);const items=orders.flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  $("#reservation-detail").innerHTML=`<small>${esc(r.confirmation_code||sourceLabel(r.source))}</small><h2 id="drawer-title">${esc(r.guest_name||"Hóspede")}</h2><div class="drawer-status"><span class="admin-status ${statusClass(r.status)}">${statusLabel(r.status)}</span><span>${esc(sourceLabel(r.source))}</span></div>
  <section class="drawer-block"><h3>Estadia</h3><div class="drawer-dates"><div><small>CHECK-IN</small><strong>${date(r.check_in)}</strong><span>${esc((p?.check_in_time||"15:00").slice(0,5))}</span></div><div><small>CHECKOUT</small><strong>${date(r.check_out)}</strong><span>${esc((p?.check_out_time||"11:00").slice(0,5))}</span></div></div><p><strong>${esc(p?.name||"Imóvel")}</strong> · ${r.guests} hóspede${r.guests===1?"":"s"}</p></section>
  <section class="drawer-block"><h3>Contato</h3><button type="button" id="reservation-guest">Vincular ou editar hóspede</button><p>${esc(r.guest_email||"E-mail não informado")}<br>${esc(r.guest_phone||"Telefone não informado")}</p></section>
  <section class="drawer-block"><h3>Experiências</h3>${items.length?items.map(i=>`<div class="drawer-line"><span>${esc(i.product_name_snapshot)}${i.variant_name_snapshot?" · "+esc(i.variant_name_snapshot):""}</span><strong>${brl(Number(i.unit_price_cents)*Number(i.quantity||1))}</strong>${r.status==="confirmed"&&!r.checked_in_at?`<button type="button" data-experience-credit="${esc(i.id)}">Retirar e calcular crédito</button>`:""}</div>`).join(""):empty("Nenhuma experiência ativa.")}${charges.filter(c=>c.status==="awaiting_payment").map(c=>`<div class="drawer-alert">Pagamento pendente: ${esc(c.description||c.kind)} · ${brl(c.amount_cents)}</div>`).join("")}</section>
  <section class="drawer-block"><h3>Pagamento</h3>${payments.length?payments.map(x=>`<div class="drawer-line"><span>${statusLabel(x.status)} · ${esc(x.method||x.provider)}${x.method==="card"?` · ${Number(x.installments||1)}x · juros ${brl(x.metadata?.buyer_interest_cents||0)}`:""}</span><strong>${brl(x.amount_cents)}</strong></div>`).join(""):empty("Nenhum pagamento registrado.")}<div class="drawer-total"><span>Total da reserva</span><strong>${brl(Math.round(Number(r.total_amount||0)*100))}</strong></div></section>
  ${mods.length?`<section class="drawer-block"><h3>Alterações</h3>${mods.map(m=>`<div class="drawer-line"><span>${statusLabel(m.status)} · ${date(m.requested_check_in)} a ${date(m.requested_check_out)}</span><strong>${brl(m.admin_additional_amount_cents||0)}</strong></div>`).join("")}</section>`:""}
  <section class="drawer-block"><h3>Garantia da reserva</h3>${guarantees.length?guarantees.map(g=>`<div class="drawer-line"><span>${statusLabel(g.financial?.status||g.status)} · ${g.provider==="pagbank_sandbox"&&g.provider_authorization_id?(["guaranteed","incident_reported"].includes(g.status)?"Autorizada no PagBank":g.status==="captured"?"Captura registrada no PagBank":g.status==="released"?"Autorização encerrada":"Em conciliação no PagBank"):"Sem autorização confirmada"}</span><strong>${brl(g.amount_cents)}</strong></div><p>Capturado: <strong>${brl(g.captured_amount_cents||0)}</strong> · Estornado: ${brl(g.refunded_amount_cents||0)}</p><button type="button" data-guarantee="${esc(g.id)}">Ver garantia e ocorrências</button>`).join(""):empty("Nenhuma garantia vinculada a esta reserva.")}</section>
  <section class="drawer-block"><h3>Financeiro da reserva</h3><div id="reservation-finance-summary" role="status">Consultando histórico financeiro…</div></section>
  <section class="drawer-block"><h3>Ocorrências</h3><p>Registrar uma ocorrência não realiza cobrança. A decisão financeira é uma ação separada.</p><div id="reservation-incidents">Consultando ocorrências…</div><button type="button" id="new-reservation-incident">Nova ocorrência</button></section>
  <section class="drawer-block"><h3>Estornos e cancelamentos</h3><div id="reservation-refund-history">Consultando histórico…</div></section>
  <section class="drawer-block"><h3>Histórico interno</h3><div class="drawer-notes">${notes.length?notes.map(n=>`<p>${esc(n.note)}<small>${dateTime(n.created_at)}</small></p>`).join(""):empty("Nenhuma anotação interna.")}</div><form id="reservation-note-form" class="drawer-note-form"><textarea name="note" rows="2" placeholder="Escreva uma observação para a equipe"></textarea><button>Adicionar</button></form></section>
  ${(state.cancel_requests||[]).filter(x=>x.reservation_id===r.id).map(x=>`<section class="drawer-block"><h3>Cancelamento solicitado pelo hóspede</h3><p>${esc(x.reason)} · ${dateTime(x.requested_at)}</p><p>Estado: ${esc(x.status)}</p><button data-review-cancel="${esc(x.id)}">Analisar solicitação</button></section>`).join("")}
  <section class="drawer-actions"><button data-checkin ${r.status!=="confirmed"||r.check_in>today()||r.check_out<today()||r.checked_in_at?"disabled":""}>Registrar check-in</button><button data-checkout ${r.status!=="confirmed"||r.check_in>today()||!r.checked_in_at||r.checked_out_at?"disabled":""}>Registrar checkout</button>${r.status==="confirmed"?'<button class="danger" data-cancel-reservation>Cancelar reserva</button><button data-voluntary-refund>Estorno voluntário</button>':""}</section>`;
  $("#reservation-drawer").hidden=false;document.body.classList.add("drawer-open");
  $("#reservation-guest").onclick=()=>openStayGuest("reservation:"+r.id);
  $("#reservation-note-form").onsubmit=e=>addNote(e,r.id);const ci=$("[data-checkin]"),co=$("[data-checkout]"),ca=$("[data-cancel-reservation]");if(ci)ci.onclick=()=>reservationAction(r.id,"check_in");if(co)co.onclick=()=>reservationAction(r.id,"check_out");if(ca)ca.onclick=()=>cancelReservation(r.id);
  const voluntary=$("[data-voluntary-refund]");if(voluntary)voluntary.onclick=()=>voluntaryRefund(r.id);
  $$("[data-review-cancel]").forEach(b=>b.onclick=()=>cancelReservation(r.id,b.dataset.reviewCancel));
  document.querySelectorAll("#reservation-detail [data-guarantee]").forEach(b=>b.addEventListener("click",()=>openGuarantee(b.dataset.guarantee)));
  document.querySelectorAll("#reservation-detail [data-experience-credit]").forEach(b=>b.onclick=()=>openExperienceCredit(r.id,b.dataset.experienceCredit));
  loadRefundHistory(r.id);
  loadReservationFinance(r.id);
  $("#new-reservation-incident").onclick=()=>openReservationIncident(r.id);
}
function openExperienceCredit(reservationId,itemId){
 const item=byReservation(state.experience_orders,reservationId).flatMap(o=>o.experience_order_items||[]).find(i=>i.id===itemId);
 if(!item)return;
 $("#admin-modal-content").innerHTML=`<small>EXPERIÊNCIA DA RESERVA</small><h2>Retirar ${esc(item.product_name_snapshot)}</h2><form id="experience-credit-form" class="admin-form"><p>O crédito será calculado pelos pagamentos vinculados ao item. A retirada ocorre na aprovação; a devolução só será confirmada após conciliação.</p><label class="admin-checkbox"><input name="not_provided" type="checkbox" required> Confirmei que este serviço ainda não foi prestado.</label><label>Justificativa<textarea name="reason" minlength="5" maxlength="1000" required></textarea></label><p class="admin-form-message" role="status"></p><button class="admin-primary">Calcular crédito</button></form>`;
 openModal();const f=$("#experience-credit-form"),key=crypto.randomUUID();
 f.onsubmit=async e=>{
  e.preventDefault();const b=f.querySelector("button"),m=f.querySelector(".admin-form-message");b.disabled=true;m.textContent="Conferindo item e pagamentos…";
  try{
   const result=await api("experience_credit",{reservation_id:reservationId,item_id:itemId,operation_key:key,service_not_provided:f.elements.not_provided.checked,reason:f.elements.reason.value.trim()});
   const d=await api("reservation_refund_action",{reservation_id:reservationId,operation:"status",kind:"voluntary_refund",case_id:result.cancellation_id});
   renderRefundDecision(reservationId,{...d,kind:"voluntary_refund"});
  }catch(err){m.textContent=({experience_credit_review_required:"Os pagamentos deste item exigem revisão: upgrade, juros, estorno anterior ou vínculo incompleto. Nenhum valor foi devolvido.",previous_refund_pending:"Conclua a operação financeira pendente antes de retirar o item.",experience_credit_already_exists:"Este item já possui uma solicitação. Consulte Estornos e cancelamentos na reserva.",reservation_not_changeable:"A reserva exige análise individual antes da retirada.",service_review_required:"Confirme se o serviço ainda não foi prestado."})[err.message]||"Não foi possível calcular. Consulte o histórico antes de repetir.";b.disabled=false;}
 };
}
async function loadRefundHistory(id){
  const box=$("#reservation-refund-history");
  try{const {cases:rows}=await api("reservation_refund_action",{operation:"list",reservation_id:id});
    if(!box||!box.isConnected)return;
    box.innerHTML=rows?.length?rows.map(c=>`<div class="drawer-line"><span>${c.kind==="voluntary_refund"?"Estorno voluntário":"Cancelamento"} · ${esc(c.status)}<br>${esc(c.reason)}</span><strong>${brl(c.refund_due_cents)}</strong>${c.status!=="confirmed"?`<button data-refund-case="${esc(c.id)}" data-refund-kind="${esc(c.kind)}">Ver conciliação</button>`:""}</div>`).join(""):"Nenhum estorno solicitado.";
    box.querySelectorAll("[data-refund-case]").forEach(b=>b.onclick=async()=>{
      try{const d=await api("reservation_refund_action",{operation:"status",reservation_id:id,kind:b.dataset.refundKind,case_id:b.dataset.refundCase});
        renderRefundDecision(id,{...d,kind:b.dataset.refundKind});openModal()}
      catch{box.textContent="Não foi possível consultar a conciliação."}
    });
  }catch{if(box?.isConnected)box.textContent="Histórico indisponível. Atualize a página."}
}
async function addNote(e,id){e.preventDefault();const f=e.currentTarget,n=f.note.value.trim();if(!n)return;await api("admin_reservation_action",{operation:"add_note",reservation_id:id,note:n});await load(true);openReservation(id)}
async function reservationAction(id,operation){
 try{await api("admin_reservation_action",{operation,reservation_id:id});await load(true);openReservation(id)}
 catch(e){
  if(e.message!=="guarantee_check_in_exception_required"){alert("Não foi possível concluir a operação. Atualize a reserva e confira o estado atual.");return;}
  $("#admin-modal-content").innerHTML='<small>CHECK-IN · CAUÇÃO PENDENTE</small><h2>Registrar decisão do responsável</h2><p>A caução ainda não oferece a cobertura necessária. A reserva paga continua válida. Regularize a garantia ou registre por que decidiu liberar a entrada.</p><form id="guarantee-checkin-exception" class="admin-form"><label>Justificativa<textarea name="reason" minlength="10" maxlength="1000" required></textarea></label><p class="admin-form-message" role="status"></p><button type="submit">Liberar entrada e registrar exceção</button></form>';
  openModal();const form=$("#guarantee-checkin-exception");form.onsubmit=async event=>{event.preventDefault();const b=form.querySelector('button');b.disabled=true;
   try{await api("admin_reservation_action",{operation,reservation_id:id,guarantee_exception_reason:form.elements.reason.value.trim()});closeModal();await load(true);openReservation(id)}
   catch{form.querySelector('.admin-form-message').textContent="Não foi possível registrar. Consulte novamente a reserva.";b.disabled=false;}
  };
 }
}
function cancelReservation(id,requestId=null){
  const request=(state.cancel_requests||[]).find(x=>x.id===requestId);
  $("#admin-modal-content").innerHTML=`<small>CANCELAMENTO · PAGBANK SANDBOX</small><h2>${request?"Analisar pedido do hóspede":"Calcular devolução"}</h2><form id="refund-prepare" class="admin-form"><p>A reserva permanece ativa até a confirmação do PagBank e da conciliação.</p><label>${request?"Motivo informado pelo hóspede":"Justificativa"}<textarea name="reason" rows="3" required ${request?"readonly":""}>${esc(request?.reason||"")}</textarea></label><p class="admin-form-message" role="status"></p><button class="admin-primary">Ver cálculo e cobranças</button>${request?.status==="requested"?'<button type="button" id="reject-guest-cancel">Recusar solicitação</button>':""}</form>`;
  openModal();$("#refund-prepare").onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");
    b.disabled=true;m.textContent="Conferindo pagamentos e política aceita…";
    try{const d=await api("reservation_refund_action",{reservation_id:id,operation:"prepare",reason:f.reason.value,guest_request_id:requestId});renderRefundDecision(id,d)}
    catch(err){m.textContent=refundError(err)}finally{b.disabled=false}
  };
  const reject=$("#reject-guest-cancel");if(reject)reject.onclick=async()=>{
    const note=window.prompt("Motivo da recusa para o hóspede:");if(!note?.trim())return;
    reject.disabled=true;
    try{await api("reservation_cancel_request",{operation:"reject",reservation_id:id,request_id:requestId,decision_note:note});closeModal();await load(true);openReservation(id)}
    catch{$("#refund-prepare .admin-form-message").textContent="Não foi possível recusar; confira o estado da solicitação.";reject.disabled=false}
  };
}
function voluntaryRefund(id){
  const operationKey=crypto.randomUUID();
  $("#admin-modal-content").innerHTML=`<small>ESTORNO VOLUNTÁRIO · PAGBANK SANDBOX</small><h2>Devolver valor sem cancelar a reserva</h2><form id="voluntary-refund" class="admin-form"><label>Valor a devolver (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Justificativa<textarea name="reason" rows="3" required></textarea></label><p class="admin-form-message" role="status"></p><button class="admin-primary">Ver cálculo e cobranças</button></form>`;
  openModal();$("#voluntary-refund").onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Conferindo saldo da cobrança…";
    try{const d=await api("reservation_refund_action",{reservation_id:id,kind:"voluntary_refund",operation:"prepare",operation_key:operationKey,amount_cents:Math.round(Number(f.amount.value)*100),reason:f.reason.value});renderRefundDecision(id,{...d,kind:"voluntary_refund"})}
    catch(err){m.textContent=refundError(err)}finally{b.disabled=false}
  };
}
const refundError=e=>({previous_refund_pending:"Já há um estorno pendente nessa cobrança. Abra o histórico e continue a solicitação existente.",refund_retry_not_ready:"Aguarde um minuto e consulte a cobrança antes de reenviar.",refund_provider_balance_mismatch:"O PagBank ainda não informou um saldo verificável. O reenvio permanece bloqueado.",accepted_policy_missing:"A versão aceita da política não foi encontrada.",ledger_review_required:"Os valores pagos não coincidem com o financeiro; revisão necessária.",partial_refund_provider_receipt_required:"Estorno parcial exige comprovante de valor do PagBank; solicitação bloqueada para revisão.",captured_charges_required:"Não há cobrança PagBank paga e identificada para esta reserva.",individual_review_required:"A política exige análise individual.",refund_allocation_requires_review:"A distribuição entre cobranças exige revisão."})[e.message]||"Não foi possível confirmar esta operação. A reserva permanece ativa; consulte a conciliação.";
function renderRefundDecision(id,d){
  const alloc=d.calculation?.allocations||[];
  const voluntary=d.kind==="voluntary_refund",experienceCredit=d.calculation?.reason==="unprovided_experience";
  const caseState={prepared:"Pronto para aprovação",pending_provider:"Aguardando PagBank",confirmed:"Confirmado"}[d.status]||"Em análise";
  const mayApprove=d.status==="prepared"||(d.status==="pending_provider"&&d.refunds?.some(x=>x.state==="prepared"));
  $("#admin-modal-content").innerHTML=`<small>${experienceCredit?"CRÉDITO DE EXPERIÊNCIA":voluntary?"ESTORNO VOLUNTÁRIO":"CANCELAMENTO"} · ${caseState}</small><h2>${brl(d.refund_due_cents)} a devolver</h2><p>Confirmado no financeiro: ${brl(d.confirmed_cents)}. Restante: ${brl(Math.max(0,d.refund_due_cents-d.confirmed_cents))}.</p>${d.provider_issue==="pagbank_refund_temporarily_unavailable"?'<p role="alert">O PagBank recusou o estorno com o código 40008 (serviço temporariamente indisponível). Nenhum valor foi confirmado como devolvido. Consulte a cobrança e, após um minuto, reenvie a mesma solicitação. O sistema confere o saldo e preserva a chave da operação para evitar duplicidade.</p>':""}${d.provider_issue==="pagbank_refund_key_in_use"?'<p role="alert">O PagBank mantém a chave da operação em uso (40005). A solicitação permanece pendente. Não crie outra devolução; consulte a conciliação ou o suporte do provedor.</p>':""}<p>Política aceita: versão ${esc(d.accepted_version||"—")}. ${voluntary?"A reserva continuará ativa após o estorno.":"A reserva só será cancelada após conciliação."}</p><div class="admin-stack">${alloc.map(x=>`<p>Cobrança ${esc(String(x.charge_id||"").slice(-8))}: paga ${brl(x.captured_cents)} · devolução ${brl(x.refund_cents)} · ${esc(x.calculation?.reason==="unprovided_experience"?"experiência não prestada":x.calculation?.reason==="commercial_free_window"?"cancelamento na janela comercial gratuita":x.calculation?.reason==="withdrawal_window"?"prazo adicional da política aceita":x.calculation?.reason==="voluntary_refund"?"estorno voluntário":x.calculation?.reason||"calculado pela política")}</p>`).join("")}</div><p class="admin-form-message" role="status"></p><div class="drawer-actions">${mayApprove?'<button class="admin-danger" id="refund-approve">Aprovar e solicitar estorno</button>':d.status!=="confirmed"?'<button id="refund-reconcile">Consultar PagBank</button>':""}</div>`;
  if(!mayApprove&&d.provider_issue==="pagbank_refund_temporarily_unavailable"){
    const retry=document.createElement("button");retry.textContent="Reenviar estorno pendente";
    $("#admin-modal-content .drawer-actions").appendChild(retry);
    retry.onclick=async()=>{retry.disabled=true;const m=$("#admin-modal-content .admin-form-message");
      m.textContent="Conferindo o saldo e reenviando a mesma solicitação…";
      try{const next=await api("reservation_refund_action",{reservation_id:id,kind:d.kind,case_id:d.cancellation_id,operation:"retry"});
        renderRefundDecision(id,{...d,...next});
      }catch(e){m.textContent=refundError(e);retry.disabled=false;}};
  }
  const button=$(mayApprove?"#refund-approve":"#refund-reconcile");
  if(mayApprove&&button){
    button.disabled=true;
    const message=$("#admin-modal-content .admin-form-message");
    message.textContent="Conferindo o saldo de cada cobrança no PagBank…";
    api("reservation_refund_action",{reservation_id:id,kind:voluntary?"voluntary_refund":"policy_cancellation",
      case_id:d.cancellation_id,operation:"preflight"}).then(result=>{
      if(!button.isConnected)return;
      if(result.ready){button.disabled=false;message.textContent=result.checks?.some(c=>c.mode==="provider_limit")?
        "Cobrança paga conferida. O sandbox omitiu o saldo devolvido; o PagBank validará o limite no envio. O estorno continuará pendente até confirmação do valor pelo provedor.":
        "Saldo e cobrança conferidos. A aprovação enviará o estorno ao PagBank sandbox."}
      else message.textContent="Envio bloqueado: " + ((result.checks||[]).map(c=>
        `cobrança ${String(c.payment_id||"").slice(-8)}: ${c.status||"indisponível"} via ${c.source||"consulta"}; saldo devolvido ${c.provider_refunded_cents==null?"indisponível":brl(c.provider_refunded_cents)}`
      ).join("; ")||"não foi possível confirmar o saldo das cobranças")+". A reserva permanece ativa.";
    }).catch(()=>{if(button.isConnected)message.textContent="Consulta ao PagBank indisponível. Envio bloqueado; tente novamente após a consulta voltar."});
  }
  if(button)button.onclick=async()=>{
    button.disabled=true;const m=$("#admin-modal-content .admin-form-message");m.textContent="Consultando PagBank e conciliando…";
    try{const next=await api("reservation_refund_action",{reservation_id:id,kind:voluntary?"voluntary_refund":"policy_cancellation",case_id:d.cancellation_id,operation:mayApprove?"approve":"reconcile"});
      if(next.status==="confirmed"){closeModal();await load(true)}else{
        const observed=(next.provider_checks||[]).map(c=>c.status==="precheck_failed"?"consulta inicial falhou; nenhuma solicitação de estorno enviada":c.status==="unavailable"?"consulta ao provedor indisponível":`cobrança ${esc(c.status)} consultada pelo ${c.source==="order"?"pedido":"identificador da cobrança"}; devolução informada pelo PagBank: ${c.provider_refunded_cents==null?"indisponível":brl(c.provider_refunded_cents)}`).join("; ");
        m.textContent=`Estorno pendente: ${brl(next.confirmed_cents)} confirmado de ${brl(next.refund_due_cents)}. ${observed}. A reserva continua ativa.`;
        if(mayApprove)renderRefundDecision(id,{...d,...next,kind:d.kind});else button.disabled=false}}
    catch(err){m.textContent=refundError(err);if(err.message==="cancellation_already_submitted"){
      try{renderRefundDecision(id,{...d,...await api("reservation_refund_action",{reservation_id:id,kind:voluntary?"voluntary_refund":"policy_cancellation",case_id:d.cancellation_id,operation:"status"})})}catch{button.disabled=false}
    }else button.disabled=false}
  };
}
function closeDrawer(){$("#reservation-drawer").hidden=true;document.body.classList.remove("drawer-open")}
function openModal(){$("#admin-modal").hidden=false;document.body.classList.add("drawer-open")}
function closeModal(){$("#admin-modal").hidden=true;if($("#reservation-drawer").hidden)document.body.classList.remove("drawer-open")}

async function loadReservationFinance(id){
 const box=document.querySelector("#reservation-finance-summary");if(!box)return;
 try{
  const {finance:f}=await api("reservation_finance",{reservation_id:id});if(!box.isConnected)return;
  const incidents=document.querySelector("#reservation-incidents");
  if(incidents){
   incidents.innerHTML=(f.incidents||[]).length?f.incidents.map(i=>`<article class="drawer-block"><strong>${esc(i.description)}</strong><p>${brl(i.requested_capture_cents)} · ${esc(({pending:"Aguardando decisão",no_charge:"Encerrada sem cobrança",approved:"Cobrança aprovada"})[i.decision]||i.decision)}</p><small>${dateTime(i.created_at)}</small>${i.decision==="pending"?`<button type="button" data-incident-no-charge="${esc(i.id)}">Encerrar sem cobrança</button>`:""}${i.guarantee_id?`<button type="button" data-incident-guarantee="${esc(i.guarantee_id)}">Evidências e decisão de cobrança</button>`:""}</article>`).join(""):"<p>Nenhuma ocorrência registrada.</p>";
   incidents.querySelectorAll('[data-incident-guarantee]').forEach(b=>b.onclick=()=>openGuarantee(b.dataset.incidentGuarantee));
   incidents.querySelectorAll('[data-incident-no-charge]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api("reservation_incident",{operation:"no_charge",reservation_id:id,incident_id:b.dataset.incidentNoCharge});await loadReservationFinance(id)}catch{b.textContent="Não foi possível encerrar. Tentar novamente";b.disabled=false}});
  }
  const labels={contract_cents:"Valor contratado atualizado",approved_credit_cents:"Créditos aprovados",balance_due_cents:"Saldo a receber",credit_balance_cents:"Saldo a devolver",paid_cents:"Pagamentos recebidos",refunded_cents:"Estornos confirmados",net_received_cents:"Recebido líquido da hospedagem",pending_additional_cents:"Cobranças adicionais pendentes",pending_refund_cents:"Estornos aguardando confirmação",damage_captured_cents:"Danos capturados",damage_refunded_cents:"Danos estornados",total_net_received_cents:"Total recebido líquido"};
  box.innerHTML=`${f.original_quote?`<p>Hospedagem original: ${brl(f.original_quote.accommodation_amount_cents)} · Limpeza: ${brl(f.original_quote.cleaning_fee_cents)} · Total original: ${brl(f.original_quote.total_amount_cents)}</p>`:"<p>Detalhamento original indisponível para este registro legado.</p>"}<dl class="reservation-finance-values">${Object.entries(labels).map(([k,l])=>`<dt>${l}</dt><dd>${f[k]==null?"Não disponível":brl(f[k])}</dd>`).join("")}</dl><details><summary>Histórico financeiro (${f.events_count})</summary>${f.history_migrated?"<p>Inclui saldo inicial importado. Eventos anteriores à migração podem não estar disponíveis.</p>":""}<ol>${f.events.map(e=>`<li>${dateTime(e.recorded_at)} · ${esc(e.source)} · ${esc(e.payload.description||e.payload.reason||e.payload.status||e.payload.state||e.event_type)} ${e.payload.amount_cents!=null?brl(e.payload.amount_cents):""}</li>`).join("")}</ol></details>`;
 }catch{if(box.isConnected){box.textContent="Histórico financeiro indisponível. Os valores não foram tratados como zero. Tente consultar novamente.";const incidents=document.querySelector("#reservation-incidents");if(incidents)incidents.textContent="Ocorrências indisponíveis. Atualize a reserva para tentar novamente.";}}
}

function openReservationIncident(reservationId){
 const g=state.guarantees.find(x=>x.reservation_id===reservationId);
 if(g){openGuarantee(g.id);return;}
 $("#admin-modal-content").innerHTML=`<small>OCORRÊNCIA DA RESERVA</small><h2>Nova ocorrência</h2><p>Este registro não cobra o hóspede. Valor e evidências devem ser analisados antes de qualquer decisão financeira.</p><form id="reservation-incident-form" class="admin-form"><label>Categoria<select name="category"><option value="damage">Dano</option><option value="broken_item">Item quebrado</option><option value="missing_item">Item desaparecido</option><option value="extra_cleaning">Limpeza extraordinária</option><option value="penalty">Multa</option><option value="other">Outra ocorrência</option></select></label><label>Descrição<textarea name="description" required minlength="5" maxlength="1000"></textarea></label><label>Valor proposto (R$)<input name="amount" type="number" min="0" step="0.01" value="0" required></label><p class="admin-form-message" role="status"></p><button type="submit" class="admin-primary">Registrar ocorrência</button></form>`;
 openModal();const f=$("#reservation-incident-form"),key=crypto.randomUUID();
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button'),m=f.querySelector('.admin-form-message');b.disabled=true;m.textContent="Registrando…";
  try{await api("reservation_incident",{operation:"record",reservation_id:reservationId,category:f.elements.category.value,description:f.elements.description.value,amount_cents:Math.round(Number(f.elements.amount.value)*100),operation_key:key});closeModal();await loadReservationFinance(reservationId)}
  catch{m.textContent="Não foi possível registrar. Tente novamente.";b.disabled=false;}
 };
}

// Task-oriented workspace. Existing financial flows remain in their original handlers.
const legacyProperty=openProperty,legacyToday=renderToday,legacyCalendar=renderCalendar,legacyView=showView;
let todayTab='today';
async function listingApi(body){const r=await fetch(C.supabaseUrl+'/functions/v1/pms-operations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'failed');return d}
const workspaceCard=(key,title,summary)=>`<button type="button" data-workspace="${key}"><strong>${esc(title)}</strong><span>${esc(summary)}</span><span aria-hidden="true">Editar →</span></button>`;

function organizeAvailability(){
 const host=$('#admin-modal-content'),form=$('#availability-form'),calendar=$('#property-availability-calendar').parentElement,connections=$('#property-calendar-connections');
 const heading=form.previousElementSibling;heading.hidden=true;
 const tabs=document.createElement('div');tabs.className='workspace-tabs';tabs.innerHTML='<button type="button" data-availability-tab="calendar">Calendário</button><button type="button" data-availability-tab="rules">Regras de estadia</button><button type="button" data-availability-tab="links">Calendários conectados</button>';host.insertBefore(tabs,calendar);
 const activate=key=>{calendar.hidden=key!=='calendar';form.hidden=key!=='rules';connections.hidden=key!=='links';tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.availabilityTab===key))};tabs.onclick=e=>{const b=e.target.closest('button');if(b)activate(b.dataset.availabilityTab)};activate('calendar');
 const grid=form.querySelector('.admin-form-grid');
 for(const label of [...grid.children]){const input=label.querySelector('input,select');const value=input.tagName==='SELECT'?input.selectedOptions[0].textContent:input.value;const title=label.firstChild.textContent;const detail=document.createElement('details');detail.className='workspace-rule';const summary=document.createElement('summary');summary.textContent=title+' · '+value;grid.insertBefore(detail,label);detail.append(summary,label);input.addEventListener('change',()=>{summary.textContent=title+' · '+(input.tagName==='SELECT'?input.selectedOptions[0].textContent:input.value)})}
 form.addEventListener('invalid',e=>{const d=e.target.closest('details');if(d)d.open=true},true);
}

function setupWorkspace(){
 const paths={today:'M5 3h14v18l-7-4-7 4z',calendar:'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18',properties:'M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',notifications:'M6 17h12l-2-3V9a4 4 0 0 0-8 0v5z M10 20h4',menu:'M4 6h16 M4 12h16 M4 18h16'};
 const nav=document.createElement('nav');nav.className='admin-bottom-nav';nav.setAttribute('aria-label','Navegação principal');nav.innerHTML=Object.entries({today:'Hoje',calendar:'Calendário',properties:'Imóveis',notifications:'Avisos',menu:'Menu'}).map(([v,l])=>`<button data-main-view="${v}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[v]}"/></svg><span>${l}</span></button>`).join('');$('#admin-app').append(nav);nav.onclick=e=>{const b=e.target.closest('[data-main-view]');if(b&&state)showView(b.dataset.mainView)};
}
showView=function(view){
 if(view==='menu'){currentView='menu';history.replaceState(null,'','admin.html?view=menu');$('#admin-context').textContent='SUA OPERAÇÃO';$('#admin-title').textContent='Menu';renderWorkspaceMenu()}else legacyView(view);
 $$('[data-main-view]').forEach(b=>{const active=b.dataset.mainView===view;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
};
function renderWorkspaceMenu(){
 $('#admin-content').innerHTML=`<p class="workspace-summary">Escolha o assunto que deseja gerenciar.</p><div class="workspace-cards">${[['reservations','Reservas','Estadias, pagamentos, garantia e ocorrências'],['guests','Hóspedes','Contatos e histórico de estadias'],['finance','Financeiro','Recebimentos e cobranças'],['changes','Alterações','Pedidos de mudança nas reservas'],['access','Acessos ao site','Visitas e conversão'],['settings','Configurações','Regras e integrações']].map(([k,t,s])=>workspaceCard(k,t,s)).join('')}<a href="pms-operacao.html?view=team"><strong>Equipe e acessos</strong><span>Convide pessoas e escolha os imóveis e módulos permitidos.</span></a><a href="pms-operacao.html"><strong>Limpeza e manutenção</strong><span>Tarefas, vistorias e prontidão dos imóveis.</span></a><a href="experiencias-admin.html"><strong>Experiências</strong><span>Produtos e pacotes disponíveis aos hóspedes.</span></a></div>`;$$('[data-workspace]').forEach(b=>b.onclick=()=>showView(b.dataset.workspace));
}
renderToday=function(){
 if(todayTab==='today')legacyToday();else{const rows=state.reservations.filter(r=>r.status==='confirmed'&&r.check_in>today()).sort((a,b)=>a.check_in.localeCompare(b.check_in));$('#admin-content').innerHTML=`<section class="admin-panel"><h2>Próximas chegadas</h2><div class="admin-stack">${rows.map(r=>reservationCard(r,date(r.check_in))).join('')||empty('Nenhuma chegada futura registrada.')}</div></section>`;bindCards()}
 $('#admin-content').insertAdjacentHTML('afterbegin',`<div class="workspace-tabs"><button data-today-tab="today" class="${todayTab==='today'?'active':''}">Hoje</button><button data-today-tab="next" class="${todayTab==='next'?'active':''}">Próximas</button></div>`);$$('[data-today-tab]').forEach(b=>b.onclick=()=>{todayTab=b.dataset.todayTab;renderToday()});
};
renderCalendar=function(){
 $('#admin-content').innerHTML=`<p class="workspace-summary">Selecione o imóvel para consultar as datas e a disponibilidade.</p><div class="workspace-cards">${state.properties.map(p=>`<button data-calendar-property="${p.id}">${p.cover_image?`<img src="${esc(p.cover_image)}" alt="">`:''}<strong>${esc(p.name)}</strong><span>${esc(p.code)} · ${p.active?'Ativo':'Pausado'}</span><span>Abrir calendário →</span></button>`).join('')}</div><button id="all-calendars" class="workspace-back">Ver agenda de todos os imóveis</button>`;
 $$('[data-calendar-property]').forEach(b=>b.onclick=()=>openAvailability(Number(b.dataset.calendarProperty)));$('#all-calendars').onclick=legacyCalendar;
};
openProperty=function(id){
 if(!id){legacyProperty(id);return}const p=prop(id);if(!p)return;
 $('#admin-modal-content').innerHTML=`<button class="workspace-back" id="workspace-close">← Imóveis</button><div class="workspace-editor-head">${p.cover_image?`<img src="${esc(p.cover_image)}" alt="">`:''}<div><small>${esc(p.code)} · ${p.active?'ATIVO':'PAUSADO'}</small><h2>${esc(p.name)}</h2></div></div><p class="workspace-summary">Escolha um assunto para consultar ou editar.</p><div class="workspace-cards">${workspaceCard('space','Seu espaço',p.tagline||'Título, descrição e comodidades')}${workspaceCard('photos','Fotos',(p.gallery||[]).length+' imagens · capa e ordem')}${workspaceCard('availability','Disponibilidade','Calendário, regras de estadia e calendários conectados')}${workspaceCard('conditions','Preços e condições','Limpeza, garantia e parcelamento')}${workspaceCard('details','Dados do imóvel','Tipo, capacidade, horários e situação do anúncio')}</div>`;openModal();$('#workspace-close').onclick=closeModal;
 $$('[data-workspace]').forEach(b=>b.onclick=async()=>{const key=b.dataset.workspace;if(key==='availability')return openAvailability(id);if(key==='space'){try{const d=await listingApi({action:'listings',operation:'list'});return ListingEditor.open({property:d.properties.find(x=>Number(x.id)===id),host:$('#admin-modal-content'),api:listingApi,onBack:()=>openProperty(id),onSaved:async()=>{await load(true);openProperty(id)}})}catch{$('#admin-modal-content').innerHTML='<p>Não foi possível carregar o imóvel. Feche e tente novamente.</p>';return}}
 legacyProperty(id);const form=$('#property-form');const groups={photos:[],conditions:['cleaning_fee','guarantee_amount','max_installments','no_interest_installments','interest_payer'],details:['name','code','slug','property_type','max_guests','check_in_time','check_out_time','active']};form.querySelectorAll('label').forEach(l=>{const input=l.querySelector('input,select,textarea');if(input)l.hidden=!groups[key].includes(input.name)});form.querySelector('.property-media-editor').hidden=key!=='photos';$('#admin-modal-content h2').textContent={photos:'Fotos do imóvel',conditions:'Preços e condições',details:'Dados do imóvel'}[key];$('#admin-modal-content').insertAdjacentHTML('afterbegin','<button type="button" class="workspace-back" id="back-workspace">← '+esc(p.name)+'</button>');$('#back-workspace').onclick=()=>openProperty(id);
 });
};
setupWorkspace();

boot();
})();
