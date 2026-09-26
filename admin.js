(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const validViews=new Set(["today","calendar","reservations","notifications","changes","finance","guarantees","properties","settings"]);
const requestedView=new URLSearchParams(location.search).get("view");
let session=null,state=null,currentView=validViews.has(requestedView)?requestedView:"today",calendarMonth=new Date().toISOString().slice(0,7),filters={search:"",status:"all",property:"all"};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
const shortDate=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}):"—";
const dateTime=v=>v?new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const prop=id=>state?.properties.find(p=>Number(p.id)===Number(id));
const byReservation=(rows,id)=>rows.filter(x=>String(x.reservation_id)===String(id));
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando pagamento",hold:"Pagamento iniciado",cancelled:"Cancelada",not_confirmed:"Não confirmada",no_show:"Não compareceu",pending:"Pendente",paid:"Pago",refused:"Recusado",under_review:"Em análise",processing:"Processando",awaiting_payment:"Aguardando pagamento",expired:"Expirado",requested:"Solicitada",quoted:"Aguardando análise",rejected:"Recusada",payment_expired:"Pagamento não realizado",accepted:"Aceita",applied:"Aplicada",active:"Ativa",authorized:"Autorizada",released:"Liberada",captured:"Capturada",incident_reported:"Ocorrência registrada",capture_requested:"Captura solicitada",upgraded:"Substituído"}[s]||String(s||"—").replaceAll("_"," "));
const sourceLabel=s=>({direct:"Site",manual:"Manual",airbnb:"Airbnb",booking:"Booking.com"}[s]||s);
const statusClass=s=>["confirmed","paid","applied","checked_in","checked_out"].includes(s)?"is-success":["cancelled","not_confirmed","refused","expired","no_show"].includes(s)?"is-muted":["under_review","pending_payment","hold","awaiting_payment"].includes(s)?"is-warning":"";

async function api(action,body={}){
  const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...body})});
  const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));
  if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});
  return d;
}

async function boot(){
  const {data:{session:s}}=await sb.auth.getSession();session=s;
  if(!session){location.href="auth.html?mode=login&return=admin.html";return}
  const {data:p}=await sb.from("profiles").select("role,full_name").eq("id",session.user.id).single();
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
    state=await api("admin_hub",{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)});
    updateCounts();showView(currentView);
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
  const names={today:["OPERAÇÃO DE HOJE","Visão geral"],calendar:["AGENDA UNIFICADA","Calendário"],reservations:["TODAS AS ESTADIAS","Reservas"],notifications:["CENTRAL DE ATENÇÃO","Notificações"],changes:["PEDIDOS DOS HÓSPEDES","Alterações de reserva"],finance:["MOVIMENTAÇÃO","Financeiro"],guarantees:["PRÉ-AUTORIZAÇÕES","Garantias"],properties:["PORTFÓLIO","Imóveis"],settings:["REGRAS DA OPERAÇÃO","Configurações"]};
  $("#admin-context").textContent=names[view][0];$("#admin-title").textContent=names[view][1];
  ({today:renderToday,calendar:renderCalendar,reservations:renderReservations,notifications:renderNotifications,changes:renderChanges,finance:renderFinance,guarantees:renderGuarantees,properties:renderProperties,settings:renderSettings}[view]||renderToday)();
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
  unread.forEach(n=>rows.push(`<button class="admin-attention ${n.severity}" data-notification="${n.id}" data-reservation="${n.reservation_id||""}"><strong>${esc(n.title)}</strong><span>${esc(n.message||"")}</span><small>${dateTime(n.created_at)}</small></button>`));
  mods.slice(0,3).forEach(m=>rows.push(`<button class="admin-attention warning" data-reservation="${m.reservation_id}"><strong>Alteração aguardando análise</strong><span>${date(m.requested_check_in)} a ${date(m.requested_check_out)}</span></button>`));
  payments.slice(0,3).forEach(p=>rows.push(`<button class="admin-attention warning" data-reservation="${p.reservation_id}"><strong>Pagamento em análise</strong><span>${brl(p.amount_cents)}</span></button>`));
  return rows.length?rows.join(""):empty("Nenhuma pendência agora.");
}
function bindCards(){
  $$('[data-reservation]').forEach(b=>b.onclick=e=>{const id=b.dataset.reservation;if(id)openReservation(id);const nid=b.dataset.notification;if(nid)markNotification(nid)});
}

