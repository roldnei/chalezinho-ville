(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const validViews=new Set(["today","calendar","reservations","notifications","changes","finance","properties","settings"]);
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
const sourceLabel=s=>({direct:"Site",manual:"Manual",airbnb:"Airbnb",booking:"Booking.com",operational:"Bloqueio operacional"}[s]||s);
const statusClass=s=>["confirmed","paid","applied","checked_in","checked_out"].includes(s)?"is-success":["cancelled","not_confirmed","refused","expired","no_show"].includes(s)?"is-muted":["under_review","pending_payment","hold","awaiting_payment"].includes(s)?"is-warning":"";

async function api(action,body={}){
  const endpoint=["authorize","status","report_incident","decide_incident","attach_incident_evidence","capture","release","refund"].includes(action)&&body.guarantee_id?C.guaranteeEngine:["reservation_refund_action","reservation_cancel_request"].includes(action)?C.refundEngine:ENGINE;
  const r=await fetch(endpoint+"?action="+action,{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...body})});
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
    const [hub,cancelRequestsResult]=await Promise.all([
      api("admin_hub",{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}),
      api("reservation_cancel_request",{operation:"list"}).then(value=>({value}),error=>({error}))
    ]);
    state={...hub,cancel_requests:cancelRequestsResult.value?.requests||[]};
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
  const names={today:["OPERAÇÃO DE HOJE","Visão geral"],calendar:["AGENDA UNIFICADA","Calendário"],reservations:["TODAS AS ESTADIAS","Reservas"],notifications:["CENTRAL DE ATENÇÃO","Notificações"],changes:["PEDIDOS DOS HÓSPEDES","Alterações de reserva"],finance:["MOVIMENTAÇÃO","Financeiro"],properties:["PORTFÓLIO","Imóveis"],settings:["REGRAS DA OPERAÇÃO","Configurações"]};
  $("#admin-context").textContent=names[view][0];$("#admin-title").textContent=names[view][1];
  ({today:renderToday,calendar:renderCalendar,reservations:renderReservations,notifications:renderNotifications,changes:renderChanges,finance:renderFinance,properties:renderProperties,settings:renderSettings}[view]||renderToday)();
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
  const b=monthBounds(calendarMonth),direct=state.reservations.filter(r=>["confirmed","pending_payment","hold"].includes(r.status)&&r.check_in<b.end&&r.check_out>b.start),manual=(state.calendar_blocks||[]).filter(x=>x.status==="active"&&x.start_date<b.end&&x.end_date>b.start).map(x=>({...x,id:`block:${x.id}`,source:"operational",start:x.start_date,end:x.end_date,guest_name:x.reason,status:"blocked"})),external=[...state.channel_periods.filter(x=>x.start<b.end&&x.end>b.start),...manual];
  const dayHeads=Array.from({length:b.days},(_,i)=>{const d=new Date(Date.UTC(b.y,b.m-1,i+1));return `<span class="${d.toISOString().slice(0,10)===today()?"today":""}"><b>${i+1}</b><small>${d.toLocaleDateString("pt-BR",{weekday:"narrow",timeZone:"UTC"})}</small></span>`}).join("");
  $("#admin-content").innerHTML=`<section class="admin-panel calendar-panel"><div class="admin-calendar-toolbar"><div><button data-month-prev>‹</button><input id="calendar-month" type="month" value="${calendarMonth}"><button data-month-next>›</button><button data-month-today>Hoje</button></div><div class="calendar-legend"><span class="direct">Site</span><span class="airbnb">Airbnb</span><span class="booking">Booking</span><span class="operational">Operação</span><span class="pending">Pagamento</span></div></div>
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
function guaranteeCard(g){const r=state.reservations.find(x=>x.id===g.reservation_id),verified=g.provider==="pagbank_sandbox"&&!!g.provider_authorization_id;return `<article class="admin-operation-card"><div><small>${esc(r?.confirmation_code||"RESERVA")} · ${esc(prop(r?.property_id)?.name||"")}</small><h3>${esc(r?.guest_name||"Hóspede")}</h3><p>${verified?"Pré-autorização PagBank":"Caução sem pré-autorização confirmada"} · ${brl(g.amount_cents)}</p><span class="admin-status ${statusClass(g.status)}">${verified?statusLabel(g.financial?.status||g.status):"Não autorizada no PagBank"}</span></div><button data-guarantee="${g.id}">Ver garantia</button></article>`}
function openGuarantee(id){
 const g=state.guarantees.find(x=>x.id===id);if(!g)return;
 const r=state.reservations.find(x=>x.id===g.reservation_id), captured=Number(g.captured_amount_cents||0),refunded=Number(g.refunded_amount_cents||0);
 const active=["guaranteed","incident_reported"].includes(g.status),pending=(g.incidents||[]).filter(i=>i.decision==="pending"), approved=(g.incidents||[]).find(i=>i.decision==="approved"&&i.status==="open");
 const categories={damage:"Dano",broken_item:"Item quebrado",missing_item:"Item desaparecido",extra_cleaning:"Limpeza extraordinária",penalty:"Multa",other:"Outra ocorrência"};
 $("#admin-modal-content").innerHTML=`<small>GARANTIA · ${esc(r?.confirmation_code||"RESERVA")}</small><h2>Caução da reserva</h2><p>${esc(r?.guest_name||"Hóspede")} · ${esc(prop(r?.property_id)?.name||"")} · ${date(r?.check_in)} a ${date(r?.check_out)}</p>
 <dl class="reservation-finance-values"><dt>Valor exigido</dt><dd>${brl(g.amount_cents)}</dd><dt>Capturado por danos</dt><dd>${brl(captured)}</dd><dt>Estornado</dt><dd>${brl(refunded)}</dd><dt>Disponível para captura</dt><dd>${brl(active?Number(g.amount_cents)-captured:0)}</dd><dt>Liberação confirmada</dt><dd>${g.release_confirmed||g.status==="released"?brl(g.status==="released"?g.amount_cents:g.released_amount_cents):"Aguardando comprovação do provedor"}</dd></dl>
 <p>Estado: ${esc(statusLabel(g.financial?.status||g.status))}. ${g.provider_capture_before?`Validade: ${dateTime(g.provider_capture_before)}.`:""}</p>
 <h3>Ocorrências</h3>${(g.incidents||[]).map(i=>`<article><p>${esc(categories[i.category]||"Ocorrência")} · ${esc(i.description)} · ${brl(i.requested_capture_cents)}</p><p>${esc(i.decision||i.status)} · ${dateTime(i.created_at)}</p>${i.decision==="pending"&&i.status==="open"?`<button type="button" data-incident="${i.id}" data-decision="approved" ${active?"":"disabled"}>Aprovar cobrança</button><button type="button" data-incident="${i.id}" data-decision="no_charge">Encerrar sem cobrança</button><button type="button" data-attach-incident="${i.id}">Adicionar comprovantes</button>`:""}${(i.evidence||[]).map(e=>`<button type="button" data-evidence="${esc(e.path)}">Abrir ${esc(e.name||"comprovante")}</button>`).join("")}</article>`).join("")||"<p>Nenhuma ocorrência.</p>"}
 <form id="guarantee-form" class="admin-form"><h3>Nova ocorrência</h3><label>Categoria<select name="category">${Object.entries(categories).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></label><label>Descrição<input name="description" placeholder="Descreva o ocorrido" minlength="5"></label><label>Valor proposto (R$)<input name="amount" type="number" min="0" step="0.01" value="0"></label><label>Fotos<input name="damage_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label>Recibo<input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><p>Registrar uma ocorrência não cobra o hóspede. A cobrança exige decisão e comprovantes.</p><p class="admin-form-message" role="status"></p><div class="drawer-actions"><button type="button" data-guarantee-action="report_incident">Registrar ocorrência</button>${approved&&g.status==="incident_reported"?`<button type="button" data-guarantee-action="capture" data-capture-cents="${approved.requested_capture_cents}">Cobrar ${brl(approved.requested_capture_cents)}</button>`:""}${g.status==="guaranteed"?'<button type="button" data-guarantee-action="release">Liberar caução</button>':""}<button type="button" data-guarantee-action="status">Consultar PagBank</button></div>
 ${captured>refunded?`<h3>Estornar cobrança de dano</h3><label>Valor a devolver (R$)<input name="refund_amount" type="number" min="0.01" max="${(captured-refunded)/100}" step="0.01"></label><label>Justificativa<input name="refund_reason" minlength="5"></label><button type="button" data-guarantee-action="refund">Solicitar estorno</button>`:""}</form>`;
 openModal();const f=$("#guarantee-form");f.dataset.operationKey=crypto.randomUUID();
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
  const result=await api(operation,{guarantee_id:id,incident_id:f.dataset.incidentId,operation_key:f.dataset.operationKey,
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
  $("#admin-content").innerHTML=`<section class="admin-panel"><div class="admin-panel-head"><div><small>PORTFÓLIO</small><h2>Imóveis</h2></div><button id="new-property">+ Novo imóvel</button></div><div class="property-admin-grid">${state.properties.map(p=>`<button class="property-admin-card ${p.active?"":"inactive"}" data-property-edit="${p.id}"><small>${esc(p.code)}</small><h3>${esc(p.name)}</h3><p>${esc(p.property_type)} · até ${p.max_guests} hóspedes</p><span>Check-in ${esc((p.check_in_time||"15:00").slice(0,5))} · Checkout ${esc((p.check_out_time||"11:00").slice(0,5))}</span><em>${p.active?"Ativo":"Pausado"}</em></button>`).join("")}</div></section>`;
  $("#new-property").onclick=()=>openProperty(null);$$('[data-property-edit]').forEach(b=>b.onclick=()=>openProperty(Number(b.dataset.propertyEdit)));
}
function openProperty(id){const p=id?state.properties.find(x=>Number(x.id)===Number(id)):null;$("#admin-modal-content").innerHTML=`<small>IMÓVEL</small><h2>${p?"Editar imóvel":"Cadastrar novo imóvel"}</h2><form id="property-form" class="admin-form"><input type="hidden" name="id" value="${p?.id||""}"><div class="admin-form-grid"><label>Nome<input name="name" required value="${esc(p?.name||"")}" placeholder="Ex.: Ville Signature"></label><label>Código interno<input name="code" required value="${esc(p?.code||"")}" placeholder="Ex.: CH1"></label><label>Endereço da página<input name="slug" required value="${esc(p?.slug||"")}" placeholder="ville-signature"></label><label>Tipo<select name="property_type">${[["chalet","Chalé"],["apartment","Apartamento"],["house","Casa"],["cabin","Cabana"],["other","Outro"]].map(([v,l])=>`<option value="${v}" ${p?.property_type===v?"selected":""}>${l}</option>`).join("")}</select></label><label>Máximo de hóspedes<input name="max_guests" type="number" min="1" max="50" value="${p?.max_guests||2}"></label><label>Taxa de limpeza (R$)<input name="cleaning_fee" type="number" min="0" step="0.01" value="${Number(p?.cleaning_fee||0)}"></label><label>Garantia (R$)<input name="guarantee_amount" type="number" min="0" step="0.01" value="${Number(p?.guarantee_amount_cents||0)/100}"></label><label>Até parcelas no cartão<input name="max_installments" type="number" min="1" max="12" required value="${Number(p?.features?.payment_terms?.max_installments??12)}"></label><label>Parcelas sem juros para hóspede<input name="no_interest_installments" type="number" min="0" max="12" required value="${Number(p?.features?.payment_terms?.no_interest_installments??6)}"></label><label>Juros após as parcelas gratuitas<select name="interest_payer"><option value="guest" ${p?.features?.payment_terms?.interest_payer!=="merchant"?"selected":""}>Por conta do hóspede</option><option value="merchant" ${p?.features?.payment_terms?.interest_payer==="merchant"?"selected":""}>Por conta do estabelecimento</option></select></label><label>Horário de check-in<input name="check_in_time" type="time" value="${esc((p?.check_in_time||"15:00").slice(0,5))}"></label><label>Horário de checkout<input name="check_out_time" type="time" value="${esc((p?.check_out_time||"11:00").slice(0,5))}"></label></div><label>Chamada curta<input name="tagline" value="${esc(p?.tagline||"")}" placeholder="Como o imóvel será apresentado"></label><label>Descrição<textarea name="summary" rows="4">${esc(p?.summary||"")}</textarea></label><section class="property-media-editor"><h3>Fotos do imóvel</h3><p>Envie até 40 imagens. Escolha a capa e ajuste a ordem com as setas. JPG, PNG, WebP ou AVIF, até 5 MB por imagem.</p><input id="property-media-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><div id="property-media-list" class="property-media-list"></div><p id="property-media-message" role="status"></p></section><label class="admin-checkbox"><input name="active" type="checkbox" ${p?.active!==false?"checked":""}> Imóvel ativo para novas reservas</label><p class="admin-form-message"></p><button class="admin-primary">Salvar imóvel</button></form>`;openModal();
  propertyGallery=(Array.isArray(p?.gallery)?p.gallery:[]).map(item=>typeof item==="string"?{url:item,alt:""}:item).filter(item=>item?.url);
  propertyCover=p?.cover_image||propertyGallery[0]?.url||"";
  if(propertyCover&&!propertyGallery.some(item=>item.url===propertyCover)) propertyGallery.unshift({url:propertyCover,alt:""});
  renderPropertyMedia();$("#property-media-files").onchange=uploadPropertyMedia;
  $("#property-form").onsubmit=saveProperty}
