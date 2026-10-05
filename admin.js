(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),ENGINE=C.bookingEngine;
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
const statusLabel=s=>({imported:"Período importado",confirmed:"Confirmada",pending_payment:"Aguardando pagamento",hold:"Pagamento iniciado",cancelled:"Cancelada",not_confirmed:"Não confirmada",no_show:"Não compareceu",pending:"Pendente",paid:"Pago",refused:"Recusado",under_review:"Em análise",processing:"Processando",awaiting_payment:"Aguardando pagamento",expired:"Expirado",requested:"Solicitada",quoted:"Aguardando análise",rejected:"Recusada",payment_expired:"Pagamento não realizado",accepted:"Aceita",applied:"Aplicada",active:"Ativa",authorized:"Autorizada",guaranteed:"Autorizada",partially_captured:"Capturada parcialmente",partially_refunded:"Estornado parcialmente",refunded:"Estornado",failed:"Falhou",pending_authorization:"Aguardando autorização",released:"Liberada",captured:"Capturada",incident_reported:"Ocorrência registrada",capture_requested:"Captura solicitada",upgraded:"Substituído"}[s]||String(s||"—").replaceAll("_"," "));
const sourceLabel=s=>({direct:"Site",manual:"Manual",airbnb:"Airbnb",booking:"Booking.com",ical:"Calendário externo",operational:"Bloqueio operacional"}[s]||s);
const statusClass=s=>["confirmed","paid","applied","checked_in","checked_out"].includes(s)?"is-success":["cancelled","not_confirmed","refused","expired","no_show"].includes(s)?"is-muted":["under_review","pending_payment","hold","awaiting_payment"].includes(s)?"is-warning":"";

async function api(action,body={}){
 const fresh=await sb.auth.getSession();session=fresh.data.session;if(!session)throw new Error("session_expired");

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
  const names={calendar_links:["INTEGRAÇÕES POR IMÓVEL","Links de calendários"],guests:["CADASTRO E HISTÓRICO","Hóspedes"],access:["AUDIÊNCIA DO SITE","Acessos"],today:["OPERAÇÃO DE HOJE","Visão geral"],calendar:["AGENDA UNIFICADA","Multicalendário"],reservations:["TODAS AS ESTADIAS","Reservas"],notifications:["CENTRAL DE ATENÇÃO","Notificações"],changes:["PEDIDOS DOS HÓSPEDES","Alterações de reserva"],finance:["MOVIMENTAÇÃO","Financeiro"],properties:["PORTFÓLIO","Imóveis"],settings:["REGRAS DA OPERAÇÃO","Configurações"]};
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
  if(String(r.id).includes(':'))return calendarAgendaItem(r);
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
  const unread=state.notifications.filter(n=>!n.read_at&&n.entity_type!=="same_day_request");
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
  $$('[data-guest-stay]').forEach(b=>b.onclick=()=>openCalendarEvent(b.dataset.guestStay));
  $$('[data-reservation]').forEach(b=>b.onclick=e=>{const id=b.dataset.reservation;const notification=state.notifications.find(n=>n.id===b.dataset.notification);if(notification?.entity_type==="same_day_request")openSameDayReview(notification.entity_id);else if(id)openReservation(id);const nid=b.dataset.notification;if(nid)markNotification(nid)});
}