function monthBounds(value){const [y,m]=value.split("-").map(Number),start=`${y}-${String(m).padStart(2,"0")}-01`,endDate=new Date(Date.UTC(y,m,1)),end=endDate.toISOString().slice(0,10);return {y,m,start,end,days:new Date(Date.UTC(y,m,0)).getUTCDate()}}
function renderCalendar(){
  const b=monthBounds(calendarMonth),direct=state.reservations.filter(r=>["confirmed","pending_payment","hold"].includes(r.status)&&r.check_in<b.end&&r.check_out>b.start),external=state.channel_periods.filter(x=>x.start<b.end&&x.end>b.start);
  const dayHeads=Array.from({length:b.days},(_,i)=>{const d=new Date(Date.UTC(b.y,b.m-1,i+1));return `<span class="${d.toISOString().slice(0,10)===today()?"today":""}"><b>${i+1}</b><small>${d.toLocaleDateString("pt-BR",{weekday:"narrow",timeZone:"UTC"})}</small></span>`}).join("");
  $("#admin-content").innerHTML=`<section class="admin-panel calendar-panel"><div class="admin-calendar-toolbar"><div><button data-month-prev>‹</button><input id="calendar-month" type="month" value="${calendarMonth}"><button data-month-next>›</button><button data-month-today>Hoje</button></div><div class="calendar-legend"><span class="direct">Site</span><span class="airbnb">Airbnb</span><span class="booking">Booking</span><span class="pending">Pagamento</span></div></div>
    <div class="calendar-scroll"><div class="calendar-grid" style="--days:${b.days}"><div class="calendar-corner">Imóvel</div><div class="calendar-days">${dayHeads}</div>${state.properties.filter(p=>p.active).map(p=>calendarRow(p,b,direct,external)).join("")}</div></div>
    <div class="calendar-mobile-agenda">${[...direct.map(x=>({...x,start:x.check_in,end:x.check_out})),...external].sort((a,b)=>a.start.localeCompare(b.start)).map(x=>calendarAgendaItem(x)).join("")||empty("Nenhuma ocupação neste mês.")}</div></section>`;
  $("#calendar-month").onchange=e=>{calendarMonth=e.target.value;renderCalendar()};
  $("[data-month-prev]").onclick=()=>changeMonth(-1);$("[data-month-next]").onclick=()=>changeMonth(1);$("[data-month-today]").onclick=()=>{calendarMonth=today().slice(0,7);renderCalendar()};bindCards();
}
function changeMonth(delta){const [y,m]=calendarMonth.split("-").map(Number),d=new Date(Date.UTC(y,m-1+delta,1));calendarMonth=d.toISOString().slice(0,7);renderCalendar()}
function calendarRow(p,b,direct,external){
  const events=[...direct.filter(r=>Number(r.property_id)===Number(p.id)).map(r=>({...r,start:r.check_in,end:r.check_out,source:r.source||"direct"})),...external.filter(e=>Number(e.property_id)===Number(p.id))];
  const bars=events.map((e,i)=>{const start=Math.max(1,Math.floor((Date.parse(e.start)-Date.parse(b.start))/86400000)+1),finish=Math.min(b.days+1,Math.floor((Date.parse(e.end)-Date.parse(b.start))/86400000)+1),left=(start-1)/b.days*100,width=Math.max(2,(finish-start)/b.days*100);const label=e.guest_name||sourceLabel(e.source);const packages=e.id&&!String(e.id).includes(":")?byReservation(state.experience_orders,e.id).flatMap(o=>o.experience_order_items||[]).filter(x=>x.status==="active").length:0;return `<button class="calendar-event ${esc(e.source)} ${e.status==="pending_payment"||e.status==="hold"?"pending":""}" style="left:${left}%;width:${width}%;top:${8+(i%3)*30}px" ${e.id&&!String(e.id).includes(":")?`data-reservation="${e.id}"`:"disabled"} title="${esc(label)} · ${date(e.start)} a ${date(e.end)}"><strong>${esc(label)}</strong>${packages?`<em>+${packages} pacote${packages>1?"s":""}</em>`:""}</button>`}).join("");
  return `<div class="calendar-property"><strong>${esc(p.name)}</strong><small>${esc(p.code)}</small></div><div class="calendar-track">${Array.from({length:b.days},()=>"<i></i>").join("")}${bars}</div>`;
}
function calendarAgendaItem(e){const p=prop(e.property_id);return `<button class="calendar-agenda-item" ${e.id&&!String(e.id).includes(":")?`data-reservation="${e.id}"`:"disabled"}><span class="calendar-source ${esc(e.source)}">${esc(sourceLabel(e.source))}</span><div><strong>${esc(e.guest_name||p?.name||"Bloqueio externo")}</strong><small>${esc(p?.name||"")} · ${date(e.start||e.check_in)} a ${date(e.end||e.check_out)}</small></div></button>`}

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