function renderPropertyMedia(){
  const list=$("#property-media-list");list.replaceChildren();
  propertyGallery.forEach((item,i)=>{
    const row=document.createElement("div");row.className="property-media-row";
    const img=document.createElement("img");img.src=item.url;img.alt=item.alt||"Foto do imóvel";img.loading="lazy";row.append(img);
    const controls=document.createElement("div");
    const alt=document.createElement("input");alt.type="text";alt.maxLength=180;alt.placeholder="Descreva a foto para acessibilidade";alt.value=item.alt||"";alt.setAttribute("aria-label","Descrição da foto "+(i+1));alt.oninput=()=>item.alt=alt.value;controls.append(alt);
    [["Capa",()=>{propertyCover=item.url;renderPropertyMedia()}],["↑",()=>move(i,-1)],["↓",()=>move(i,1)],["Remover",()=>{propertyGallery.splice(i,1);if(propertyCover===item.url)propertyCover=propertyGallery[0]?.url||"";renderPropertyMedia()}]].forEach(([label,action])=>{const button=document.createElement("button");button.type="button";button.textContent=label;button.onclick=action;if(label==="Capa"&&propertyCover===item.url){button.textContent="✓ Capa";button.setAttribute("aria-pressed","true")}controls.append(button)});
    row.append(controls);list.append(row);
  });
}
function move(i,delta){const next=i+delta;if(next<0||next>=propertyGallery.length)return;[propertyGallery[i],propertyGallery[next]]=[propertyGallery[next],propertyGallery[i]];renderPropertyMedia()}
async function uploadPropertyMedia(e){
  const files=[...e.target.files],status=$("#property-media-message"),input=e.target;
  if(propertyGallery.length+files.length>40){status.textContent="O limite é de 40 fotos por imóvel.";input.value="";return}
  input.disabled=true;
  for(const file of files){
    if(!["image/jpeg","image/png","image/webp","image/avif"].includes(file.type)||file.size>5242880){status.textContent=`${file.name}: formato inválido ou acima de 5 MB.`;continue}
    status.textContent=`Enviando ${file.name}…`;
    const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"}[file.type];
    const path=`${session.user.id}/${crypto.randomUUID()}.${extension}`;
    const {error}=await sb.storage.from("property-media").upload(path,file,{contentType:file.type,upsert:false});
    if(error){status.textContent=`Falha ao enviar ${file.name}: ${error.message}`;continue}
    const {data}=sb.storage.from("property-media").getPublicUrl(path);
    propertyGallery.push({url:data.publicUrl,alt:file.name.replace(/\.[^.]+$/,"").replace(/[-_]/g," ")});
    if(!propertyCover)propertyCover=data.publicUrl;
    renderPropertyMedia();status.textContent=`${propertyGallery.length} foto(s) prontas. Salve o imóvel para publicar a galeria.`;
  }
  input.disabled=false;input.value="";
}
async function saveProperty(e){e.preventDefault();const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Salvando…";try{await api("admin_property_action",{operation:"save",id:x.id.value||null,name:x.name.value,code:x.code.value,slug:x.slug.value,property_type:x.property_type.value,max_guests:Number(x.max_guests.value),cleaning_fee:Number(x.cleaning_fee.value),guarantee_amount_cents:Math.round(Number(x.guarantee_amount.value||0)*100),max_installments:Number(x.max_installments.value),no_interest_installments:Number(x.no_interest_installments.value),interest_payer:x.interest_payer.value,check_in_time:x.check_in_time.value,check_out_time:x.check_out_time.value,tagline:x.tagline.value,summary:x.summary.value,cover_image:propertyCover,gallery:propertyGallery,active:x.active.checked});closeModal();await load(true)}catch(err){m.textContent="Não foi possível salvar. Verifique se código e endereço já não estão em uso."}finally{b.disabled=false}}

function openManualReservation(){
  const t=today();$("#admin-modal-content").innerHTML=`<small>NOVA RESERVA</small><h2>Adicionar reserva manual</h2><p>Use para reservas feitas fora do site. A disponibilidade será conferida em todos os calendários antes de salvar.</p><form id="manual-reservation-form" class="admin-form"><div class="admin-form-grid"><label>Imóvel<select name="property_id" required>${state.properties.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Hóspedes<input name="guests" type="number" min="1" value="2" required></label><label>Check-in<input name="check_in" type="date" min="${t}" required></label><label>Checkout<input name="check_out" type="date" min="${t}" required></label><label>Nome do hóspede<input name="guest_name" required></label><label>Telefone<input name="guest_phone" inputmode="tel"></label><label>E-mail<input name="guest_email" type="email"></label><label>Total combinado (R$)<input name="total_amount" type="number" min="0" step="0.01" value="0"></label></div><p class="admin-form-message"></p><button class="admin-primary">Salvar reserva</button></form>`;openModal();$("#manual-reservation-form").onsubmit=saveManualReservation;
}
async function saveManualReservation(e){e.preventDefault();const f=e.currentTarget,x=f.elements,m=f.querySelector(".admin-form-message"),b=f.querySelector("button");b.disabled=true;m.textContent="Conferindo disponibilidade…";try{await api("admin_reservation_action",{operation:"create_manual",property_id:Number(x.property_id.value),guests:Number(x.guests.value),check_in:x.check_in.value,check_out:x.check_out.value,guest_name:x.guest_name.value,guest_phone:x.guest_phone.value,guest_email:x.guest_email.value,total_amount:Number(x.total_amount.value||0)});closeModal();await load(true);renderReservations()}catch(err){m.textContent=err.message==="occupied"?"Essas datas já estão ocupadas em um dos calendários.":err.message==="capacity"?"A quantidade de hóspedes ultrapassa a capacidade do imóvel.":"Não foi possível criar a reserva."}finally{b.disabled=false}}

function openReservation(id){
  const r=state.reservations.find(x=>x.id===id);if(!r)return;const p=prop(r.property_id),payments=byReservation(state.payments,id),orders=byReservation(state.experience_orders,id),charges=byReservation(state.charges,id),mods=byReservation(state.modifications,id),guarantees=byReservation(state.guarantees,id),notes=byReservation(state.notes,id);const items=orders.flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  $("#reservation-detail").innerHTML=`<small>${esc(r.confirmation_code||sourceLabel(r.source))}</small><h2 id="drawer-title">${esc(r.guest_name||"Hóspede")}</h2><div class="drawer-status"><span class="admin-status ${statusClass(r.status)}">${statusLabel(r.status)}</span><span>${esc(sourceLabel(r.source))}</span></div>
  <section class="drawer-block"><h3>Estadia</h3><div class="drawer-dates"><div><small>CHECK-IN</small><strong>${date(r.check_in)}</strong><span>${esc((p?.check_in_time||"15:00").slice(0,5))}</span></div><div><small>CHECKOUT</small><strong>${date(r.check_out)}</strong><span>${esc((p?.check_out_time||"11:00").slice(0,5))}</span></div></div><p><strong>${esc(p?.name||"Imóvel")}</strong> · ${r.guests} hóspede${r.guests===1?"":"s"}</p></section>
  <section class="drawer-block"><h3>Contato</h3><p>${esc(r.guest_email||"E-mail não informado")}<br>${esc(r.guest_phone||"Telefone não informado")}</p></section>
  <section class="drawer-block"><h3>Experiências</h3>${items.length?items.map(i=>`<div class="drawer-line"><span>${esc(i.product_name_snapshot)}${i.variant_name_snapshot?" · "+esc(i.variant_name_snapshot):""}</span><strong>${brl(Number(i.unit_price_cents)*Number(i.quantity||1))}</strong>${r.status==="confirmed"&&!r.checked_in_at?`<button type="button" data-experience-credit="${esc(i.id)}">Retirar e calcular crédito</button>`:""}</div>`).join(""):empty("Nenhuma experiência ativa.")}${charges.filter(c=>c.status==="awaiting_payment").map(c=>`<div class="drawer-alert">Pagamento pendente: ${esc(c.description||c.kind)} · ${brl(c.amount_cents)}</div>`).join("")}</section>
  <section class="drawer-block"><h3>Pagamento</h3>${payments.length?payments.map(x=>`<div class="drawer-line"><span>${statusLabel(x.status)} · ${esc(x.method||x.provider)}${x.method==="card"?` · ${Number(x.installments||1)}x · juros ${brl(x.metadata?.buyer_interest_cents||0)}`:""}</span><strong>${brl(x.amount_cents)}</strong></div>`).join(""):empty("Nenhum pagamento registrado.")}<div class="drawer-total"><span>Total da reserva</span><strong>${brl(Math.round(Number(r.total_amount||0)*100))}</strong></div></section>
  ${mods.length?`<section class="drawer-block"><h3>Alterações</h3>${mods.map(m=>`<div class="drawer-line"><span>${statusLabel(m.status)} · ${date(m.requested_check_in)} a ${date(m.requested_check_out)}</span><strong>${brl(m.admin_additional_amount_cents||0)}</strong></div>`).join("")}</section>`:""}
  <section class="drawer-block"><h3>Garantia da reserva</h3>${guarantees.length?guarantees.map(g=>`<div class="drawer-line"><span>${statusLabel(g.financial?.status||g.status)} · ${g.provider==="pagbank_sandbox"&&g.provider_authorization_id?"Autorizada no PagBank":"Sem autorização confirmada"}</span><strong>${brl(g.amount_cents)}</strong></div><p>Capturado: <strong>${brl(g.captured_amount_cents||0)}</strong> · Estornado: ${brl(g.refunded_amount_cents||0)}</p><button type="button" data-guarantee="${esc(g.id)}">Ver garantia e ocorrências</button>`).join(""):empty("Nenhuma garantia vinculada a esta reserva.")}</section>
  <section class="drawer-block"><h3>Financeiro da reserva</h3><div id="reservation-finance-summary" role="status">Consultando histórico financeiro…</div></section>
  <section class="drawer-block"><h3>Ocorrências</h3><p>Registrar uma ocorrência não realiza cobrança. A decisão financeira é uma ação separada.</p><div id="reservation-incidents">Consultando ocorrências…</div><button type="button" id="new-reservation-incident">Nova ocorrência</button></section>
  <section class="drawer-block"><h3>Estornos e cancelamentos</h3><div id="reservation-refund-history">Consultando histórico…</div></section>
  <section class="drawer-block"><h3>Histórico interno</h3><div class="drawer-notes">${notes.length?notes.map(n=>`<p>${esc(n.note)}<small>${dateTime(n.created_at)}</small></p>`).join(""):empty("Nenhuma anotação interna.")}</div><form id="reservation-note-form" class="drawer-note-form"><textarea name="note" rows="2" placeholder="Escreva uma observação para a equipe"></textarea><button>Adicionar</button></form></section>
  ${(state.cancel_requests||[]).filter(x=>x.reservation_id===r.id).map(x=>`<section class="drawer-block"><h3>Cancelamento solicitado pelo hóspede</h3><p>${esc(x.reason)} · ${dateTime(x.requested_at)}</p><p>Estado: ${esc(x.status)}</p><button data-review-cancel="${esc(x.id)}">Analisar solicitação</button></section>`).join("")}
  <section class="drawer-actions"><button data-checkin ${r.status!=="confirmed"||r.check_in>today()||r.check_out<today()||r.checked_in_at?"disabled":""}>Registrar check-in</button><button data-checkout ${r.status!=="confirmed"||r.check_in>today()||!r.checked_in_at||r.checked_out_at?"disabled":""}>Registrar checkout</button>${r.status==="confirmed"?'<button class="danger" data-cancel-reservation>Cancelar reserva</button><button data-voluntary-refund>Estorno voluntário</button>':""}</section>`;
  $("#reservation-drawer").hidden=false;document.body.classList.add("drawer-open");
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
async function reservationAction(id,operation){await api("admin_reservation_action",{operation,reservation_id:id});await load(true);openReservation(id)}
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
const refundError=e=>({accepted_policy_missing:"A versão aceita da política não foi encontrada.",ledger_review_required:"Os valores pagos não coincidem com o financeiro; revisão necessária.",partial_refund_provider_receipt_required:"Estorno parcial exige comprovante de valor do PagBank; solicitação bloqueada para revisão.",captured_charges_required:"Não há cobrança PagBank paga e identificada para esta reserva.",individual_review_required:"A política exige análise individual.",refund_allocation_requires_review:"A distribuição entre cobranças exige revisão."})[e.message]||"Não foi possível confirmar esta operação. A reserva permanece ativa; consulte a conciliação.";
function renderRefundDecision(id,d){
  const alloc=d.calculation?.allocations||[];
  const voluntary=d.kind==="voluntary_refund",experienceCredit=d.calculation?.reason==="unprovided_experience";
  const caseState={prepared:"Pronto para aprovação",pending_provider:"Aguardando PagBank",confirmed:"Confirmado"}[d.status]||"Em análise";
  const mayApprove=d.status==="prepared"||(d.status==="pending_provider"&&d.refunds?.some(x=>x.state==="prepared"));
  $("#admin-modal-content").innerHTML=`<small>${experienceCredit?"CRÉDITO DE EXPERIÊNCIA":voluntary?"ESTORNO VOLUNTÁRIO":"CANCELAMENTO"} · ${caseState}</small><h2>${brl(d.refund_due_cents)} a devolver</h2><p>Confirmado no financeiro: ${brl(d.confirmed_cents)}. Restante: ${brl(Math.max(0,d.refund_due_cents-d.confirmed_cents))}.</p>${d.provider_issue==="pagbank_refund_temporarily_unavailable"?'<p role="alert">O PagBank recusou o estorno com o código 40008 (serviço temporariamente indisponível). Nenhum valor foi confirmado como devolvido. Consulte novamente a cobrança; se persistir, solicite ao suporte PagBank a habilitação do estorno para esta conta sandbox.</p>':""}<p>Política aceita: versão ${esc(d.accepted_version||"—")}. ${voluntary?"A reserva continuará ativa após o estorno.":"A reserva só será cancelada após conciliação."}</p><div class="admin-stack">${alloc.map(x=>`<p>Cobrança ${esc(String(x.charge_id||"").slice(-8))}: paga ${brl(x.captured_cents)} · devolução ${brl(x.refund_cents)} · ${esc(x.calculation?.reason==="unprovided_experience"?"experiência não prestada":x.calculation?.reason==="commercial_free_window"?"cancelamento na janela comercial gratuita":x.calculation?.reason==="withdrawal_window"?"prazo adicional da política aceita":x.calculation?.reason==="voluntary_refund"?"estorno voluntário":x.calculation?.reason||"calculado pela política")}</p>`).join("")}</div><p class="admin-form-message" role="status"></p><div class="drawer-actions">${mayApprove?'<button class="admin-danger" id="refund-approve">Aprovar e solicitar estorno</button>':d.status!=="confirmed"?'<button id="refund-reconcile">Consultar PagBank</button>':""}</div>`;
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

boot();
})();