function openCalendarEvent(id){
 const e=state.channel_periods.find(x=>x.id===id);if(!e)return;
 $('#admin-modal-content').innerHTML=`<small>${esc(sourceLabel(e.source))} · CALENDÁRIO EXTERNO</small><h2>${esc(e.guest_name||e.calendar_label||'Período importado')}</h2><p>${esc(prop(e.property_id)?.name)} · ${date(e.start)} a ${date(e.end)}</p><p>${e.status==='integration_error'?'Falha de sincronização. Confira o canal de origem.':'Estas datas estão indisponíveis pelo calendário conectado. O iCal recebido não distingue com segurança uma reserva de um bloqueio.'}</p>${e.guest_name?`<p>Contato vinculado: ${esc(e.guest_name)} · ${esc(e.guest_phone||'Sem telefone')}</p>`:''}<button type="button" id="event-contact">Vincular ou editar contato</button>`;
 openModal();$('#event-contact').onclick=()=>openStayGuest(id);
}
function importedRows(){return (state.channel_periods||[]).filter(x=>x.status!=='integration_error').map(x=>({...x,check_in:x.start,check_out:x.end,status:'imported'}))}
function monthBounds(value){const [y,m]=value.split("-").map(Number),start=`${y}-${String(m).padStart(2,"0")}-01`,endDate=new Date(Date.UTC(y,m,1)),end=endDate.toISOString().slice(0,10);return {y,m,start,end,days:new Date(Date.UTC(y,m,0)).getUTCDate()}}
function renderCalendar(){
  const b=calendarSpan==='week'?{start:calendarWeekStart,end:new Date(Date.parse(calendarWeekStart)+7*86400000).toISOString().slice(0,10),days:7}:monthBounds(calendarMonth),direct=state.reservations.filter(r=>["confirmed","pending_payment","hold"].includes(r.status)&&r.check_in<b.end&&r.check_out>b.start),manual=(state.calendar_blocks||[]).filter(x=>x.status==="active"&&x.start_date<b.end&&x.end_date>b.start).map(x=>({...x,id:`block:${x.id}`,source:"operational",start:x.start_date,end:x.end_date,guest_name:x.reason,status:"blocked"})),external=[...state.channel_periods.filter(x=>x.start<b.end&&x.end>b.start),...manual];
  const dayHeads=Array.from({length:b.days},(_,i)=>{const d=new Date(Date.parse(b.start)+i*86400000);return `<span class="${d.toISOString().slice(0,10)===today()?"today":""}"><b>${d.getUTCDate()}</b><small>${d.toLocaleDateString("pt-BR",{weekday:"narrow",timeZone:"UTC"})}</small></span>`}).join("");
  $("#admin-content").innerHTML=`<section class="admin-panel calendar-panel"><div class="admin-calendar-toolbar"><div><button data-month-prev>‹</button><label class="calendar-period">${calendarSpan==='week'?date(b.start)+' – '+date(ne…63285 tokens truncated…(action==="guest_cancel"){
    if(m.user_id!==user.id) return json({ok:false,error:"not_allowed"},403);

    if(m.status==="awaiting_payment"&&m.payment_charge_id){
      const {data,error}=await admin.rpc("cancel_post_booking_charge_atomic",{p_charge_id:m.payment_charge_id,p_user_id:user.id});
      if(error){
        const msg=String(error.message||"");
        if(msg.includes("payment_processing")) return json({ok:false,error:"payment_processing"},409);
        if(msg.includes("charge_already_applied")||msg.includes("charge_already_paid")) return json({ok:false,error:"not_allowed"},403);
        return json({ok:false,error:"modification_cancel_failed"},500);
      }
      const row=Array.isArray(data)?data[0]:data;
      return json({ok:true,status:row?.result_modification_status||"cancelled"});
    }

    if(!["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status))
      return json({ok:false,error:"not_allowed"},403);

    await admin.from("modification_requests").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"cancelled",actor_user_id:user.id});
    return json({ok:true,status:"cancelled"});
  }

  if(action==="guest_accept"){
    if(m.user_id!==user.id || m.status!=="awaiting_guest_acceptance") return json({ok:false,error:"not_allowed"},403);
    await admin.from("modification_requests").update({status:"accepted",guest_accepted_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"guest_accepted",amount_cents:m.admin_additional_amount_cents,actor_user_id:user.id});
    return json({ok:true,status:"accepted"});
  }

  if(!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);

  if(action==="decide"){
    const decision=body?.decision;
    if(decision==="reject"){
      if(!["requested","quoted"].includes(m.status)) return json({ok:false,error:"modification_not_approvable"},409);
      await admin.from("modification_requests").update({status:"rejected",admin_note:body?.admin_note||null,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",m.id);
      await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"rejected",actor_user_id:user.id});
      return json({ok:true,status:"rejected"});
    }

    if(!["requested","quoted"].includes(m.status)) return json({ok:false,error:"modification_not_approvable"},409);

    const targetProperty=Number(m.requested_property_id||m.reservations?.property_id);
    const targetIn=String(m.requested_check_in||m.reservations?.check_in||"");
    const targetOut=String(m.requested_check_out||m.reservations?.check_out||"");
    const listings=await searchData(targetIn,targetOut,Number(m.reservations?.guests||2),m.reservation_id,development);
    const target=listings.find((x:any)=>Number(x.id)===targetProperty);
    if(!target?.available){
      if(target?.unavailable_reason==="minimum_stay") return json({ok:false,error:"minimum_stay",min_stay:Number(target.min_stay||1)},409);
      return json({ok:false,error:target?.unavailable_reason||"dates_unavailable"},409);
    }

    // Refresh availability and price when approving; the request-time quote only lasts 15 minutes.
    let currentQuote:any;
    try{
      currentQuote=await modificationQuote(m.reservations,targetProperty,targetIn,targetOut,development);
    }catch(e){
      const message=String((e as Error)?.message||"modification_quote_failed");
      const min=/^minimum_stay:(\d+)$/.exec(message);
      return json({ok:false,error:min?"minimum_stay":message,min_stay:min?Number(min[1]):undefined},409);
    }
    const currentOption=currentQuote.rate_options.find((x:any)=>x.code===m.reservations?.rate_plan_code&&x.selectable);
    if(!currentOption) return json({ok:false,error:"original_rate_unavailable"},409);
    const freshReference=Number(currentOption.stay_amount_cents);
    const {error:repriceError}=await admin.from("modification_requests").update({
      reference_quote_id:currentQuote.quote_id,reference_amount_cents:freshReference,
      estimated_additional_amount_cents:Math.max(0,freshReference-Number(m.original_amount_cents))
    }).eq("id",m.id).in("status",["requested","quoted"]);
    if(repriceError) return json({ok:false,error:"modification_reprice_failed"},500);
    if(freshReference!==Number(m.reference_amount_cents))
      return json({ok:false,error:"modification_price_changed",reference_amount_cents:freshReference,
        additional_amount_cents:Math.max(0,freshReference-Number(m.original_amount_cents))},409);
    // The approved charge is calculated server-side; a cheaper replacement keeps the paid price.
    const originalCents=Number(m.original_amount_cents);
    const referenceCents=freshReference;
    if(!Number.isSafeInteger(originalCents)||!Number.isSafeInteger(referenceCents)||originalCents<0||referenceCents<0)
      return json({ok:false,error:"invalid_modification_quote"},409);
    const amount=Math.max(0,referenceCents-originalCents);
    const {data:settings}=await admin.from("payment_settings").select("modification_payment_deadline_hours").eq("id",1).single();
    const {data,error}=await admin.rpc("create_modification_charge_atomic",{
      p_request_id:m.id,
      p_admin_id:user.id,
      p_amount_cents:amount,
      p_deadline_hours:Number(settings?.modification_payment_deadline_hours||24),
      p_admin_note:body?.admin_note||null
    });
    if(error){
      const msg=String(error.message||"");
      for(const code of ["dates_unavailable","modification_not_approvable","reservation_not_changeable","modification_payment_deadline_passed","invalid_dates"])
        if(msg.includes(code)) return json({ok:false,error:code},409);
      return json({ok:false,error:"modification_approval_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({ok:true,status:"awaiting_payment",charge:{
      id:row?.charge_id||null,
      amount_cents:Number(row?.amount_cents||0),
      expires_at:row?.expires_at||null,
      reminder_at:row?.reminder_at||null
    }});
  }

  // Legacy path only for requests accepted before the payment-required workflow.
  if(action==="apply"){
    if(m.status!=="accepted") return json({ok:false,error:"guest_acceptance_required"},409);
    const {data:rpc,error:rpcErr}=await admin.rpc("apply_modification_mock_atomic",{p_request_id:m.id,p_actor_user_id:user.id});
    if(rpcErr) return json({ok:false,error:"modification_apply_failed"},500);
    const row=Array.isArray(rpc)?rpc[0]:rpc;
    return json({ok:true,status:"applied",payment_id:row?.result_payment_id||null,total_amount:row?.result_total_amount||null});
  }

  return json({ok:false,error:"invalid_operation"},400);
}

async function opsData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:mods},{data:guarantees},{data:payments},{data:charges},{data:settings},{data:properties},{data:integrations},{data:notifications}] = await Promise.all([
    admin.from("modification_requests").select("*,reservations(confirmation_code,check_in,check_out,total_amount,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("guarantees").select("*,reservations(confirmation_code,properties(name)),incidents!incidents_guarantee_id_fkey(*),guarantee_refunds(id,state,requested_cents,confirmed_cents,provider_error_code)").order("created_at",{ascending:false}).limit(50),
    admin.from("payments").select("id,reservation_id,provider,method,installments,amount_cents,status,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("post_booking_charges").select("id,reservation_id,kind,description,amount_cents,status,expires_at,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("payment_settings").select("*").eq("id",1).single(),
    admin.from("properties").select("id,code,name,active,cleaning_fee,guarantee_amount_cents,max_guests").order("id"),
    admin.from("property_integrations").select("property_id,provider,environment_key,external_listing_id,active").order("provider"),
    admin.from("notification_outbox").select("id,template_code,status,send_after,attempt_count,max_attempts,last_error,created_at,reservations(confirmation_code)").order("created_at",{ascending:false}).limit(50)
  ]);
  const bookingConfigured=(await calendars.channels("booking")).listings.map((x:any)=>({name:x.name,configured:x.ok}));
  return json({ok:true,modifications:mods||[],guarantees:guarantees||[],payments:payments||[],charges:charges||[],settings:settings||null,properties:properties||[],integrations:integrations||[],booking_configured:bookingConfigured,notifications:notifications||[]});
}

function localDate(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}

async function adminHubData(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const start=validDate(String(body?.start||""))?String(body.start):localDate(-31);
  const end=validDate(String(body?.end||""))?String(body.end):localDate(185);
  if(end<=start) return json({ok:false,error:"invalid_dates"},400);

  const [propertiesQ,reservationsQ,notificationsQ,integrationsQ,settingsQ,blocksQ,airbnb,booking] = await Promise.all([
    admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,active,cleaning_fee,max_guests,guarantee_amount_cents,check_in_time,check_out_time,timezone,created_at,updated_at").order("id"),
    admin.from("reservations").select("id,property_id,user_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,stay_amount,experience_amount,total_amount,rate_plan_code,confirmation_code,hold_expires_at,created_at,updated_at,confirmed_at,cancelled_at,not_confirmed_at,not_confirmed_reason,cancellation_actor,cancellation_reason,no_show_at,operational_status,checked_in_at,checked_out_at").lte("check_in",end).gte("check_out",start).order("created_at",{ascending:false}).limit(750),
    admin.from("admin_notifications").select("id,notification_type,severity,title,message,reservation_id,entity_type,entity_id,payload,read_at,created_at").order("created_at",{ascending:false}).limit(150),
    admin.from("property_integrations").select("id,property_id,provider,external_listing_id,pms,environment_key,active,updated_at").order("provider"),
    admin.from("payment_settings").select("*").eq("id",1).single(),
    admin.from("pms_calendar_blocks").select("*").gte("end_date",start).lte("start_date",end).order("start_date"),
    airbnbCalendarData().catch(()=>({ok:false,listings:[]})),
    bookingCalendarData().catch(()=>({configured:true,ok:false,listings:[]}))
  ]);
  if(propertiesQ.error||reservationsQ.error||notificationsQ.error||integrationsQ.error||settingsQ.error||blocksQ.error)
    return json({ok:false,error:"admin_hub_unavailable"},500);
  let cancellationPolicies:any[];
  try { cancellationPolicies=await developmentPolicies(); }
  catch { return json({ok:false,error:"cancellation_policy_unavailable"},500); }

  const reservations=reservationsQ.data||[];
  const reservationIds=reservations.map((r:any)=>r.id);
  const empty:any[]=[];
  const [paymentsQ,ordersQ,chargesQ,modsQ,guaranteesQ,notesQ,ledgerQ] = reservationIds.length ? await Promise.all([
    admin.from("payments").select("id,reservation_id,provider,provider_payment_id,method,installments,amount_cents,status,metadata,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("experience_orders").select("id,reservation_id,status,created_at,experience_order_items(id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,unit_price_cents,quantity,status,created_at)").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("post_booking_charges").select("id,reservation_id,kind,status,amount_cents,payment_id,description,snapshot,expires_at,applied_at,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,status,admin_additional_amount_cents,estimated_additional_amount_cents,admin_note,payment_due_at,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("guarantees").select("id,reservation_id,provider,provider_authorization_id,provider_capture_before,attention_code,provider_error_code,amount_cents,captured_amount_cents,refunded_amount_cents,released_amount_cents,release_confirmed,status,created_at,updated_at,incidents!incidents_guarantee_id_fkey(id,description,requested_capture_cents,evidence,status,category,decision,actor_user_id,decided_at,created_at,resolved_at),guarantee_refunds(id,state,requested_cents,confirmed_cents,provider_error_code)").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("reservation_notes").select("id,reservation_id,author_user_id,note,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("financial_entries").select("id,reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,currency,description,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false})
  ]) : [{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty}];

  if([paymentsQ,ordersQ,chargesQ,modsQ,guaranteesQ,notesQ,ledgerQ].some(q=>q.error))
    return json({ok:false,error:"reservation_financial_data_unavailable"},503);
  const properties=propertiesQ.data||[];
  const propertyByName=new Map<string,any>(properties.map((p:any)=>[String(p.name),p]));
  const channelPeriods:any[]=[];
  for(const listing of airbnb?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:calendarPeriodKey("airbnb",p.id,period),property_id:p.id,source:"airbnb",calendar_label:period.calendar_label,start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }
  for(const listing of booking?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:calendarPeriodKey("booking",p.id,period),property_id:p.id,source:period.source||"booking",calendar_label:period.calendar_label,start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }

  return json({
    ok:true,server_now:new Date().toISOString(),range:{start,end},properties,reservations,
    payments:paymentsQ.data||[],experience_orders:ordersQ.data||[],charges:chargesQ.data||[],
    modifications:modsQ.data||[],guarantees:(guaranteesQ.data||[]).map((g:any)=>({...g,financial:guaranteeState(g)})),notes:notesQ.data||[],ledger:ledgerQ.data||[],
    notifications:notificationsQ.data||[],integrations:integrationsQ.data||[],settings:settingsQ.data||{},
    cancellation_policies:cancellationPolicies,
    calendar_blocks:blocksQ.data||[],
    channel_periods:channelPeriods,
    channel_health:{airbnb:Boolean(airbnb?.ok),booking_configured:Boolean(booking?.configured),booking:Boolean(booking?.ok)}
  });
}

async function legalDocuments(req:Request,body:any,development:boolean){
 const user=await currentUser(req);
 if(body?.operation==="publish"){
  if(!development)return json({ok:false,error:"development_only"},403);
  if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
  const {data,error}=await admin.rpc("publish_booking_document",{p_type:body.document_type,p_title:body.title,p_body:String(body.body||"").replace(/^Chalezinho Ville • Versão .*$/gm,"").trim(),p_actor:user.id,p_previous_id:body.previous_id||null});
  if(error)return json({ok:false,error:error.message?.includes("policy_version_changed")?"policy_version_changed":"document_save_failed"},409);
  return json({ok:true,document_id:data});
 }
 const isAdmin=!!user&&await userIsAdmin(user);
 const {data,error}=await admin.from("policy_documents").select("id,document_type,code,version,title,body,status,effective_at,created_at,published_by").in("document_type",["hosting_terms","property_rules","privacy_policy"]).in("status",development?["active","draft","archived"]:["active"]).order("created_at",{ascending:false});
 if(error)return json({ok:false,error:"booking_terms_unavailable"},503);
 return json({ok:true,documents:bookingDocuments(data||[],development),...(isAdmin?{history:data||[]}:{} )});
}

async function adminCancellationPolicyAction(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const code=String(body?.rate_plan_code||"");
  const withdrawal=Number(body?.withdrawal_days);
  const commercial=Number(body?.commercial_free_cancellation_hours);
  const full=Number(body?.full_refund_days_before_checkin);
  const late=Number(body?.late_accommodation_refund_percent);
  if(!["refundable","non_refundable"].includes(code)||![commercial,withdrawal,full,late].every(Number.isInteger)
     ||commercial<0||commercial>720||withdrawal<7||withdrawal>30||full<1||full>365||late<0||late>100||(code==="non_refundable"&&late!==0))
    return json({ok:false,error:"invalid_policy_configuration"},400);
  const {data,error}=await admin.rpc("save_finance_cancellation_policy",{
    p_rate_plan_code:code,p_withdrawal_days:withdrawal,p_commercial_free_hours:commercial,
    p_full_refund_days_before_checkin:full,p_late_accommodation_refund_percent:late
  });
  if(error) return json({ok:false,error:"policy_save_failed"},500);
  return json({ok:true,document_id:data});
}

async function adminReservationAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");

  if(operation==="create_manual"){
    const propertyId=Number(body?.property_id||0);
    const checkIn=String(body?.check_in||""),checkOut=String(body?.check_out||"");
    const guests=Math.max(1,Math.round(Number(body?.guests||1)));
    const guestName=String(body?.guest_name||"").trim().slice(0,200);
    const guestEmail=String(body?.guest_email||"").trim().toLowerCase().slice(0,320)||null;
    const guestPhone=String(body?.guest_phone||"").trim().slice(0,50)||null;
    const total=Math.max(0,Number(body?.total_amount||0));
    if(!propertyId||!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn||!guestName) return json({ok:false,error:"invalid_reservation"},400);
    const [{data:property},{data:occupied},{data:changeHolds},{data:blocks},airbnb,booking]=await Promise.all([
      admin.from("properties").select("id,name,max_guests,cleaning_fee,active").eq("id",propertyId).single(),
      admin.from("reservations").select("id").eq("property_id",propertyId).in("status",["hold","pending_payment","confirmed"]).lt("check_in",checkOut).gt("check_out",checkIn).limit(1),
      admin.from("post_booking_charges").select("id").eq("kind","modification").eq("target_property_id",propertyId).in("status",["awaiting_payment","processing","paid"]).gt("expires_at",new Date().toISOString()).lt("target_check_in",checkOut).gt("target_check_out",checkIn).limit(1),
      admin.from("pms_calendar_blocks").select("id").eq("property_id",propertyId).eq("status","active").lt("start_date",checkOut).gt("end_date",checkIn).limit(1),
      airbnbCalendarData().catch(()=>({ok:false,listings:[]})),
      bookingCalendarData().catch(()=>({configured:true,ok:false,listings:[]}))
    ]);
    if(!property||!property.active) return json({ok:false,error:"property_not_found"},404);
    if(guests>Number(property.max_guests)) return json({ok:false,error:"capacity"},409);
    const externalBlocked=(source:any)=>{
      const listing=(source?.listings||[]).find((x:any)=>x.name===property.name);
      return !listing?.ok || (listing.periods||[]).some((x:any)=>overlaps(x.start,x.end,checkIn,checkOut));
    };
    if(occupied?.length||changeHolds?.length||blocks?.length||externalBlocked(airbnb)||(booking.configured&&externalBlocked(booking))) return json({ok:false,error:"occupied"},409);
    const code=crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
    const cleaning=Number(property.cleaning_fee||0);
    const {data,error}=await admin.from("reservations").insert({
      property_id:propertyId,check_in:checkIn,check_out:checkOut,status:"confirmed",source:"manual",guests,
      guest_name:guestName,guest_email:guestEmail,guest_phone:guestPhone,stay_amount:total,experience_amount:0,
      total_amount:total,accommodation_amount:Math.max(0,total-cleaning),cleaning_fee:cleaning,
      confirmation_code:code,confirmed_at:new Date().toISOString(),operational_status:"upcoming"
    }).select().single();
    if(error||!data){
      if(String(error?.message||"").includes("no_overlapping_active_reservations")) return json({ok:false,error:"occupied"},409);
      return json({ok:false,error:"reservation_create_failed"},500);
    }
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"manual_reservation_created",entity_type:"reservation",entity_id:data.id,new_value:{confirmation_code:code,check_in:checkIn,check_out:checkOut}});
    return json({ok:true,reservation:data});
  }

  const reservationId=String(body?.reservation_id||"");
  const {data:reservation,error}=await admin.from("reservations").select("*").eq("id",reservationId).single();
  if(error||!reservation) return json({ok:false,error:"reservation_not_found"},404);
  const now=new Date().toISOString();
  const todayInBrazil=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  if(operation==="add_note"){
    const note=String(body?.note||"").trim().slice(0,2000);
    if(!note) return json({ok:false,error:"note_required"},400);
    const {data,error:noteError}=await admin.from("reservation_notes").insert({reservation_id:reservation.id,author_user_id:user.id,note}).select().single();
    if(noteError) return json({ok:false,error:"note_create_failed"},500);
    return json({ok:true,note:data});
  }
  if(operation==="check_in"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_confirmed"},409);
    if(reservation.check_in>todayInBrazil||reservation.check_out<todayInBrazil||reservation.checked_in_at) return json({ok:false,error:"check_in_not_allowed"},409);
    const {data,error:updateError}=await admin.rpc("check_in_with_guarantee",{p_reservation:reservation.id,
      p_actor:user.id,p_exception_reason:body.guarantee_exception_reason||null});
    if(updateError)return json({ok:false,error:String(updateError.message).includes("guarantee_check_in_exception_required")?
      "guarantee_check_in_exception_required":"check_in_failed"},409);
    return json({ok:true,reservation:data});
  }
  if(operation==="check_out"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_confirmed"},409);
    if(reservation.check_in>todayInBrazil||!reservation.checked_in_at||reservation.checked_out_at) return json({ok:false,error:"check_out_not_allowed"},409);
    const {data,error:updateError}=await admin.from("reservations").update({operational_status:"checked_out",checked_out_at:reservation.checked_out_at||now,updated_at:now}).eq("id",reservation.id).select().single();
    if(updateError) return json({ok:false,error:"check_out_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"reservation_check_out",entity_type:"reservation",entity_id:reservation.id,new_value:{checked_out_at:data.checked_out_at}});
    return json({ok:true,reservation:data});
  }
  if(operation==="set_operational_status"){
    const next=String(body?.status||"");
    if(!["upcoming","preparing","ready","attention"].includes(next)) return json({ok:false,error:"invalid_operational_status"},400);
    const {data,error:updateError}=await admin.from("reservations").update({operational_status:next,updated_at:now}).eq("id",reservation.id).select().single();
    if(updateError) return json({ok:false,error:"status_update_failed"},500);
    return json({ok:true,reservation:data});
  }
  if(operation==="cancel"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_cancellable"},409);
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(!reason) return json({ok:false,error:"cancellation_reason_required"},400);
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"reservation_cancellation_requested",entity_type:"reservation",entity_id:reservation.id,new_value:{reason,state:"pending_refund_reconciliation"}});
    return json({ok:false,error:"refund_reconciliation_required",status:"pending",reservation_id:reservation.id},409);
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function adminNotificationAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation==="mark_read"){
    const id=String(body?.notification_id||"");
    const {error}=await admin.from("admin_notifications").update({read_at:new Date().toISOString()}).eq("id",id);
    if(error) return json({ok:false,error:"notification_update_failed"},500);
    return json({ok:true});
  }
  if(operation==="mark_all_read"){
    const {error}=await admin.from("admin_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);
    if(error) return json({ok:false,error:"notification_update_failed"},500);
    return json({ok:true});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function adminAvailabilityAction(req:Request,body:any){
 const user=await currentUser(req);if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
 const {data:p,error}=await admin.from("properties").select("id,features,updated_at").eq("id",Number(body.property_id)).single();
 if(error||!p)return json({ok:false,error:"property_not_found"},404);
 if(body.operation==="get")return json({ok:true,rules:availabilityRules(p.features?.availability||{}),updated_at:p.updated_at});
 if(body.operation!=="save")return json({ok:false,error:"invalid_operation"},400);
 let rules;try{rules=availabilityRules(body.rules)}catch(e){return json({ok:false,error:(e as Error).message},400)}
 if(body.updated_at!==p.updated_at)return json({ok:false,error:"availability_conflict"},409);
 const saved=await admin.from("properties").update({features:{...p.features,availability:rules},updated_at:new Date().toISOString()}).eq("id",p.id).eq("updated_at",p.updated_at).select("id").maybeSingle();
 if(saved.error||!saved.data)return json({ok:false,error:"availability_conflict"},409);
 await admin.from("audit_events").insert({actor_user_id:user.id,action:"availability_updated",entity_type:"property",entity_id:String(p.id),new_value:rules});
 return json({ok:true,rules});
}

async function adminPropertyAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation!=="save") return json({ok:false,error:"invalid_operation"},400);
  const galleryInput=body?.gallery;
  if(!Array.isArray(galleryInput)||galleryInput.length>40) return json({ok:false,error:"invalid_gallery"},400);
  const gallery=galleryInput.map((item:any)=>({url:String(item?.url||""),alt:String(item?.alt||"").trim().slice(0,180)}));
  const allowedPrefix=projectUrl+"/storage/v1/object/public/property-media/";
  if(gallery.some((item:any)=>!(item.url.startsWith(allowedPrefix)||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)(\?v=[0-9]+)?$/.test(item.url)))) return json({ok:false,error:"invalid_gallery_url"},400);
  const coverImage=String(body?.cover_image||"");
  if(coverImage && !gallery.some((item:any)=>item.url===coverImage)) return json({ok:false,error:"invalid_cover"},400);
  const id=body?.id?Number(body.id):null;
  const name=String(body?.name||"").trim().slice(0,160);
  const code=String(body?.code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,30);
  const slug=String(body?.slug||"").trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,100);
  const propertyType=["chalet","apartment","house","cabin","other"].includes(String(body?.property_type))?String(body.property_type):"other";
  const checkIn=String(body?.check_in_time||"15:00").slice(0,5);
  const checkOut=String(body?.check_out_time||"11:00").slice(0,5);
  if(!name||!code||!slug||!/^\d{2}:\d{2}$/.test(checkIn)||!/^\d{2}:\d{2}$/.test(checkOut)) return json({ok:false,error:"invalid_property"},400);
  let terms;
  try { terms=paymentTerms({payment_terms:{max_installments:Number(body?.max_installments??12),
    no_interest_installments:Number(body?.no_interest_installments??6),interest_payer:body?.interest_payer}}); }
  catch { return json({ok:false,error:"invalid_payment_terms"},400); }
  const {data:previous}=id?await admin.from("properties").select("features").eq("id",id).single():{data:null};
  const payload={
    name,code,slug,property_type:propertyType,cover_image:coverImage||null,gallery,
    tagline:String(body?.tagline||"").trim().slice(0,240)||null,
    summary:String(body?.summary||"").trim().slice(0,3000)||null,
    max_guests:Math.max(1,Math.min(50,Math.round(Number(body?.max_guests||2)))),
    cleaning_fee:Math.max(0,Math.min(100000,Number(body?.cleaning_fee||0))),
    guarantee_amount_cents:Math.max(0,Math.min(100000000,Math.round(Number(body?.guarantee_amount_cents||0)))),
    check_in_time:checkIn,check_out_time:checkOut,timezone:"America/Sao_Paulo",active:body?.active!==false,
    features:{...(previous?.features||{}),payment_terms:terms},updated_at:new Date().toISOString()
  };
  const result=id
    ? await admin.from("properties").update(payload).eq("id",id).select().single()
    : await admin.from("properties").insert(payload).select().single();
  if(result.error||!result.data) return json({ok:false,error:"property_save_failed"},409);
  await admin.from("audit_events").insert({actor_user_id:user.id,action:id?"property_updated":"property_created",entity_type:"property",entity_id:String(result.data.id),new_value:{name,code,active:payload.active}});
  return json({ok:true,property:result.data});
}

async function opsSettingsAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation==="payment_settings"){
    let payload;try{payload={...validatePaymentSettings(body),updated_at:new Date().toISOString()}}
    catch{return json({ok:false,error:"invalid_payment_settings"},400)}
    const {data,error}=await admin.from("payment_settings").update(payload).eq("id",1).select().single();
    if(error) return json({ok:false,error:"settings_update_failed"},500);
    return json({ok:true,settings:data});
  }
  if(operation==="property_settings"){
    const propertyId=Number(body?.property_id||0);
    const cleaningFee=Math.max(0,Math.min(100000,Number(body?.cleaning_fee||0)));
    const guaranteeCents=Math.max(0,Math.min(100000000,Math.round(Number(body?.guarantee_amount_cents||0))));
    if(!propertyId||!Number.isFinite(cleaningFee)||!Number.isFinite(guaranteeCents)) return json({ok:false,error:"invalid_settings"},400);
    const {data,error}=await admin.from("properties").update({cleaning_fee:cleaningFee,guarantee_amount_cents:guaranteeCents,updated_at:new Date().toISOString()}).eq("id",propertyId).select("id,code,name,cleaning_fee,guarantee_amount_cents").single();
    if(error) return json({ok:false,error:"settings_update_failed"},500);
    return json({ok:true,property:data});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function guaranteeAction(_req:Request,_body:any){
  return json({ok:false,error:"legacy_guarantee_endpoint_removed"},410);
}

async function experienceAdminData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:products,error:pe},{data:properties,error:pre},{data:purposes,error:pu}] = await Promise.all([
    admin.from("experience_products")
      .select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,daily_capacity,inventory,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)")
      .order("display_order"),
    admin.from("properties").select("id,code,name,active").eq("active",true).order("id"),
    admin.from("travel_purposes").select("code,label,active,display_order").eq("active",true).order("display_order")
  ]);
  if(pe||pre||pu) return json({ok:false,error:"experience_admin_unavailable"},500);
  return json({ok:true,products:products||[],properties:properties||[],purposes:purposes||[]});
}

async function experienceAdminAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");


  if(operation==="save_simple_product"){
    const id=body?.id||null;
    const name=String(body?.name||"").trim().slice(0,160);
    const description=String(body?.description||"").trim().slice(0,3000)||null;
    const packageType=["romantic","beach","breakfast","celebration","wellness","other"].includes(String(body?.package_type))?String(body.package_type):"other";
    const priceCents=Math.max(0,Math.round(Number(body?.price_cents||0)));
    const upsellEnabled=body?.upsell_enabled===true;
    let components;try{components=experienceComponents({components:body.components||[]})}catch{return json({ok:false,error:"invalid_components"},400)}
    const propertyIds=Array.isArray(body.property_ids)?[...new Set(body.property_ids.map(Number))]:null;
    if(propertyIds&&(!propertyIds.length||propertyIds.some((x:any)=>!Number.isSafeInteger(x)||x<1)))return json({ok:false,error:"experience_property_required"},400);
    const rawMedia=Array.isArray(body?.media_items)?body.media_items:[];
    const mediaItems=[...new Map(rawMedia
      .map((m:any,i:number)=>({
        media_url:String(m?.media_url||"").trim().slice(0,1000),
        alt_text:String(m?.alt_text||name).trim().slice(0,240)||name,
        display_order:Number.isFinite(Number(m?.display_order))?Number(m.display_order):(i+1)*10
      }))
      .filter((m:any)=>m.media_url)
      .map((m:any)=>[m.media_url,m])).values()];
    if(!name) return json({ok:false,error:"experience_name_required"},400);
    if(priceCents<=0) return json({ok:false,error:"experience_price_required"},400);
    if(mediaItems.length<1) return json({ok:false,error:"experience_photo_required",photo_count:mediaItems.length},400);

    let existing:any=null;
    if(id){
      const {data,error}=await admin.from("experience_products").select("*").eq("id",id).single();
      if(error||!data) return json({ok:false,error:"experience_not_found"},404);
      existing=data;
    }
    const baseCode=(name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,60)||"pacote");
    const code=existing?.code || (baseCode+"_"+crypto.randomUUID().slice(0,6));
    const productPayload={
      code,name,description,package_type:packageType,price_cents:priceCents,upsell_enabled:upsellEnabled,
      status:body.status==="active"?"active":body.status==="inactive"?"inactive":existing?.status||"draft",
      sales_headline:existing?.sales_headline||null,
      details:{...(existing?.details||{}),...(body.components?{components}:{}),standalone_enabled:body.standalone_enabled??existing?.details?.standalone_enabled??true,offer_enabled:body.offer_enabled??existing?.details?.offer_enabled??true},
      minimum_lead_hours:Number(body.minimum_lead_hours??existing?.minimum_lead_hours??0),daily_capacity:body.daily_capacity===null?null:Number(body.daily_capacity??existing?.daily_capacity??0)||null,inventory:body.inventory===null?null:body.inventory!==undefined?Number(body.inventory):existing?.inventory??null,
      travel_purposes:Array.isArray(existing?.travel_purposes)?existing.travel_purposes:[],
      display_order:Number(existing?.display_order||0)
    };
    if(!components.length&&body.components)return json({ok:false,error:"package_components_required"},400);
    if([productPayload.minimum_lead_hours,productPayload.daily_capacity,productPayload.inventory].some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>100000)))return json({ok:false,error:"invalid_experience_limits"},400);
    const prefix=projectUrl+"/storage/v1/object/public/experience-media/";
    if(mediaItems.some((m:any)=>!(m.media_url.startsWith(prefix)||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)$/.test(m.media_url))))return json({ok:false,error:"invalid_offer_photo"},400);
    const {data:props}=await admin.from("properties").select("id").eq("active",true);
    const eligibleIds=propertyIds||(existing?(await admin.from("experience_property_eligibility").select("property_id").eq("product_id",id)).data?.map((x:any)=>x.property_id):props?.map((x:any)=>x.id))||[];
    const {data:product,error}=await admin.rpc("save_experience_package_atomic",{p_id:id,p_actor:user.id,p_product:productPayload,p_properties:eligibleIds,p_media:mediaItems});
    if(error||!product)return json({ok:false,error:"experience_save_failed"},409);
    return json({ok:true,product});
  }

  if(operation==="toggle_product_status"){
    if(!body?.id) return json({ok:false,error:"experience_not_found"},404);
    const {data:product}=await admin.from("experience_products").select("id,status").eq("id",body.id).single();
    if(!product) return json({ok:false,error:"experience_not_found"},404);
    const next=product.status==="active"?"inactive":"active";
    if(next==="active"){
      const {count}=await admin.from("experience_media").select("id",{count:"exact",head:true}).eq("product_id",product.id);
      if(Number(count||0)<1) return json({ok:false,error:"experience_photo_required",photo_count:Number(count||0)},400);
    }
    const {data,error}=await admin.from("experience_products").update({status:next}).eq("id",product.id).select().single();
    if(error) return json({ok:false,error:"experience_status_failed"},500);
    return json({ok:true,product:data});
  }

  if(operation==="delete_product"){
    if(!body?.id) return json({ok:false,error:"experience_not_found"},404);
    const productId=body.id;
    const [{count:orders},{count:quotes},{data:media}]=await Promise.all([
      admin.from("experience_order_items").select("id",{count:"exact",head:true}).eq("product_id",productId),
      admin.from("quote_experience_items").select("id",{count:"exact",head:true}).eq("product_id",productId),
      admin.from("experience_media").select("media_url").eq("product_id",productId)
    ]);
    if(Number(orders||0)>0 || Number(quotes||0)>0){
      const {error}=await admin.from("experience_products").update({status:"archived"}).eq("id",productId);
      if(error) return json({ok:false,error:"experience_delete_failed"},500);
      return json({ok:true,archived:true});
    }
    const storagePrefix=projectUrl+"/storage/v1/object/public/experience-media/";
    const storagePaths=(media||[]).map((m:any)=>String(m.media_url||"")).filter((u:string)=>u.startsWith(storagePrefix)).map((u:string)=>decodeURIComponent(u.slice(storagePrefix.length)));
    const {error}=await admin.from("experience_products").delete().eq("id",productId);
    if(error) return json({ok:false,error:"experience_delete_failed"},500);
    if(storagePaths.length) await admin.storage.from("experience-media").remove(storagePaths);
    return json({ok:true,deleted:true});
  }

  if(operation==="save_product"){
    const payload={
      code:String(body?.code||"").trim().toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80),
      name:String(body?.name||"").trim().slice(0,160),
      description:String(body?.description||"").trim().slice(0,2000)||null,
      sales_headline:String(body?.sales_headline||"").trim().slice(0,240)||null,
      status:["draft","active","inactive","archived"].includes(body?.status)?body.status:"draft",
      minimum_lead_hours:Math.max(0,Math.min(8760,Number(body?.minimum_lead_hours||0))),
      travel_purposes:Array.isArray(body?.travel_purposes)?body.travel_purposes.map(String).slice(0,20):[],
      display_order:Number(body?.display_order||0),
      details:typeof body?.details==="object"&&body.details?body.details:{}
    };
    if(!payload.code||!payload.name) return json({ok:false,error:"invalid_experience"},400);
    let product:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_products").update(payload).eq("id",body.id).select().single();product=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_products").insert(payload).select().single();product=r.data;error=r.error;
    }
    if(error||!product) return json({ok:false,error:"experience_save_failed"},500);
    const propertyIds=Array.isArray(body?.property_ids)?[...new Set(body.property_ids.map(Number).filter(Number.isFinite))]:[];
    await admin.from("experience_property_eligibility").delete().eq("product_id",product.id);
    if(propertyIds.length){
      const {error:eligErr}=await admin.from("experience_property_eligibility").insert(propertyIds.map((property_id:number)=>({product_id:product.id,property_id})));
      if(eligErr) return json({ok:false,error:"experience_eligibility_save_failed"},500);
    }
    return json({ok:true,product});
  }

  if(operation==="save_variant"){
    const payload={
      product_id:body?.product_id,
      code:String(body?.code||"").trim().toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80),
      name:String(body?.name||"").trim().slice(0,120),
      price_cents:Math.max(0,Math.round(Number(body?.price_cents||0))),
      active:body?.active!==false,
      display_order:Number(body?.display_order||0)
    };
    if(!payload.product_id||!payload.code||!payload.name) return json({ok:false,error:"invalid_variant"},400);
    let variant:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_variants").update(payload).eq("id",body.id).select().single();variant=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_variants").insert(payload).select().single();variant=r.data;error=r.error;
    }
    if(error||!variant) return json({ok:false,error:"variant_save_failed"},500);
    return json({ok:true,variant});
  }

  if(operation==="save_media"){
    const payload={
      product_id:body?.product_id,
      media_url:String(body?.media_url||"").trim().slice(0,1000),
      alt_text:String(body?.alt_text||"").trim().slice(0,240)||null,
      display_order:Number(body?.display_order||0)
    };
    if(!payload.product_id||!payload.media_url) return json({ok:false,error:"invalid_media"},400);
    let media:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_media").update(payload).eq("id",body.id).select().single();media=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_media").insert(payload).select().single();media=r.data;error=r.error;
    }
    if(error||!media) return json({ok:false,error:"media_save_failed"},500);
    return json({ok:true,media});
  }

  if(operation==="delete_media"){
    if(!body?.id) return json({ok:false,error:"invalid_media"},400);
    const {error}=await admin.from("experience_media").delete().eq("id",body.id);
    if(error) return json({ok:false,error:"media_delete_failed"},500);
    return json({ok:true});
  }

  return json({ok:false,error:"invalid_operation"},400);
}


async function guestExperienceCatalog(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  if(!reservationId) return json({ok:false,error:"missing_data"},400);

  const {data:r,error:re}=await admin.from("reservations")
    .select("id,user_id,property_id,check_in,check_out,status")
    .eq("id",reservationId).single();
  if(re||!r||r.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(r.status!=="confirmed") return json({ok:false,error:"reservation_not_available"},409);

  const {data:products,error:pe}=await admin.from("experience_products")
    .select("id,name,description,sales_headline,package_type,price_cents,upsell_enabled,minimum_lead_hours,daily_capacity,inventory,status,details,created_at,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility!inner(property_id),experience_media(id,media_url,alt_text,display_order)")
    .eq("status","active")
    .eq("experience_property_eligibility.property_id",r.property_id)
    .order("display_order");
  if(pe) return json({ok:false,error:"experience_catalog_unavailable"},500);

  const {data:existing}=await admin.from("experience_orders")
    .select("experience_order_items(id,product_id,product_name_snapshot,unit_price_cents,status,experience_products(package_type,price_cents,name,upsell_enabled))")
    .eq("reservation_id",r.id)
    .in("status",["pending","active"]);
  const activeItems=(existing||[]).flatMap((o:any)=>o.experience_order_items||[]).filter((i:any)=>i.status==="active");

  const arrival=Date.parse(String(r.check_in)+"T15:00:00-03:00");
  const now=Date.now();
  const items=[];
  for(const p of products||[]){
    const variant=(p.experience_variants||[]).filter((v:any)=>v.active).sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))[0];
    if(!variant||p.details?.standalone_enabled===false) continue;
    const leadOk=(arrival-now)>=Number(p.minimum_lead_hours||0)*3600000;
    const stockOk=p.inventory==null||Number(p.inventory)>0;
    if(!stockOk) continue;
    const viability=await admin.rpc("experience_sale_issue",{p_product:p.id,p_property:r.property_id,p_start:r.check_in,p_end:r.check_out,p_exclude:r.id});if(viability.error||viability.data)continue;

    const current=activeItems.find((i:any)=>i.experience_products?.package_type===p.package_type);
    let purchaseMode="add",payableCents=Number(variant.price_cents),upgradeFrom=null;
    if(current){
      if(String(current.product_id)===String(p.id)) continue;
      if(current.experience_products?.upsell_enabled!==true) continue;
      const sourceCatalogPrice=Number(current.experience_products?.price_cents??current.unit_price_cents??0);
      const next=(products||[])
        .filter((x:any)=>x.package_type===p.package_type&&x.status==="active"&&Number(x.price_cents)>sourceCatalogPrice&&(x.inventory==null||Number(x.inventory)>0))
        .sort((a:any,b:any)=>Number(a.price_cents)-Number(b.price_cents)||String(a.created_at||"").localeCompare(String(b.created_at||"")))[0];
      if(!next||String(next.id)!==String(p.id)) continue;
      payableCents=Math.max(0,Number(variant.price_cents)-Number(current.unit_price_cents||0));
      if(payableCents<=0) continue;
      purchaseMode="upgrade";
      upgradeFrom={product_id:current.product_id,name:current.product_name_snapshot,price_cents:Number(current.unit_price_cents||0)};
    }

    let capacityOk=true;
    if(p.daily_capacity!=null){
      const {count}=await admin.from("experience_order_items")
        .select("id,experience_orders!inner(reservation_id,status,reservations!inner(check_in,status))",{count:"exact",head:true})
        .eq("product_id",p.id)
        .eq("status","active")
        .in("experience_orders.status",["pending","active"])
        .eq("experience_orders.reservations.check_in",r.check_in)
        .in("experience_orders.reservations.status",["confirmed","pending_payment"]);
      capacityOk=Number(count||0)<Number(p.daily_capacity);
    }
    if(!capacityOk) continue;

    items.push({
      product_id:p.id,variant_id:variant.id,name:p.name,description:p.description,
      sales_headline:p.sales_headline,package_type:p.package_type,components:experienceComponents(p.details),
      price_cents:Number(variant.price_cents),payable_cents:payableCents,purchase_mode:purchaseMode,
      upgrade_from:upgradeFrom,
      media:(p.experience_media||[]).slice().sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))
    });
  }
  return json({
    ok:true,
    reservation_id:r.id,
    items,
    owned_packages:activeItems.map((i:any)=>({
      product_id:i.product_id,
      name:i.product_name_snapshot,
      package_type:i.experience_products?.package_type||"other",
      price_cents:Number(i.unit_price_cents||0)
    }))
  });
}

async function purchasePostBookingExperience(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  const variantId=String(body?.variant_id||"");
  if(!reservationId||!variantId) return json({ok:false,error:"missing_data"},400);

  const {data,error}=await admin.rpc("add_experience_cart_item_atomic",{
    p_reservation_id:reservationId,
    p_user_id:user.id,
    p_variant_id:variantId,p_preferences:body.experience_preferences||{}
  });
  if(error){
    const msg=String(error.message||"");
    if(msg.includes("experience_payment_already_pending")){
      const {data:variant}=await admin.from("experience_variants")
        .select("product_id,experience_products(package_type)").eq("id",variantId).maybeSingle();
      const packageType=(variant as any)?.experience_products?.package_type;
      let existing:any=null;
      if(packageType){
        const {data}=await admin.from("post_booking_charges")
          .select("id,reservation_id,kind,status,amount_cents,payment_id,modification_request_id,description,expires_at,snapshot,created_at,payments(status,method,installments)")
          .eq("reservation_id",reservationId).eq("user_id",user.id)
          .in("kind",["experience_add","experience_upgrade"])
          .in("status",["awaiting_payment","processing","paid"])
          .gt("expires_at",new Date().toISOString())
          .eq("snapshot->>package_type",packageType)
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        existing=data;
      }
      return json({ok:false,error:"experience_payment_already_pending",existing_charge:existing},409);
    }
    for(const code of [
      "reservation_not_available","experience_unavailable","experience_lead_time","experience_out_of_stock",
      "experience_already_added","experience_upgrade_not_available","experience_capacity_reached",
      "experience_payment_already_pending","experience_component_conflict","experience_choice_required","invalid_experience_choice"
    ]) if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"experience_charge_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({
    ok:true,
    cart_item:{
      id:row?.cart_item_id||null,
      purchase_mode:row?.purchase_mode||"add",
      amount_cents:Number(row?.amount_cents||0),
      description:row?.description||"Experiência"
    }
  });
}

async function checkoutExperienceCartItem(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const cartItemId=String(body?.cart_item_id||"");
  if(!cartItemId) return json({ok:false,error:"missing_data"},400);
  const {data:settings}=await admin.from("payment_settings").select("post_booking_payment_minutes").eq("id",1).single();
  const {data,error}=await admin.rpc("checkout_experience_cart_item_atomic",{
    p_cart_item_id:cartItemId,p_user_id:user.id,
    p_expires_minutes:Number(settings?.post_booking_payment_minutes||15)
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["cart_item_not_found","reservation_not_available","experience_unavailable","experience_lead_time",
      "experience_out_of_stock","experience_already_added","experience_upgrade_not_available","experience_choice_required","invalid_experience_choice","experience_component_conflict",
      "experience_capacity_reached","experience_payment_already_pending"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"experience_checkout_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,charge:{id:row?.charge_id||null,
    kind:row?.purchase_mode==="upgrade"?"experience_upgrade":"experience_add",
    purchase_mode:row?.purchase_mode||"add",amount_cents:Number(row?.amount_cents||0),
    description:row?.description||"Experiência",expires_at:row?.expires_at||null}});
}

async function removeExperienceCartItem(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const cartItemId=String(body?.cart_item_id||"");
  if(!cartItemId) return json({ok:false,error:"missing_data"},400);
  const {data,error}=await admin.rpc("remove_experience_cart_item_atomic",{p_cart_item_id:cartItemId,p_user_id:user.id});
  if(error) return json({ok:false,error:"cart_remove_failed"},500);
  return json({ok:true,removed:data===true});
}

async function startPostBookingPayment(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  if(!development) return json({ok:false,error:"payment_provider_not_ready"},409);

  const chargeId=String(body?.charge_id||"");
  const method=String(body?.method||"pix");
  const installments=Math.max(1,Number(body?.installments||1));
  const sandbox=body?.provider==="pagbank_sandbox";
  if(!sandbox) return json({ok:false,error:"invalid_provider"},400);
  if(!chargeId||!["pix","card"].includes(method)) return json({ok:false,error:"missing_data"},400);

  const {data:settings}=await admin.from("payment_settings")
    .select("active_provider,pix_enabled,card_enabled,max_card_installments,pix_expiration_minutes").eq("id",1).single();
  try{assertPaymentMethod(settings,method)}catch(e){return json({ok:false,error:(e as Error).message},409)}
  if(method==="card"&&(!Number.isInteger(installments)||installments>12))
    return json({ok:false,error:"invalid_installments"},400);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(sandbox&&!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  if(sandbox&&method==="card"&&typeof body?.encrypted_card!=="string")
    return json({ok:false,error:"encrypted_card_required"},400);

  const {data:chargeTerms}=await admin.from("post_booking_charges")
    .select("amount_cents,reservations(property_id)").eq("id",chargeId).eq("user_id",user.id).maybeSingle();
  if(!chargeTerms) return json({ok:false,error:"charge_not_found"},404);
  const baseAmount=Number(chargeTerms.amount_cents);
  let plan:any=null;
  if(method==="card"){
    try{plan=await loadInstallmentOffer(admin,String(body.installment_offer_id||""),{
        userId:user.id,chargeId,baseAmount,installments,cardBin:String(body.credit_card_bin||"")})}
    catch{return json({ok:false,error:"installment_plans_unavailable"},409)}
  }
  const buyerInterest=Number(plan?.buyer_interest_cents||0);
  const chargeTotal=baseAmount+buyerInterest;
  if(method==="card"&&Number(body?.quoted_total_cents)!==chargeTotal)
    return json({ok:false,error:"installment_quote_changed"},409);

  const {data,error}=await admin.rpc("start_post_booking_payment_atomic",{
    p_charge_id:chargeId,p_user_id:user.id,p_provider:sandbox?"pagbank_sandbox":"mock",p_method:method,p_installments:installments
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","charge_already_applied","charge_expired","payment_not_required"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"post_booking_payment_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  if(sandbox){
    const paymentId=row?.payment_id;
    const {data:payment}=await admin.from("payments").select("provider,provider_payment_id,metadata,status,amount_cents,method,installments")
      .eq("id",paymentId).single();
    if(payment?.provider!=="pagbank_sandbox") return json({ok:false,error:"payment_provider_mismatch"},409);
    if(payment.method!==method||Number(payment.installments||1)!==installments||
       ![baseAmount,chargeTotal].includes(Number(payment.amount_cents)))
      return json({ok:false,error:"payment_terms_mismatch"},409);
    if(payment.provider_payment_id){
      if(Number(payment.amount_cents)!==chargeTotal) return json({ok:false,error:"payment_terms_mismatch"},409);
      try{await reconcileSandboxCharge(paymentId,payment.provider_payment_id,token,payment.metadata?.order_id,true)}catch(e){
        console.error(JSON.stringify({event:"post_booking_status_deferred",payment_id:paymentId,error:String(e)}));
      }
      return json({ok:true,payment:{id:paymentId,status:payment.status,amount_cents:chargeTotal,
        method,installments:method==="card"?installments:null,provider:"pagbank_sandbox"},
        charge_status:row.charge_status,charge_expires_at:row.charge_expires_at});
    }
    const [{data:charge},{data:identity}]=await Promise.all([
      admin.from("post_booking_charges").select("reservation_id,amount_cents,expires_at,reservations(guest_name,guest_email,guest_phone)").eq("id",chargeId).eq("user_id",user.id).single(),
      admin.rpc("guest_payment_identity",{p_user_id:user.id})
    ]);
    const id=Array.isArray(identity)?identity[0]:identity;
    const guest=(charge?.reservations as any);
    if(!charge||Number(charge.amount_cents)!==Number(row.amount_cents)||id?.document_type!=="cpf"||
       !guest||String(guest.guest_email).toLowerCase()!==String(user.email).toLowerCase())
      return json({ok:false,error:"pagbank_customer_invalid",payment_id:paymentId},400);
    const digits=String(guest.guest_phone||"").replace(/\D/g,"");
    const phone=digits.startsWith("55")&&digits.length>=12?digits.slice(2):digits;
    try{
      const {data:amountSaved,error:amountError}=await admin.from("payments").update({amount_cents:chargeTotal,
        metadata:{...(payment.metadata||{}),environment:"sandbox",base_amount_cents:baseAmount,
          buyer_interest_cents:buyerInterest}}).eq("id",paymentId)
        .eq("status","awaiting_payment").is("provider_payment_id",null).select("id").maybeSingle();
      if(amountError||!amountSaved) throw new Error("payment_state_changed");
      const expiry=new Date(Math.min(Date.parse(charge.expires_at),Date.now()+Number(settings.pix_expiration_minutes)*60000));
      const orderInput={referenceId:String(paymentId).replace(/-/g,""),amountCents:chargeTotal,
        customer:{name:guest.guest_name,email:guest.guest_email,taxId:id.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},method:method as "pix"|"card",
        expiresAt:expiry,encryptedCard:body?.encrypted_card,installments,
        buyerInterest:buyerInterest?{total:buyerInterest,installments:Number(plan.buyer_interest_installments)}:undefined,
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"};
      const gateway=paymentGateway("pagbank_sandbox",token);
      const result=await (method==="pix"?gateway.createPix(orderInput):gateway.createCardPayment(orderInput));
      const {error:saveError}=await admin.from("payments").update({provider_payment_id:result.chargeId,
        metadata:{...(payment.metadata||{}),environment:"sandbox",order_id:result.orderId,
          base_amount_cents:baseAmount,buyer_interest_cents:buyerInterest}}).eq("id",paymentId);
      if(saveError) throw saveError;
      if(result.status!=="WAITING") await reconcileSandboxCharge(paymentId,result.chargeId,token,result.orderId,true);
      return json({ok:true,payment:{id:paymentId,status:result.status==="PAID"?"paid":"awaiting_payment",
        amount_cents:chargeTotal,method,installments:method==="card"?installments:null,
        provider:"pagbank_sandbox",pix_code:result.pixCode,qr_image_url:result.qrImageUrl},
        charge_status:row.charge_status,charge_expires_at:row.charge_expires_at});
    }catch(e){
      console.error(JSON.stringify({event:"post_booking_pagbank_uncertain",payment_id:paymentId,error:String(e)}));
      return json({ok:false,error:"pagbank_start_uncertain",payment_id:paymentId},503);
    }
  }
  return json({ok:true,payment:{
    id:row?.payment_id||null,status:row?.payment_status||"awaiting_payment",
    amount_cents:Number(row?.amount_cents||0),method,installments:method==="card"?installments:null
  },charge_status:row?.charge_status||"processing",charge_expires_at:row?.charge_expires_at||null});
}

async function confirmFreePostBookingCharge(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const chargeId=String(body?.charge_id||"");
  const {data,error}=await admin.rpc("confirm_free_post_booking_charge_atomic",{p_charge_id:chargeId,p_user_id:user.id});
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","payment_required","charge_expired","dates_unavailable","modification_not_payable"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"charge_confirm_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,status:row?.result_status||"applied",total_amount:Number(row?.result_total_amount||0)});
}

async function cancelPostBookingCharge(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const chargeId=String(body?.charge_id||"");
  const {data,error}=await admin.rpc("cancel_post_booking_charge_atomic",{p_charge_id:chargeId,p_user_id:user.id});
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","charge_already_applied","charge_already_paid","payment_processing"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"charge_cancel_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,status:row?.result_charge_status||"cancelled",modification_status:row?.result_modification_status||null});
}

async function trackEvent(req:Request,body:any){
  const allowed=new Set(["search_started","search_completed","property_viewed","rate_viewed","rate_selected","experience_viewed","experience_added","experience_upgraded","checkout_started","login_started","account_created","payment_started","payment_failed","booking_confirmed","modification_requested","precheckin_started","guarantee_completed","checkin_completed","checkout_completed","review_requested","repeat_booking_started"]);
  if(!allowed.has(String(body?.event_name||""))) return json({ok:false,error:"invalid_event"},400);
  const user=await currentUser(req);
  const {error}=await admin.from("analytics_events").insert({
    event_name:body.event_name,anonymous_id:String(body.anonymous_id||"").slice(0,120)||null,user_id:user?.id||null,
    reservation_id:body.reservation_id||null,property_id:body.property_id||null,
    metadata:typeof body.metadata==="object"&&body.metadata?body.metadata:{}
  });
  if(error){
    console.error(JSON.stringify({event:"analytics_insert_failed",code:error.code||null,message:error.message||"unknown"}));
    return json({ok:false,error:"analytics_unavailable"},500);
  }
  return json({ok:true});
}



async function retryDb(label:string,run:()=>PromiseLike<any>,attempts=3){
  let last:any=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const result=await run();
      last=result;
      if(!result?.error) return result;
      console.error(JSON.stringify({event:"db_query_failed",label,attempt,code:result.error?.code||null,message:result.error?.message||"unknown"}));
    }catch(error){
      last={data:null,error};
      console.error(JSON.stringify({event:"db_query_exception",label,attempt,message:String((error as Error)?.message||error)}));
    }
    if(attempt<attempts) await new Promise(r=>setTimeout(r,250*attempt));
  }
  return last;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{assertFinanceDevelopment(projectUrl,Deno.env.get("FINANCE_ENVIRONMENT"))}
  catch{return json({ok:false,error:"isolated_finance_environment_required"},503)}
  try{
    const url=new URL(req.url);
    let body:any={};
    if(req.method==="POST") body=await req.json().catch(()=>({}));
    const action=url.searchParams.get("action")||body.action||"config";
    if(action==="calendar_export"){
      if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      return await calendars.exportFeed(url.searchParams.get("token")||"");
    }
    if(action==="admin_calendar")return await adminCalendarAction(req,body);
    const origin=req.headers.get("origin")||"";
    const development=req.headers.get("x-chalezinho-env")==="development" &&
      (origin==="https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-fix-reservation-f-9818b3-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-feature-guest-directory-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-integracao-pagbank-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-8q4qwux69-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-g7cqw9cxg-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-my0vnqxks-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-b1ai8z78g-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-9nrmtmt7w-roldneicosta-4140.vercel.app" ||
       /^https:\/\/chalezinho-ville-[a-z0-9]{9}-roldneicosta-4140\.vercel\.app$/.test(origin) ||
       /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

    if(action==="identity_status"||action==="complete_identity"){
      const user=await currentUser(req);
      if(!user) return json({ok:false,error:"authentication_required"},401);
      if(!development) return json({ok:false,error:"not_available"},403);
      if(action==="identity_status"){
        const {data,error}=await admin.rpc("guest_identity_present",{p_user_id:user.id});
        if(error) return json({ok:false,error:"identity_check_unavailable"},500);
const {data:paymentIdentity,error:paymentIdentityError}=await admin.rpc("guest_payment_identity",{p_user_id:user.id});
        if(paymentIdentityError) return json({ok:false,error:"identity_check_unavailable"},500);
        const identity=Array.isArray(paymentIdentity)?paymentIdentity[0]:paymentIdentity;
        return json({ok:true,complete:Boolean(data),payment_eligible:identity?.document_type==="cpf"});
      }
      const {data,error}=await admin.rpc("register_guest_identity",{
        p_user_id:user.id,
        p_document_type:body.document_type,
        p_issuing_country:body.issuing_country,
        p_document_number:body.document_number
      });
      if(error){
        if(error.code==="23505") return json({ok:false,error:"identity_conflict"},409);
        if(String(error.message).includes("invalid_document")) return json({ok:false,error:"invalid_document"},400);
        return json({ok:false,error:"identity_registration_failed"},500);
      }
      return json({ok:true,complete:Boolean(data)});
    }
    if(action==="config"){
      const purposesQ=await retryDb("travel_purposes",()=>admin.from("travel_purposes").select("*").eq("active",true).order("display_order"));
      if(purposesQ.error) return json({ok:false,error:"config_unavailable"},500);

      const settingsQ=await retryDb("payment_settings",()=>admin.from("payment_settings").select("active_provider,pix_enabled,card_enabled,charge_percent,pix_expiration_minutes,max_card_installments,modification_payment_deadline_hours,post_booking_payment_minutes").eq("id",1).single());
      if(settingsQ.error) return json({ok:false,error:"config_unavailable"},500);

      const docsQ=await retryDb("policy_documents",()=>admin.from("policy_documents").select("id,document_type,code,version,title,body,status").in("status",development?["active","draft"]:["active"]).order("document_type"));
      if(docsQ.error) return json({ok:false,error:"config_unavailable"},500);

      const productsQ=await retryDb("experience_products",()=>admin.from("experience_products").select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,daily_capacity,inventory,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)").in("status",development?["active","draft"]:["active"]).order("display_order"));
      if(productsQ.error) return json({ok:false,error:"config_unavailable"},500);

      return json({
        ok:true,
        purposes:purposesQ.data||[],
        payment_settings:settingsQ.data||{},
        policy_documents:docsQ.data||[],
        required_booking_documents:bookingDocuments(docsQ.data||[],development),
        experience_products:productsQ.data||[],stay_offers:(await stayOffers.catalog()).offers,
        availability_coverage:{direct:true,airbnb:true,booking:true}
      });
    }
    if(action==="stay_offers"){const data=await stayOffers.catalog();return json({ok:true,offers:data.offers.map((o:any)=>({...o,issues_by_property:Object.fromEntries(o.property_ids.map((id:number)=>[id,offerIssues(o,data.products,id)])),packages:data.products.filter((p:any)=>o.product_ids.includes(p.id))}))})}
    if(action==="stay_offer_action")return await stayOffers.action(req,body,development);
    if(action==="legal_documents")return await legalDocuments(req,body,development);
    if(action==="property_media"){
      const {data,error}=await admin.from("properties").select("id,code,slug,name,tagline,summary,property_type,max_guests,cover_image,gallery,features").eq("active",true).order("id");
      if(error) return json({ok:false,error:"media_unavailable"},500);
      return json({ok:true,properties:(data||[]).map(publicProperty)});
    }
    if(action==="search"){
      const start=url.searchParams.get("start")||body.start;
      const end=url.searchParams.get("end")||body.end;
      const guests=Number(url.searchParams.get("guests")||body.guests||2);
      const listings=await searchData(start,end,guests,null,development);
      const offerId=body.stay_offer_id||url.searchParams.get("stay_offer_id");
      const catalog=offerId?await stayOffers.catalog():null;
      const listingOffers=await Promise.all(listings.map(async(x:any)=>{
        const {cleaning_fee,...rest}=x;
        if(!x.available)return {...rest,from_stay_price:null};
        const selected=catalog?.offers.find((o:any)=>o.id===offerId);
        const issues=offerId?selected?offerIssues(selected,catalog.products,x.id,{check_in:start,check_out:end}):["offer_unavailable"]:[];
        if(issues.length)return {...rest,offer_issues:issues,from_stay_price:null};
        let quote;try{quote=await createQuote({property_id:x.id,check_in:start,check_out:end,guests,stay_offer_id:offerId||undefined},development,null,null,listings)}catch(e){return {...rest,from_stay_price:null,offer_issues:[(e as Error).message]}};
        const available=quote.rate_options.filter((p:any)=>p.selectable);
        return {...rest,from_stay_price:Math.min(...available.map((p:any)=>p.total_amount_cents))/100,quote,offer_issues:[]};
      }));
      return json({ok:true,listings:listingOffers});
    }
    if(action==="same_day_request"){
      const user=await currentUser(req);if(!user)return json({ok:false,error:"authentication_required"},401);
      try{return json({ok:true,...await sameDayRequests(admin,body,user,await userIsAdmin(user),async(r:any)=>(await searchData(r.check_in,r.check_out,r.guests,null,development,true)).find((p:any)=>Number(p.id)===Number(r.property_id)))})}
      catch(e){return json({ok:false,error:(e as Error).message},409)}
    }
    if(action==="quote"){
      let approved=null;
      if(body.same_day_request_id){const user=await currentUser(req);if(!user)return json({ok:false,error:"authentication_required"},401);approved=await approvedSameDayRequest(admin,body.same_day_request_id,user.id,body)}
      return json(await createQuote(body,development,null,approved));
    }
    if(action==="reservation_incident"){
      const user=await currentUser(req);
      if(!development||!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      try{return json({ok:true,...await reservationIncident(admin,user.id,body)})}
      catch(e){const code=String((e as Error)?.message||"");
        const safe=["reservation_not_found","invalid_incident","verified_evidence_required","incident_not_found","incident_already_decided","invalid_incident_operation","idempotency_conflict"];
        return json({ok:false,error:safe.includes(code)?code:"incident_operation_failed"},409);}
    }
    if(action==="upsell_preview") return await upsellPreview(body);
    if(action==="apply_upsell") return await applyUpsell(body,development);
    if(action==="pagbank_sandbox_card_key"){
      if(!development) return json({ok:false,error:"not_allowed"},403);
      if(!await currentUser(req)) return json({ok:false,error:"authentication_required"},401);
      const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
      if(!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
      return json({ok:true,public_key:await getPagBankCardPublicKey(token)});
    }
    if(action==="pagbank_sandbox_status") return await sandboxPaymentStatus(req,body,development);
    if(action==="installment_options") return await installmentOptions(req,body,development);
    if(action==="start_payment") return await startPayment(req,body,development);
    if(action==="reservation_policy") return await reservationPolicy(req,body);
    if(action==="cancel_pending_payment") return await cancelPendingPayment(req,body,development);
    if(action==="mock_payment") return json({ok:false,error:"not_allowed"},403);
    if(action==="start_post_booking_payment") return await startPostBookingPayment(req,body,development);
    if(action==="confirm_free_post_booking_charge") return await confirmFreePostBookingCharge(req,body);
    if(action==="cancel_post_booking_charge") return await cancelPostBookingCharge(req,body);
    if(action==="request_modification") return await requestModification(req,body,development);
    if(action==="modification_action") return await modificationAction(req,body,development);
    if(action==="ops") return await opsData(req);
    if(action==="ops_settings_action") return await opsSettingsAction(req,body);
    if(action==="admin_cancellation_policy_action") return await adminCancellationPolicyAction(req,body,development);
    if(action==="reservation_finance"){
      const user=await currentUser(req);
      if(!development||!user)return json({ok:false,error:"authentication_required"},403);
      try{return json({ok:true,finance:await reservationFinance(admin,String(body.reservation_id||""),
        {userId:user.id,manager:await userIsAdmin(user)})})}
      catch(e){return json({ok:false,error:(e as Error).message==='reservation_not_found'?'reservation_not_found':'reservation_finance_unavailable'},409)}
    }
    if(action==="admin_guests"){
      const user=await currentUser(req);
      if(!development||!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      try{return json(await guestDirectory(admin,body,user.id,async()=>{
        const response=await adminHubData(req,{start:localDate(-365),end:localDate(730)});
        if(!response.ok)throw Error("guest_directory_unavailable");
        return (await response.json()).channel_periods||[];
      }))}catch(e){const code=e instanceof Error?e.message:"guest_directory_unavailable";return json({ok:false,error:code},code.includes("unavailable")?503:400)}
    }
    if(action==="admin_hub") return await adminHubData(req,body);
    if(action==="experience_credit") return await experienceCredit(req,body,development);
    if(action==="reservation_refund_action") return await reservationRefundAction(req,body,development);
    if(action==="reservation_refund_status") return await reservationRefundStatus(req,body,development);
    if(action==="reservation_cancel_request") return await reservationCancelRequest(req,body,development);
    if(action==="admin_reservation_action") return await adminReservationAction(req,body);
    if(action==="admin_notification_action") return await adminNotificationAction(req,body);
    if(action==="admin_availability") return await adminAvailabilityAction(req,body);
    if(action==="admin_property_action") return await adminPropertyAction(req,body);
    if(action==="guarantee_action") return await guaranteeAction(req,body);
    if(action==="experience_admin") return await experienceAdminData(req);
    if(action==="experience_admin_action") return await experienceAdminAction(req,body);
    if(action==="guest_experience_catalog") return await guestExperienceCatalog(req,body);
    if(action==="purchase_post_booking_experience") return await purchasePostBookingExperience(req,body,development);
    if(action==="checkout_experience_cart_item") return await checkoutExperienceCartItem(req,body);
    if(action==="remove_experience_cart_item") return await removeExperienceCartItem(req,body);
    if(action==="track_access"){
      if(!development)return json({ok:false,error:"not_available"},403);
      let input;try{input=accessInput(body)}catch{return json({ok:false,error:"invalid_access_event"},400)}
      let property_id=null;
      if(input.code){
        const p=await admin.from("properties").select("id").eq("code",input.code).maybeSingle();
        if(p.error)return json({ok:false,error:"analytics_unavailable"},503);
        if(!p.data)return json({ok:false,error:"property_not_found"},400);
        property_id=p.data.id;
      }
      const result=await admin.from("analytics_events").insert({event_name:"site_page_view",anonymous_id:input.session_id,property_id,metadata:{page:input.page}});
      return result.error?json({ok:false,error:"analytics_unavailable"},503):json({ok:true});
    }
    if(action==="admin_access_metrics"){
      const user=await currentUser(req);
      if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      if(![7,30,90].includes(body.days))return json({ok:false,error:"invalid_period"},400);
      try{return json({ok:true,...await accessReport(admin,body.days)})}
      catch{return json({ok:false,error:"analytics_unavailable"},503)}
    }
    if(action==="track") return await trackEvent(req,body);

    return json({ok:false,error:"unknown_action"},404);
  }catch(e){
    const msg=String((e as Error)?.message||"unexpected_error");
    const minMatch=/^minimum_stay:(\d+)$/.exec(msg);
    if(minMatch) return json({ok:false,error:"minimum_stay",min_stay:Number(minMatch[1])},400);
    if(msg==="booking_not_configured") return json({ok:false,error:"booking_not_configured"},503);
    const clientErrors=["same_day_approval_required","past_date","advance_notice","same_day_cutoff","availability_window","checkin_day","checkout_day","maximum_stay","invalid_dates","property_not_found","occupied","capacity","minimum_stay","rate_unavailable","experience_unavailable","experience_category_conflict","modification_already_open","upsell_not_available","offer_unavailable","offer_duration","offer_period","offer_property_incompatible","package_paused","package_lead_time","package_property_incompatible","package_unavailable","experience_component_conflict","invalid_experience_choice","experience_choice_required","experience_capacity","package_out_of_stock","package_components_required","experience_not_sold_separately"];
    return json({ok:false,error:msg},clientErrors.includes(msg)?400:500);
  }
});