function renderNotifications(){
  const rows=state.notifications;
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>AVISOS OPERACIONAIS</small><h2>O que precisa da sua atenção</h2></div><button id="mark-all-read">Marcar todas como lidas</button></div><div class="notification-list">${rows.length?rows.map(n=>`<button class="notification-row ${n.read_at?"read":"unread"} ${n.severity}" data-notification="${n.id}" data-reservation="${n.reservation_id||""}"><i></i><div><small>${esc(n.severity==="critical"?"URGENTE":n.severity==="warning"?"ATENÇÃO":"ATUALIZAÇÃO")}</small><strong>${esc(n.title)}</strong><p>${esc(n.message||"")}</p></div><time>${dateTime(n.created_at)}</time></button>`).join(""):empty("Nenhuma notificação registrada.")}</div></section>`;
  $("#mark-all-read").onclick=async()=>{await api("admin_notification_action",{operation:"mark_all_read"});state.notifications.forEach(n=>n.read_at=new Date().toISOString());updateCounts();renderNotifications()};bindCards();
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
function guaranteeCard(g){const r=state.reservations.find(x=>x.id===g.reservation_id);return `<article class="admin-operation-card"><div><small>${esc(r?.confirmation_code||"RESERVA")} · ${esc(prop(r?.property_id)?.name||"")}</small><h3>${esc(r?.guest_name||"Hóspede")}</h3><p>Garantia ${brl(g.amount_cents)} · capturado ${brl(g.captured_amount_cents)}</p><span class="admin-status ${statusClass(g.status)}">${statusLabel(g.status)}</span></div><button data-guarantee="${g.id}">Gerir garantia</button></article>`}
function openGuarantee(id){const g=state.guarantees.find(x=>x.id===id),remaining=Math.max(0,Number(g.amount_cents||0)-Number(g.captured_amount_cents||0));$("#admin-modal-content").innerHTML=`<small>GARANTIA DA HOSPEDAGEM</small><h2>${brl(g.amount_cents)}</h2><p>Disponível para eventual ocorrência: ${brl(remaining)}. Registrar uma ocorrência não captura o valor automaticamente.</p><form id="guarantee-form" class="admin-form"><label>Descrição da ocorrência<textarea name="description" rows="3" placeholder="Descreva o dano ou ocorrência"></textarea></label><label>Valor (R$)<input name="amount" type="number" min="0" max="${remaining/100}" step="0.01" value="0"></label><p class="admin-form-message"></p><div class="admin-card-actions"><button type="button" data-g-op="report_incident">Registrar ocorrência</button><button type="button" data-g-op="capture">Capturar valor</button><button type="button" data-g-op="release">Liberar garantia</button></div></form>`;openModal();$$('[data-g-op]').forEach(b=>b.onclick=()=>runGuaranteeAction(id,b.dataset.gOp))}
async function runGuaranteeAction(id,operation){const f=$("#guarantee-form"),m=f.querySelector(".admin-form-message");m.textContent="Processando…";try{await api("guarantee_action",{guarantee_id:id,operation,amount_cents:Math.round(Number(f.amount.value||0)*100),description:f.description.value});closeModal();await load(true);renderGuarantees()}catch(err){m.textContent=({incident_required:"Registre a ocorrência antes de capturar.",capture_exceeds_guarantee:"O valor supera o saldo disponível.",active_incident:"Resolva a ocorrência antes de liberar."})[err.message]||"Não foi possível concluir a ação."}}

function renderSettings(){
  const s=state.settings||{},health=state.channel_health||{};
  $("#admin-content").innerHTML=`<div class="admin-two-col"><section class="admin-panel"><div class="admin-panel-head"><div><small>PAGAMENTOS</small><h2>Regras comerciais</h2></div></div><form id="admin-payment-settings" class="admin-form"><label>Máximo de parcelas no cartão<input name="max_card_installments" type="number" min="1" max="24" value="${Number(s.max_card_installments||1)}"></label><label>Validade do Pix (minutos)<input name="pix_expiration_minutes" type="number" min="5" max="1440" value="${Number(s.pix_expiration_minutes||15)}"></label><label>Prazo de pagamento de experiências (minutos)<input name="post_booking_payment_minutes" type="number" min="5" max="1440" value="${Number(s.post_booking_payment_minutes||15)}"></label><label>Prazo de alteração aprovada (horas)<input name="modification_payment_deadline_hours" type="number" min="1" max="168" value="${Number(s.modification_payment_deadline_hours||24)}"></label><p class="admin-form-message"></p><button class="admin-primary">Salvar regras</button></form></section><section class="admin-panel"><div class="admin-panel-head"><div><small>CANAIS</small><h2>Integrações</h2></div></div><div class="integration-health"><article class="${health.airbnb?"is-success":"is-warning"}"><strong>Airbnb</strong><span>${health.airbnb?"Calendários sincronizados":"Sincronização indisponível"}</span></article><article class="${health.booking?"is-success":"is-warning"}"><strong>Booking.com</strong><span>${health.booking?"Calendários sincronizados":health.booking_configured?"Sincronização indisponível":"Configuração pendente"}</span></article>${state.integrations.map(i=>`<article><strong>${esc(sourceLabel(i.provider))} · ${esc(prop(i.property_id)?.name||"")}</strong><span>${i.active?"Ativa":"Pausada"}</span></article>`).join("")}</div></section></div>`;
  $("#admin-payment-settings").onsubmit=saveSettings;
}
async function saveSettings(e){e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando…";try{const d=await api("ops_settings_action",{operation:"payment_settings",max_card_installments:Number(f.max_card_installments.value),pix_expiration_minutes:Number(f.pix_expiration_minutes.value),post_booking_payment_minutes:Number(f.post_booking_payment_minutes.value),modification_payment_deadline_hours:Number(f.modification_payment_deadline_hours.value)});state.settings=d.settings;m.textContent="Regras atualizadas."}catch{m.textContent="Não foi possível salvar."}finally{b.disabled=false}}

function renderProperties(){
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>PORTFÓLIO</small><h2>Imóveis</h2></div><button id="new-property">+ Novo imóvel</button></div><div class="property-admin-grid">${state.properties.map(p=>`<button class="property-admin-card ${p.active?"":"inactive"}" data-property-edit="${p.id}"><small>${esc(p.code)}</small><h3>${esc(p.name)}</h3><p>${esc(p.property_type)} · até ${p.max_guests} hóspedes</p><span>Check-in ${esc((p.check_in_time||"15:00").slice(0,5))} · Checkout ${esc((p.check_out_time||"11:00").slice(0,5))}</span><em>${p.active?"Ativo":"Pausado"}</em></button>`).join("")}</div></section>`;
  $("#new-property").onclick=()=>openProperty(null);$$('[data-property-edit]').forEach(b=>b.onclick=()=>openProperty(Number(b.dataset.propertyEdit)));
}
function openProperty(id){const p=id?state.properties.find(x=>Number(x.id)===Number(id)):null;$("#admin-modal-content").innerHTML=`<small>IMÓVEL</small><h2>${p?"Editar imóvel":"Cadastrar novo imóvel"}</h2><form id="property-form" class="admin-form"><input type="hidden" name="id" value="${p?.id||""}"><div class="admin-form-grid"><label>Nome<input name="name" required value="${esc(p?.name||"")}" placeholder="Ex.: Ville Signature"></label><label>Código interno<input name="code" required value="${esc(p?.code||"")}" placeholder="Ex.: CH1"></label><label>Endereço da página<input name="slug" required value="${esc(p?.slug||"")}" placeholder="ville-signature"></label><label>Tipo<select name="property_type">${[["chalet","Chalé"],["apartment","Apartamento"],["house","Casa"],["cabin","Cabana"],["other","Outro"]].map(([v,l])=>`<option value="${v}" ${p?.property_type===v?"selected":""}>${l}</option>`).join("")}</select></label><label>Máximo de hóspedes<input name="max_guests" type="number" min="1" max="50" value="${p?.max_guests||2}"></label><label>Taxa de limpeza (R$)<input name="cleaning_fee" type="number" min="0" step="0.01" value="${Number(p?.cleaning_fee||0)}"></label><label>Garantia (R$)<input name="guarantee_amount" type="number" min="0" step="0.01" value="${Number(p?.guarantee_amount_cents||0)/100}"></label><label>Horário de check-in<input name="check_in_time" type="time" value="${esc((p?.check_in_time||"15:00").slice(0,5))}"></label><label>Horário de checkout<input name="check_out_time" type="time" value="${esc((p?.check_out_time||"11:00").slice(0,5))}"></label></div><label>Chamada curta<input name="tagline" value="${esc(p?.tagline||"")}" placeholder="Como o imóvel será apresentado"></label><label>Descrição<textarea name="summary" rows="4">${esc(p?.summary||"")}</textarea></label><label class="admin-checkbox"><input name="active" type="checkbox" ${p?.active!==false?"checked":""}> Imóvel ativo para novas reservas</label><p class="admin-form-message"></p><button class="admin-primary">Salvar imóvel</button></form>`;openModal();$("#property-form").onsubmit=saveProperty}
async function saveProperty(e){e.preventDefault();const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando…";try{await api("admin_property_action",{operation:"save",id:x.id.value||null,name:x.name.value,code:x.code.value,slug:x.slug.value,property_type:x.property_type.value,max_guests:Number(x.max_guests.value),cleaning_fee:Number(x.cleaning_fee.value),guarantee_amount_cents:Math.round(Number(x.guarantee_amount.value||0)*100),check_in_time:x.check_in_time.value,check_out_time:x.check_out_time.value,tagline:x.tagline.value,summary:x.summary.value,active:x.active.checked});closeModal();await load(true)}catch(err){m.textContent="Não foi possível salvar. Verifique se código e endereço já não estão em uso."}finally{b.disabled=false}}

function openManualReservation(){
  const t=today();$("#admin-modal-content").innerHTML=`<small>NOVA RESERVA</small><h2>Adicionar reserva manual</h2><p>Use para reservas feitas fora do site. A disponibilidade será conferida em todos os calendários antes de salvar.</p><form id="manual-reservation-form" class="admin-form"><div class="admin-form-grid"><label>Imóvel<select name="property_id" required>${state.properties.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Hóspedes<input name="guests" type="number" min="1" value="2" required></label><label>Check-in<input name="check_in" type="date" min="${t}" required></label><label>Checkout<input name="check_out" type="date" min="${t}" required></label><label>Nome do hóspede<input name="guest_name" required></label><label>Telefone<input name="guest_phone" inputmode="tel"></label><label>E-mail<input name="guest_email" type="email"></label><label>Total combinado (R$)<input name="total_amount" type="number" min="0" step="0.01" value="0"></label></div><p class="admin-form-message"></p><button class="admin-primary">Salvar reserva</button></form>`;openModal();$("#manual-reservation-form").onsubmit=saveManualReservation;
}
async function saveManualReservation(e){e.preventDefault();const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Conferindo disponibilidade…";try{await api("admin_reservation_action",{operation:"create_manual",property_id:Number(x.property_id.value),guests:Number(x.guests.value),check_in:x.check_in.value,check_out:x.check_out.value,guest_name:x.guest_name.value,guest_phone:x.guest_phone.value,guest_email:x.guest_email.value,total_amount:Number(x.total_amount.value||0)});closeModal();await load(true);renderReservations()}catch(err){m.textContent=err.message==="occupied"?"Essas datas já estão ocupadas em um dos calendários.":err.message==="capacity"?"A quantidade de hóspedes ultrapassa a capacidade do imóvel.":"Não foi possível criar a reserva."}finally{b.disabled=false}}

function openReservation(id){
  const r=state.reservations.find(x=>x.id===id);if(!r)return;const p=prop(r.property_id),payments=byReservation(state.payments,id),orders=byReservation(state.experience_orders,id),charges=byReservation(state.charges,id),mods=byReservation(state.modifications,id),guarantees=byReservation(state.guarantees,id),notes=byReservation(state.notes,id);const items=orders.flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  $("#reservation-detail").innerHTML=`<small>${esc(r.confirmation_code||sourceLabel(r.source))}</small><h2 id="drawer-title">${esc(r.guest_name||"Hóspede")}</h2><div class="drawer-status"><span class="admin-status ${statusClass(r.status)}">${statusLabel(r.status)}</span><span>${esc(sourceLabel(r.source))}</span></div>
  <section class="drawer-block"><h3>Estadia</h3><div class="drawer-dates"><div><small>CHECK-IN</small><strong>${date(r.check_in)}</strong><span>${esc((p?.check_in_time||"15:00").slice(0,5))}</span></div><div><small>CHECKOUT</small><strong>${date(r.check_out)}</strong><span>${esc((p?.check_out_time||"11:00").slice(0,5))}</span></div></div><p><strong>${esc(p?.name||"Imóvel")}</strong> · ${r.guests} hóspede${r.guests===1?"":"s"}</p></section>
  <section class="drawer-block"><h3>Contato</h3><p>${esc(r.guest_email||"E-mail não informado")}<br>${esc(r.guest_phone||"Telefone não informado")}</p></section>
  <section class="drawer-block"><h3>Experiências</h3>${items.length?items.map(i=>`<div class="drawer-line"><span>${esc(i.product_name_snapshot)}${i.variant_name_snapshot?" · "+esc(i.variant_name_snapshot):""}</span><strong>${brl(Number(i.unit_price_cents)*Number(i.quantity||1))}</strong></div>`).join(""):empty("Nenhuma experiência ativa.")}${charges.filter(c=>c.status==="awaiting_payment").map(c=>`<div class="drawer-alert">Pagamento pendente: ${esc(c.description||c.kind)} · ${brl(c.amount_cents)}</div>`).join("")}</section>
  <section class="drawer-block"><h3>Pagamento</h3>${payments.length?payments.map(x=>`<div class="drawer-line"><span>${statusLabel(x.status)} · ${esc(x.method||x.provider)}</span><strong>${brl(x.amount_cents)}</strong></div>`).join(""):empty("Nenhum pagamento registrado.")}<div class="drawer-total"><span>Total da reserva</span><strong>${brl(Math.round(Number(r.total_amount||0)*100))}</strong></div></section>
  ${mods.length?`<section class="drawer-block"><h3>Alterações</h3>${mods.map(m=>`<div class="drawer-line"><span>${statusLabel(m.status)} · ${date(m.requested_check_in)} a ${date(m.requested_check_out)}</span><strong>${brl(m.admin_additional_amount_cents||0)}</strong></div>`).join("")}</section>`:""}
  ${guarantees.length?`<section class="drawer-block"><h3>Garantia</h3>${guarantees.map(g=>`<div class="drawer-line"><span>${statusLabel(g.status)}</span><strong>${brl(g.amount_cents)}</strong></div>`).join("")}</section>`:""}
  <section class="drawer-block"><h3>Histórico interno</h3><div class="drawer-notes">${notes.length?notes.map(n=>`<p>${esc(n.note)}<small>${dateTime(n.created_at)}</small></p>`).join(""):empty("Nenhuma anotação interna.")}</div><form id="reservation-note-form" class="drawer-note-form"><textarea name="note" rows="2" placeholder="Escreva uma observação para a equipe"></textarea><button>Adicionar</button></form></section>
  <section class="drawer-actions"><button data-checkin ${r.status!=="confirmed"||r.operational_status==="checked_in"?"disabled":""}>Registrar check-in</button><button data-checkout ${r.status!=="confirmed"||r.operational_status==="checked_out"?"disabled":""}>Registrar checkout</button>${r.status==="confirmed"?'<button class="danger" data-cancel-reservation>Cancelar reserva</button>':""}</section>`;
  $("#reservation-drawer").hidden=false;document.body.classList.add("drawer-open");
  $("#reservation-note-form").onsubmit=e=>addNote(e,r.id);const ci=$("[data-checkin]"),co=$("[data-checkout]"),ca=$("[data-cancel-reservation]");if(ci)ci.onclick=()=>reservationAction(r.id,"check_in");if(co)co.onclick=()=>reservationAction(r.id,"check_out");if(ca)ca.onclick=()=>cancelReservation(r.id);
}
async function addNote(e,id){e.preventDefault();const f=e.currentTarget,n=f.note.value.trim();if(!n)return;await api("admin_reservation_action",{operation:"add_note",reservation_id:id,note:n});await load(true);openReservation(id)}
async function reservationAction(id,operation){await api("admin_reservation_action",{operation,reservation_id:id});await load(true);openReservation(id)}
function cancelReservation(id){$("#admin-modal-content").innerHTML=`<small>CANCELAMENTO</small><h2>Cancelar reserva confirmada</h2><p>As datas serão liberadas. Esta ação não cria reembolso automático.</p><form id="cancel-form" class="admin-form"><label>Motivo<textarea name="reason" rows="4" required placeholder="Explique o motivo do cancelamento"></textarea></label><p class="admin-form-message"></p><button class="admin-danger">Confirmar cancelamento</button></form>`;openModal();$("#cancel-form").onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,m=f.querySelector(".admin-form-message");try{await api("admin_reservation_action",{operation:"cancel",reservation_id:id,reason:f.reason.value});closeModal();closeDrawer();await load(true)}catch(err){m.textContent="Não foi possível cancelar esta reserva."}}}
function closeDrawer(){$("#reservation-drawer").hidden=true;document.body.classList.remove("drawer-open")}
function openModal(){$("#admin-modal").hidden=false;document.body.classList.add("drawer-open")}
function closeModal(){$("#admin-modal").hidden=true;if($("#reservation-drawer").hidden)document.body.classList.remove("drawer-open")}
boot();
})();
