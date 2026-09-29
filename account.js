(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const pagbankSandbox=C.environment==="development";
const $=s=>document.querySelector(s),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nights=(a,b)=>Math.max(1,Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000));
let session=null,profile=null,properties=[],mods=[],charges=[],cartItems=[],reservationsCache=[],shopReservationId=null,paymentSettings={},activeCharge=null,postInstallmentQuote=null;
const esc=v=>String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
let anonymousId="";
function downloadAcceptedPolicy(doc,code){
 const content=`Chalezinho Ville — ${doc.title}\nReserva ${code}\nVersão ${doc.version}\nAceita em ${fmtDateTime(doc.accepted_at)}\n\n${doc.body}\n`;
 const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=`chalezinho-politica-${String(code||"reserva").replace(/[^a-z0-9_-]/gi,"-")}-v${String(doc.version||"").replace(/[^0-9.]/g,"")}.txt`;
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function downloadReservationPolicy(id,button){
 button.disabled=true;
 try{
  const result=await api("reservation_policy",{reservation_id:id});
  const doc=result.documents.find(x=>x.code?.includes("refundable"))||result.documents[0];
  if(!doc) throw new Error("policy_unavailable");
  downloadAcceptedPolicy(doc,result.confirmation_code);
 }catch{button.textContent="Política indisponível. Contate o atendimento."}
 finally{button.disabled=false}
}
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
async function api(action,body={}){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers,body:JSON.stringify({action,...body})});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});return d}
async function guaranteeApi(action,body={}){const r=await fetch(C.guaranteeEngine,{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...body})});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw new Error(d.error||"guarantee_unavailable");return d}
function track(event_name,payload={}){api("track",{event_name,anonymous_id:anonymousId,...payload}).catch(()=>{})}
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando confirmação",not_confirmed:"Não confirmada",no_show:"Não compareceu",cancelled:"Cancelada",quoted:"Em análise",awaiting_guest_acceptance:"Aguardando sua confirmação",awaiting_payment:"Aguardando pagamento",payment_expired:"Cancelada por falta de pagamento",accepted:"Aceita",applied:"Aplicada",rejected:"Recusada",requested:"Solicitada"}[s]||s);
const fmtDateTime=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
async function boot(){
 const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:p},{data:reservations},{data:props},{data:m},{data:ch},{data:cart},cfg]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,property_id,check_in,check_out,status,not_confirmed_at,not_confirmed_reason,cancelled_at,cancellation_actor,cancellation_reason,no_show_at,guests,rate_plan_code,stay_amount,cleaning_fee,experience_amount,total_amount,created_at,properties(name,cover_image,check_out_time),payments(id,status,amount_cents,method,installments,metadata,created_at,updated_at),guarantees(id,status,amount_cents,captured_amount_cents,provider_capture_before,provider_error_code,attention_code),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("created_at",{ascending:false}),
  sb.from("properties").select("id,name,active,features").eq("active",true).order("id"),
  sb.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,original_amount_cents,reference_amount_cents,estimated_additional_amount_cents,admin_additional_amount_cents,status,admin_note,payment_charge_id,payment_due_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}),
  sb.from("post_booking_charges").select("id,reservation_id,kind,status,amount_cents,payment_id,modification_request_id,description,expires_at,snapshot,created_at,payments(status,method,installments)").eq("user_id",session.user.id).order("created_at",{ascending:false}),
  sb.from("post_booking_cart_items").select("id,reservation_id,target_variant_id,package_type,purchase_mode,amount_cents,description,snapshot,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}),
  api("config")
 ]);
 profile=p;properties=props||[];mods=m||[];charges=ch||[];cartItems=cart||[];reservationsCache=reservations||[];paymentSettings=cfg?.payment_settings||{};
 $("#profile-name").value=profile?.full_name||"";$("#profile-phone").value=profile?.phone||"";
 if(profile?.role==="admin"){$("#ops-link").hidden=false;$("#experience-admin-link").hidden=false}
 renderExperienceCart(reservationsCache);
 renderPendingPayments(reservationsCache);
 renderReservations(reservationsCache);
 showRefundStatuses(reservationsCache);
 showCancellationRequests(reservationsCache);
 const requestedCharge=new URLSearchParams(location.search).get("charge");
 if(requestedCharge){
  const charge=charges.find(x=>String(x.id)===String(requestedCharge)&&["awaiting_payment","processing"].includes(x.status));
  if(charge)setTimeout(()=>openChargePayment(charge),100);
 }
}
async function showCancellationRequests(rows){
 await Promise.all(rows.map(async r=>{
  const target=[...document.querySelectorAll(".account-reservation")]
    .find(x=>x.querySelector(`[data-download-reservation-policy="${r.id}"]`))?.querySelector(".reservation-detail-copy");
  if(!target)return;
  try{
   const {requests}=await api("reservation_cancel_request",{operation:"status",reservation_id:r.id});
   const current=(requests||[])[0];
   if(current){
    const message={requested:"Cancelamento solicitado. A reserva e as datas continuam válidas até a decisão.",
      approved:"Cancelamento aprovado. Aguardando conciliação do estorno.",
      processing:"Estorno em processamento. A reserva continua válida até confirmação.",
      completed:"Cancelamento concluído após confirmação do estorno.",
      rejected:"Solicitação recusada. Sua reserva continua válida."}[current.status];
    if(message){const node=document.createElement("p");node.className="reservation-inline-pending";node.textContent=message;target.append(node)}
   }
   const {cases}=await api("reservation_refund_status",{reservation_id:r.id});
   if((cases||[]).some(c=>c.kind==="policy_cancellation"))return;
   if(r.status!=="confirmed"||["requested","approved","processing"].includes(current?.status)||
      Date.parse(r.check_in+"T15:00:00-03:00")<=Date.now())return;
   const form=document.createElement("form");form.className="account-form";
   form.innerHTML='<button type="button" class="reservation-action">Solicitar cancelamento</button>'+
     '<div hidden><label>Motivo da solicitação<textarea name="reason" rows="3" minlength="5" required></textarea></label>'+
     '<p>A reserva permanece válida até a aprovação e a confirmação do estorno conforme a política aceita.</p>'+
     '<button class="primary-action">Enviar solicitação</button><p role="status"></p></div>';
   target.append(form);form.querySelector('button[type="button"]').onclick=()=>{form.querySelector("div").hidden=false};
   form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector(".primary-action"),message=form.querySelector('[role="status"]');
    button.disabled=true;message.textContent="Enviando solicitação…";
    try{await api("reservation_cancel_request",{operation:"request",reservation_id:r.id,reason:form.elements.reason.value});
      form.innerHTML='<p class="reservation-inline-pending">Solicitação enviada. A reserva permanece válida até a decisão e a conciliação.</p>'}
    catch{message.textContent="Não foi possível enviar a solicitação. A reserva permanece válida.";button.disabled=false}
   };
  }catch{/* The reservation remains visible when cancellation status is unavailable. */}
 }));
}
async function showRefundStatuses(rows){
 await Promise.all(rows.map(async r=>{
  try{const {cases}=await api("reservation_refund_status",{reservation_id:r.id});if(!cases?.length)return;
   const card=[...document.querySelectorAll(".account-reservation")].find(x=>x.querySelector(`[data-download-reservation-policy="${r.id}"]`));
   const target=card?.querySelector(".reservation-detail-copy");if(!target)return;
   for(const c of cases){
    const note=document.createElement("div");note.className="reservation-payment-state "+(c.status==="confirmed"?"success":"info");
    const due=Number(c.refund_due_cents),confirmed=Number(c.confirmed_cents);
    note.innerHTML="<small>"+(c.credit_reason==="unprovided_experience"?"DEVOLUÇÃO DE EXPERIÊNCIA":c.kind==="voluntary_refund"?"ESTORNO VOLUNTÁRIO":"ESTORNO DO CANCELAMENTO")+"</small><strong>"+(c.status==="confirmed"?"Concluído":c.status==="prepared"?"Em análise administrativa":"Aguardando confirmação do PagBank")+"</strong><p>Solicitado: "+brlC(due)+" · Confirmado: "+brlC(confirmed)+" · Restante: "+brlC(Math.max(0,due-confirmed))+"</p>";
    target.prepend(note);
   }
  }catch{/* A failure to read a refund never changes the displayed payment state. */}
 }));
}

function renderExperienceCart(reservations){
 const section=$("#experience-cart-section"),list=$("#experience-cart-list"),count=$("#experience-cart-count");
 if(!section||!list)return;
 if(!cartItems.length){section.hidden=true;list.innerHTML="";return}
 const map=new Map(reservations.map(r=>[String(r.id),r]));
 section.hidden=false;
 count.textContent=(cartItems.length===1?"1 item separado":""+cartItems.length+" itens separados")+". Você pode remover ou seguir para o pagamento.";
 list.innerHTML=cartItems.map(item=>{
   const r=map.get(String(item.reservation_id)),property=r?.properties?.name||"Reserva";
   const code=r?.confirmation_code?' · Código '+esc(r.confirmation_code):'';
   const kind=item.purchase_mode==="upgrade"?"UPGRADE DE EXPERIÊNCIA":"EXPERIÊNCIA";
   return '<article class="experience-cart-card"><div><small>'+kind+'</small><h3>'+esc(item.description)+'</h3><p>'+esc(property)+code+'</p><p class="cart-not-charge">Este item ainda não gerou cobrança.</p></div><div class="experience-cart-value"><span>'+brlC(item.amount_cents)+'</span><button class="primary-action compact" data-checkout-cart="'+item.id+'">Ir para pagamento</button><button class="text-action danger" data-remove-cart="'+item.id+'">Remover</button></div></article>';
 }).join("");
 list.querySelectorAll("[data-checkout-cart]").forEach(b=>b.addEventListener("click",()=>checkoutCartItem(b.dataset.checkoutCart,b)));
 list.querySelectorAll("[data-remove-cart]").forEach(b=>b.addEventListener("click",()=>removeCartItem(b.dataset.removeCart,b)));
}

async function checkoutCartItem(id,btn){
 btn.disabled=true;
 try{
  const item=cartItems.find(x=>String(x.id)===String(id));
  const d=await api("checkout_experience_cart_item",{cart_item_id:id});
  cartItems=cartItems.filter(x=>String(x.id)!==String(id));
  const charge={...d.charge,reservation_id:item?.reservation_id};charges.unshift(charge);
  renderExperienceCart(reservationsCache);renderPendingPayments(reservationsCache);renderReservations(reservationsCache);
  openChargePayment(charge);
 }catch(e){btn.disabled=false;alert(e.message==="experience_payment_already_pending"?"Já existe um pagamento pendente para esta categoria.":"Não foi possível iniciar o pagamento agora.")}
}
async function removeCartItem(id,btn){
 btn.disabled=true;
 try{await api("remove_experience_cart_item",{cart_item_id:id});cartItems=cartItems.filter(x=>String(x.id)!==String(id));renderExperienceCart(reservationsCache)}
 catch{btn.disabled=false;alert("Não foi possível remover este item agora.")}
}

function activeModification(reservationId){return mods.find(m=>m.reservation_id===reservationId&&["requested","quoted","awaiting_guest_acceptance","awaiting_payment","accepted"].includes(m.status))}
function chargeForModification(m){return m?.payment_charge_id?charges.find(c=>String(c.id)===String(m.payment_charge_id)):null}
function chargePaymentStatus(c){return c?.payments?.status||null}
function chargeUnderReview(c){return chargePaymentStatus(c)==="under_review"}
function liveCharges(reservationId=null){
 const now=Date.now();
 return charges.filter(c=>(!reservationId||c.reservation_id===reservationId)
   &&["awaiting_payment","processing"].includes(c.status)
   &&(!c.expires_at||Date.parse(c.expires_at)>now));
}
function fmtDate(v){return v?new Date(v).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—"}
function initialPayment(r){
 return [...(r.payments||[])]
   .filter(p=>p?.metadata?.kind!=="post_booking_charge")
   .sort((a,b)=>Date.parse(b.created_at||b.updated_at||0)-Date.parse(a.created_at||a.updated_at||0))[0]||null;
}
function paymentStatus(p){
 if(!p)return null;
 const map={
  awaiting_payment:{label:"Aguardando pagamento",tone:"action",detail:"O pagamento ainda não foi concluído."},
  action_required:{label:"Ação necessária",tone:"action",detail:"O banco solicitou uma confirmação adicional para continuar."},
  processing:{label:"Processando",tone:"info",detail:"O pagamento foi enviado e está sendo processado."},
  under_review:{label:"Pagamento em análise",tone:"info",detail:"A reserva permanece protegida enquanto o pagamento é analisado."},
  paid:{label:"Pagamento aprovado",tone:"success",detail:"Pagamento confirmado."},
  refused:{label:"Pagamento recusado",tone:"danger",detail:"A tentativa foi recusada e esta reserva não chegou a ser confirmada."},
  expired:{label:p.method==="pix"?"Pix expirado":"Pagamento expirado",tone:"muted",detail:"O prazo do pagamento terminou e esta reserva não chegou a ser confirmada."},
  cancelled:{label:"Pagamento cancelado",tone:"muted",detail:"O pagamento foi encerrado antes da confirmação da reserva."},
  partially_refunded:{label:"Reembolso parcial",tone:"info",detail:"Parte do valor pago foi devolvida."},
  refunded:{label:"Reembolsado",tone:"muted",detail:"O valor pago foi devolvido."},
  disputed:{label:"Pagamento contestado",tone:"danger",detail:"Existe uma contestação em análise junto ao meio de pagamento."},
  chargeback:{label:"Pagamento estornado",tone:"danger",detail:"O pagamento foi revertido pelo emissor."}
 };
 return map[p.status]||{label:p.status,tone:"muted",detail:""};
}
function reservationStatus(r){
 const now=Date.now(),checkIn=Date.parse(r.check_in+"T15:00:00-03:00"),checkOut=Date.parse(r.check_out+"T11:00:00-03:00");
 if(r.status==="not_confirmed"&&(r.payments||[]).some(p=>p.status==="paid"&&p?.metadata?.kind!=="post_booking_charge")) return {label:"Pagamento recebido · reserva em análise",tone:"danger",priority:0,needsAction:true};
 if(r.status==="pending_payment") return {label:"Aguardando confirmação",tone:"action",priority:0,needsAction:true};
 if(r.status==="not_confirmed") return {label:"Não confirmada",tone:"muted",priority:4,needsAction:false};
 if(r.status==="cancelled") return {label:"Cancelada",tone:"muted",priority:4,needsAction:false};
 if(r.status==="no_show") return {label:"Não compareceu",tone:"muted",priority:4,needsAction:false};
 if(r.status==="confirmed"&&now>=checkOut) return {label:"Concluída",tone:"done",priority:3,needsAction:false};
 if(r.status==="confirmed"&&now>=checkIn&&now<checkOut) return {label:"Hospedagem em andamento",tone:"success",priority:1,needsAction:false};
 if(r.status==="confirmed") return {label:"Confirmada",tone:"success",priority:2,needsAction:false};
 return {label:statusLabel(r.status),tone:"muted",priority:3,needsAction:false};
}
function renderPendingPayments(reservations){
 const section=$("#pending-payment-section"),list=$("#pending-payment-list"),count=$("#pending-payment-count");
 if(!section||!list)return;
 const map=new Map(reservations.map(r=>[String(r.id),r]));
 const pending=liveCharges().sort((a,b)=>Date.parse(a.expires_at||"2999-01-01")-Date.parse(b.expires_at||"2999-01-01"));
 if(!pending.length){section.hidden=true;list.innerHTML="";return}
 section.hidden=false;
 count.textContent=pending.length===1?"1 pendência exige sua atenção":pending.length+" pendências exigem sua atenção";
 list.innerHTML=pending.map(charge=>{
   const r=map.get(String(charge.reservation_id));
   const property=r?.properties?.name||"Reserva";
   const originalPeriod=r?(r.check_in.split("-").reverse().join("/")+" → "+r.check_out.split("-").reverse().join("/")):"";
   const targetCheckIn=charge.snapshot?.requested_check_in||charge.snapshot?.target_check_in;
   const targetCheckOut=charge.snapshot?.requested_check_out||charge.snapshot?.target_check_out;
   const targetPeriod=charge.kind==="modification"&&targetCheckIn&&targetCheckOut
     ?targetCheckIn.split("-").reverse().join("/")+" → "+targetCheckOut.split("-").reverse().join("/")
     :originalPeriod;
   const title=charge.kind==="modification"?"Alteração de reserva":charge.kind==="experience_upgrade"?"Upgrade de experiência":"Experiência";
   const underReview=chargeUnderReview(charge),isFree=Number(charge.amount_cents||0)===0;
   const code=r?.confirmation_code?' · Código '+esc(r.confirmation_code):'';
   const context=charge.kind==="modification"?'Novas datas protegidas: '+targetPeriod:targetPeriod;
   const primary=underReview
     ?'<span class="payment-review-state">Pagamento em análise</span>'
     :isFree
       ?'<button class="primary-action compact" data-confirm-free-charge="'+charge.id+'">Confirmar alteração</button>'
       :'<button class="primary-action compact" data-pay-charge="'+charge.id+'">'+(charge.status==="processing"?"Continuar pagamento":"Ir para pagamento")+'</button>';
   const cancel=underReview?'':'<button class="text-action danger" data-cancel-charge="'+charge.id+'">Cancelar</button>';
   return '<article class="payment-pending-card"><div><small>'+title.toUpperCase()+'</small><h3>'+esc(charge.description||title)+'</h3><p>'+esc(property)+code+'</p><p>'+context+'</p><p class="payment-pending-deadline">Prazo: '+fmtDateTime(charge.expires_at)+'</p></div><div class="payment-pending-value"><span>'+(isFree?'Sem cobrança adicional':brlC(charge.amount_cents))+'</span>'+primary+cancel+'</div></article>';
 }).join("");
 list.querySelectorAll("[data-pay-charge]").forEach(b=>b.addEventListener("click",()=>openChargePayment(b.dataset.payCharge)));
 list.querySelectorAll("[data-confirm-free-charge]").forEach(b=>b.addEventListener("click",()=>confirmFreeCharge(b.dataset.confirmFreeCharge,b)));
 list.querySelectorAll("[data-cancel-charge]").forEach(b=>b.addEventListener("click",()=>cancelPendingCharge(b.dataset.cancelCharge,b)));
}
function renderPendingExperienceCharge(c){
 const action=chargeUnderReview(c)
  ?'<span class="payment-review-state">Pagamento em análise</span>'
  :'<button class="text-action" data-pay-charge="'+c.id+'">Ir para pagamento</button>';
 return '<div class="reservation-inline-pending"><span><strong>'+(chargeUnderReview(c)?'Pagamento em análise':'Pagamento pendente')+'</strong> · '+esc(c.description||"Experiência")+' · '+brlC(c.amount_cents)+'</span>'+action+'</div>';
}
function renderExperiencePaymentHistory(r){
 const related=charges.filter(c=>c.reservation_id===r.id&&["experience_add","experience_upgrade"].includes(c.kind));
 if(!related.length)return "";
 const entries=related.flatMap(c=>{
  const attempts=(r.payments||[]).filter(p=>p.metadata?.post_booking_charge_id===c.id)
    .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  if(!attempts.length)return [];
  return attempts.map(p=>{
   const applied=c.status==="applied"&&p.status==="paid";
   const label=applied?"Pagamento aprovado · experiência incluída"
    :p.status==="refused"?"Pagamento recusado · experiência não incluída"
    :p.status==="under_review"?"Pagamento em análise · aguarde"
    :p.status==="paid"?"Pagamento recebido · conferência necessária"
    :p.status==="expired"?"Pagamento expirado · experiência não incluída"
    :"Pagamento aguardando confirmação";
   const tone=applied?"success":p.status==="refused"?"danger":"info";
   const method=p.method==="card"?"Cartão · "+(p.installments||1)+"x":p.method==="pix"?"Pix":"Pagamento";
   return {date:p.created_at||c.created_at,html:'<div class="experience-payment-event '+tone+'"><strong>'+esc(label)+'</strong><span>'+esc(c.description||"Experiência")+' · '+brlC(p.amount_cents||c.amount_cents)+'</span><small>'+esc(method)+' · '+fmtDateTime(p.created_at||c.created_at)+'</small></div>'};
  });
 }).sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
 return entries.length?'<section class="experience-payment-history" aria-label="Pagamentos das experiências"><h4>Pagamentos das experiências</h4>'+entries.map(e=>e.html).join("")+'</section>':"";
}
function renderModificationPaymentHistory(r){
 const related=charges.filter(c=>c.reservation_id===r.id&&c.kind==="modification");
 const entries=related.flatMap(c=>(r.payments||[])
  .filter(p=>p.metadata?.post_booking_charge_id===c.id)
  .map(p=>{
   const applied=c.status==="applied"&&p.status==="paid";
   const label=applied?"Pagamento aprovado · alteração aplicada":p.status==="refused"?"Pagamento recusado · alteração não aplicada":p.status==="under_review"?"Pagamento em análise · aguarde":"Pagamento aguardando confirmação";
   const method=p.method==="card"?"Cartão · "+(p.installments||1)+"x":p.method==="pix"?"Pix":"Pagamento";
   return {date:p.created_at||c.created_at,html:'<div class="experience-payment-event '+(applied?"success":p.status==="refused"?"danger":"info")+'"><strong>'+esc(label)+'</strong><span>'+esc(c.description||"Alteração de reserva")+' · '+brlC(p.amount_cents||c.amount_cents)+'</span><small>'+esc(method)+' · '+fmtDateTime(p.created_at||c.created_at)+'</small></div>'};
  })).sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
 return entries.length?'<section class="experience-payment-history" aria-label="Pagamentos das alterações"><h4>Pagamentos das alterações</h4>'+entries.map(e=>e.html).join("")+'</section>':"";
}
function renderReservations(reservations){
 const box=$("#reservation-list");box.innerHTML="";
 if(!reservations.length){box.innerHTML='<div class="empty-state">Você ainda não tem reservas vinculadas a esta conta.</div>';return}
 const sorted=[...reservations].sort((a,b)=>
   Date.parse(b.created_at||0)-Date.parse(a.created_at||0)
   ||Date.parse(b.check_in)-Date.parse(a.check_in)
   ||String(b.id).localeCompare(String(a.id))
 );
 const defaultOpen=sorted[0]?.id;
 sorted.forEach(r=>{
  const ux=reservationStatus(r),active=activeModification(r.id),history=mods.filter(m=>m.reservation_id===r.id&&![ "requested","quoted","awaiting_guest_acceptance","awaiting_payment","accepted"].includes(m.status)).slice(0,2);
  const payment=initialPayment(r),paymentUx=paymentStatus(payment);
  if(paymentUx&&payment?.status==="paid"&&r.status==="not_confirmed") Object.assign(paymentUx,{label:"Pagamento recebido · conciliação necessária",tone:"danger",detail:"O PagBank informou pagamento, mas a reserva não foi confirmada. A equipe precisa verificar a disponibilidade e resolver o valor recebido."});
  const expItems=(r.experience_orders||[]).flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  const pendingExperienceCharges=liveCharges(r.id).filter(c=>["experience_add","experience_upgrade"].includes(c.kind));
  const guarantee=(r.guarantees||[])[0],n=nights(r.check_in,r.check_out),lodging=Number(r.stay_amount||0);
  const firstAppliedChange=charges.filter(c=>c.reservation_id===r.id&&c.kind==="modification"&&c.status==="applied"&&c.snapshot?.original_check_in&&c.snapshot?.original_check_out).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))[0];
  const initialNights=firstAppliedChange?nights(firstAppliedChange.snapshot.original_check_in,firstAppliedChange.snapshot.original_check_out):n;
  const initialLodgingLabel=firstAppliedChange?"Valor inicial da reserva · "+initialNights+" noites":"Hospedagem · "+n+" noites";
  const initialLodgingDetails=firstAppliedChange?"":'<small>'+brl(lodging/n)+' por noite</small>';
  const paid=["paid","refunded"].includes(payment?.status)&&r.status==="confirmed";
  const appliedRevision=mods.filter(m=>m.reservation_id===r.id&&m.status==="applied").reduce((sum,m)=>sum+Number(m.admin_additional_amount_cents||0),0);
  const art=document.createElement("details");art.className="account-reservation reservation-accordion";art.dataset.status=ux.tone;
  if(String(r.id)===String(defaultOpen))art.open=true;
  const expRows=expItems.map(i=>'<div class="reservation-breakdown-row"><span>'+esc(i.product_name_snapshot)+'</span><strong>'+brlC(Number(i.unit_price_cents))+'</strong></div>').join("");
  const revisionRow=appliedRevision>0?'<div class="reservation-breakdown-row tariff-revision"><span>Revisão de tarifa da alteração</span><strong>+'+brlC(appliedRevision)+'</strong></div>':"";
  const buyerFees=(r.payments||[]).filter(p=>["paid","refunded","partially_refunded"].includes(p.status))
    .reduce((sum,p)=>sum+Number(p.metadata?.buyer_interest_cents||0),0);
  const buyerFeeRow=buyerFees>0?'<div class="reservation-breakdown-row"><span>Juros do parcelamento no cartão</span><strong>'+brlC(buyerFees)+'</strong></div>':"";
  const pendingCharges=pendingExperienceCharges.map(renderPendingExperienceCharge).join("");
  const canShop=r.status==="confirmed"&&Date.parse(r.check_in+"T15:00:00-03:00")>Date.now();
  const experienceAction=canShop?'<button class="reservation-action experience-action" data-experience-shop="'+r.id+'">Adicionar experiência</button>':"";
  const modificationAction=!active&&canShop?'<button class="reservation-action modification-action" data-modify="'+r.id+'" data-property="'+r.property_id+'" data-in="'+r.check_in+'" data-out="'+r.check_out+'">Solicitar alteração</button>':"";
  const policyAction='<button class="reservation-action" data-download-reservation-policy="'+r.id+'">Baixar política aceita</button>';
  const reservationActions='<div class="reservation-actions">'+experienceAction+modificationAction+policyAction+'</div>';
  const period=r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/");
  const paymentBadge=paymentUx?'<span class="payment-status-badge '+paymentUx.tone+'">'+esc(paymentUx.label)+'</span>':'';
  const paymentPanel=paymentUx?'<div class="reservation-payment-state '+paymentUx.tone+'"><small>STATUS DO PAGAMENTO</small><strong>'+esc(paymentUx.label)+'</strong><p>'+esc(paymentUx.detail)+'</p>'+(payment.method?'<span>'+(payment.method==="pix"?'Pix':payment.method==="card"?'Cartão'+(payment.installments?' · '+payment.installments+'x':''):'Pagamento de teste')+'</span>':'')+'</div>':'';
  const experiencePaymentHistory=renderExperiencePaymentHistory(r);
  const modificationPaymentHistory=renderModificationPaymentHistory(r);
  art.innerHTML='<summary class="reservation-summary"><div class="reservation-summary-copy"><strong>'+esc(r.properties?.name||"Reserva")+'</strong><span>Reserva em '+fmtDate(r.created_at)+' · Estadia '+period+'</span></div><span class="reservation-badge-stack"><span class="reservation-status-badge '+ux.tone+'">'+ux.label+'</span>'+paymentBadge+'</span><span class="reservation-summary-arrow">⌄</span></summary><div class="reservation-detail-grid"><img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div class="reservation-detail-copy"><small>RESERVA · '+ux.label.toUpperCase()+'</small><h3>'+esc(r.properties?.name||"Reserva")+'</h3><p>'+period+' · '+r.guests+' hóspedes</p>'+paymentPanel+'<div class="reservation-breakdown"><div class="reservation-breakdown-row"><span>'+initialLodgingLabel+initialLodgingDetails+'</span><strong>'+brl(lodging)+'</strong></div>'+expRows+revisionRow+buyerFeeRow+'<div class="reservation-breakdown-total"><span>VALOR TOTAL DA RESERVA</span><strong>'+brl(r.total_amount)+'</strong></div></div>'+experiencePaymentHistory+modificationPaymentHistory+'<span>Código '+(r.confirmation_code||"—")+'</span>'+renderGuarantee(guarantee,r)+pendingCharges+reservationActions+(active?renderModification(active):"")+(history.length?'<details class="mod-history"><summary>Histórico de alterações</summary>'+history.map(renderModification).join("")+'</details>':'')+'</div></div>';
  box.appendChild(art);
  const finance=document.createElement('section');finance.className='reservation-breakdown';
  finance.setAttribute('aria-label','Resumo financeiro da reserva');
  art.querySelector('.reservation-detail-copy').append(finance);
  let loaded=false;
  const loadFinance=async()=>{
   if(loaded)return;loaded=true;finance.textContent='Consultando resumo financeiro…';
   try{const {finance:f}=await api('reservation_finance',{reservation_id:r.id});
    const lines=[['Valor contratado',f.contract_cents],['Pagamentos recebidos',f.paid_cents],
     ['Estornos confirmados',f.refunded_cents],['Estornos em andamento',f.pending_refund_cents],
     ['Cobranças por danos',f.damage_captured_cents],['Danos devolvidos',f.damage_refunded_cents],
     ['Saldo a pagar',f.balance_due_cents],['Crédito a devolver',f.credit_balance_cents]];
    finance.innerHTML='<h4>Financeiro desta reserva</h4>'+lines.map(([label,value])=>
     '<div class="reservation-breakdown-row"><span>'+label+'</span><strong>'+brlC(value)+'</strong></div>').join('')+
     (f.guarantees||[]).map(g=>'<p>Caução: autorizada '+brlC(g.authorized_cents)+', utilizada '+brlC(g.captured_cents)+
       ', estornada '+brlC(g.refunded_cents)+'. '+(g.release_confirmed?'Liberação confirmada: '+brlC(g.released_cents)+'.':'Liberação ainda não confirmada.')+'</p>').join('')+
     (f.incidents||[]).map(i=>'<p>Ocorrência: '+esc(i.description)+' · '+brlC(i.requested_capture_cents)+
       ' · '+esc(({approved:'Aprovada',no_charge:'Sem cobrança',pending:'Em análise'})[i.decision]||i.status)+'</p>').join('');
   }catch{loaded=false;finance.textContent='Resumo financeiro temporariamente indisponível. ';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Consultar novamente';retry.onclick=loadFinance;finance.append(retry)}
  };
  art.addEventListener('toggle',()=>{if(art.open)loadFinance()});if(art.open)loadFinance();
 });
  box.querySelectorAll("[data-guarantee-card]").forEach(b=>b.addEventListener("click",()=>openGuaranteeCard(b.dataset.guaranteeCard)));
  box.querySelectorAll("[data-guarantee-status]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;try{await guaranteeApi("status",{guarantee_id:b.dataset.guaranteeStatus});location.reload()}catch{b.disabled=false}}));
  box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify,b.dataset.property,b.dataset.in,b.dataset.out)));
 box.querySelectorAll("[data-download-reservation-policy]").forEach(b=>b.addEventListener("click",()=>downloadReservationPolicy(b.dataset.downloadReservationPolicy,b)));
 box.querySelectorAll("[data-accept-mod]").forEach(b=>b.addEventListener("click",()=>acceptModification(b.dataset.acceptMod,b)));
 box.querySelectorAll("[data-cancel-mod]").forEach(b=>b.addEventListener("click",()=>cancelModification(b.dataset.cancelMod,b)));
 box.querySelectorAll("[data-experience-shop]").forEach(b=>b.addEventListener("click",()=>openExperienceShop(b.dataset.experienceShop)));
 box.querySelectorAll("[data-pay-charge]").forEach(b=>b.addEventListener("click",()=>openChargePayment(b.dataset.payCharge)));
 box.querySelectorAll("[data-confirm-free-charge]").forEach(b=>b.addEventListener("click",()=>confirmFreeCharge(b.dataset.confirmFreeCharge,b)));
 box.querySelectorAll("[data-cancel-charge]").forEach(b=>b.addEventListener("click",()=>cancelPendingCharge(b.dataset.cancelCharge,b)));
}

async function openExperienceShop(reservationId){
 shopReservationId=reservationId;
 $("#experience-shop-modal").hidden=false;
 $("#guest-experience-list").innerHTML='<div class="loading-state">Buscando experiências disponíveis…</div>';
 $("#guest-experience-message").textContent="";
 try{
  const d=await api("guest_experience_catalog",{reservation_id:reservationId});
  renderGuestExperiences(d.items||[],d.owned_packages||[]);
  track("experience_viewed",{reservation_id:reservationId,metadata:{source:"post_booking",available_count:(d.items||[]).length}});
 }catch(e){
  $("#guest-experience-list").innerHTML='<div class="empty-state">Não foi possível carregar as experiências agora.</div>';
 }
}
function renderGuestExperiences(items,ownedPackages=[]){
 const box=$("#guest-experience-list");
 if(!items.length){
  const owned=ownedPackages.map(x=>x.name).filter(Boolean);
  const current=owned.length?'<strong>Você já possui '+esc(owned.join(", "))+'.</strong> ':"";
  box.innerHTML='<div class="empty-state">'+current+'No momento não há outro pacote ou upgrade disponível para esta reserva. Pacotes de outras categorias aparecerão aqui quando estiverem ativos e disponíveis para a sua data.</div>';
  return
 }
 box.innerHTML=items.map(item=>{
  const photos=(item.media||[]).slice(0,5).map(m=>'<img src="'+esc(m.media_url)+'" alt="'+esc(m.alt_text||item.name)+'" loading="lazy">').join("");
  const isUpgrade=item.purchase_mode==="upgrade";
  const priceLine=isUpgrade?'<span><small>UPGRADE</small> +'+brlC(item.payable_cents)+'</span>':'<span>'+brlC(item.payable_cents)+'</span>';
  const upgradeNote=isUpgrade&&item.upgrade_from?'<p class="upgrade-from">Você já tem <strong>'+esc(item.upgrade_from.name)+'</strong>. Troque por este pacote pagando apenas a diferença.</p>':"";
  const buttonLabel=isUpgrade?'Adicionar upgrade ao carrinho · +'+brlC(item.payable_cents):'Adicionar ao carrinho · '+brlC(item.payable_cents);
  return '<article class="guest-experience-card"><div class="guest-experience-gallery">'+photos+'</div><div class="guest-experience-copy"><small>'+esc(String(item.package_type||"experiência").toUpperCase())+'</small><h3>'+esc(item.name)+'</h3>'+(item.sales_headline?'<strong>'+esc(item.sales_headline)+'</strong>':'')+'<p>'+esc(item.description||"")+'</p>'+upgradeNote+'<div class="guest-experience-buy">'+priceLine+'<button class="primary-action compact" data-buy-experience="'+esc(item.variant_id)+'" data-product="'+esc(item.product_id)+'" data-mode="'+esc(item.purchase_mode||"add")+'">'+buttonLabel+'</button></div></div></article>';
 }).join("");
 box.querySelectorAll("[data-buy-experience]").forEach(b=>b.addEventListener("click",()=>purchaseGuestExperience(b)));
}
async function purchaseGuestExperience(btn){
 btn.disabled=true;$("#guest-experience-message").textContent="Adicionando ao carrinho…";
 try{
  const d=await api("purchase_post_booking_experience",{reservation_id:shopReservationId,variant_id:btn.dataset.buyExperience});
  $("#experience-shop-modal").hidden=true;
  const item={...d.cart_item,reservation_id:shopReservationId,target_variant_id:btn.dataset.buyExperience,package_type:"",snapshot:{target_product_id:btn.dataset.product}};
  cartItems=cartItems.filter(x=>!(String(x.reservation_id)===String(shopReservationId)&&String(x.id)===String(item.id)));cartItems.unshift(item);
  renderExperienceCart(reservationsCache);
  track("experience_cart_added",{reservation_id:shopReservationId,metadata:{source:"post_booking_cart",product_id:btn.dataset.product,amount_cents:Number(item.amount_cents||0)}});
  $("#experience-cart-section")?.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){
  const messages={
   experience_already_added:"Esta experiência já está na sua reserva.",
   experience_upgrade_not_available:"Este upgrade não está mais disponível.",
   experience_payment_already_pending:"Já existe uma cobrança pendente desta categoria. Conclua ou cancele antes de tentar outra.",
   experience_lead_time:"O prazo mínimo para adicionar esta experiência já passou.",
   experience_out_of_stock:"Esta experiência não está disponível no momento.",
   experience_capacity_reached:"A capacidade desta experiência para sua data foi atingida."
  };
  if(e.message==="experience_payment_already_pending"&&e.data?.existing_charge){
   const existing=e.data.existing_charge;
   if(!charges.some(c=>String(c.id)===String(existing.id)))charges.unshift(existing);
   $("#guest-experience-message").innerHTML='Já existe um pagamento pendente para esta experiência. <button class="primary-action compact" id="existing-charge-payment">Ir para pagamento</button>';
   $("#existing-charge-payment").onclick=()=>{$("#experience-shop-modal").hidden=true;openChargePayment(existing)};
  }else $("#guest-experience-message").textContent=messages[e.message]||"Não foi possível adicionar ao carrinho agora.";
  btn.disabled=false;
 }
}

function chargeById(id){return typeof id==="object"?id:charges.find(c=>String(c.id)===String(id))}
function openChargePayment(chargeInput){
 const charge=chargeById(chargeInput);if(!charge)return;
 activeCharge=charge;
 const modal=$("#post-payment-modal"),content=$("#post-payment-content");
 modal.hidden=false;
 if(chargeUnderReview(charge)){
  content.innerHTML='<small>COBRANÇA DA RESERVA</small><h2>Pagamento em análise</h2><div class="post-charge-summary"><span>'+esc(charge.description||"Cobrança adicional")+'</span><strong>'+brlC(charge.amount_cents)+'</strong></div><p>O pagamento está em análise. A cobrança não pode ser cancelada nem enviada novamente enquanto a análise não terminar.</p>';
  return;
 }
 const amount=Number(charge.amount_cents||0),isModification=charge.kind==="modification";
 const deadline=fmtDateTime(charge.expires_at);
 if(amount===0){
  content.innerHTML='<small>CONFIRMAÇÃO DA ALTERAÇÃO</small><h2>Confirmar alteração</h2><div class="post-charge-summary"><span>'+esc(charge.description||"Alteração de reserva")+'</span><strong>Sem cobrança adicional</strong></div><p>As novas datas ficam protegidas até <strong>'+deadline+'</strong>. A alteração só será aplicada quando você confirmar abaixo.</p><button class="primary-action" id="post-free-confirm">Confirmar alteração</button><p id="post-payment-message" class="form-result"></p>';
  $("#post-free-confirm").onclick=()=>confirmFreeCharge(charge.id,$("#post-free-confirm"));
  return;
 }
 const reserve=reservationsCache.find(r=>r.id===charge.reservation_id),property=properties.find(p=>p.id===reserve?.property_id);
 const terms=property?.features?.payment_terms||{max_installments:12,no_interest_installments:6};
 const maxInst=Math.min(Number(terms.max_installments),Math.max(1,Math.floor(Number(charge.amount_cents||0)/500)));
 const free=terms.interest_payer==="merchant"?maxInst:Math.min(Number(terms.no_interest_installments),maxInst);
 postInstallmentQuote=null;
 const opts='<option value="">Consultando parcelas…</option>';
 const rule=isModification
  ?'A alteração só será confirmada depois do pagamento. As novas datas estão protegidas até <strong>'+deadline+'</strong>. Se o pagamento não for concluído até esse prazo, a solicitação será cancelada automaticamente e sua reserva original continuará válida.'
  :'A experiência ou upgrade só será incluído no valor pago e na reserva depois da confirmação do pagamento.';
 content.innerHTML='<small>COBRANÇA DA RESERVA · PAGBANK SANDBOX</small><h2>Ir para pagamento de teste</h2><div class="post-charge-summary"><span>'+esc(charge.description||"Cobrança adicional")+'</span><strong>'+brlC(amount)+'</strong></div><p>'+rule+'</p><div class="post-payment-methods"><label><input type="radio" name="post-method" value="pix" checked> Pix</label><label><input type="radio" name="post-method" value="card"> Cartão · até '+free+'x sem juros; até '+maxInst+'x com juros</label></div><div id="post-installments-wrap" hidden><label for="post-installments">Parcelamento</label><select id="post-installments">'+opts+'</select><small id="post-installment-total" role="status">Total inicial: '+brlC(amount)+'. Consultando condições de parcelamento.</small></div><div id="post-card-fields" hidden><label>Nome no cartão<input id="post-card-holder" autocomplete="cc-name"></label><label>Número do cartão<input id="post-card-number" inputmode="numeric" autocomplete="cc-number"></label><div class="post-card-short-row"><label>Mês<input id="post-card-month" inputmode="numeric" maxlength="2" autocomplete="cc-exp-month"></label><label>Ano<input id="post-card-year" inputmode="numeric" maxlength="4" autocomplete="cc-exp-year"></label><label>CVV<input id="post-card-cvv" inputmode="numeric" autocomplete="cc-csc"></label></div></div><p>Somente cartões de teste. Nenhuma cobrança real.</p><button class="primary-action" id="post-pay-start">Ir para pagamento de teste</button><div id="post-payment-sim"></div><p id="post-payment-message" class="form-result"></p>';
 const methods=[...content.querySelectorAll('input[name="post-method"]')];
 methods.forEach(r=>{r.disabled=paymentSettings.active_provider!=="pagbank_sandbox"||paymentSettings[r.value+"_enabled"]!==true;r.checked=false;
  r.onchange=()=>{const card=document.querySelector('input[name="post-method"]:checked')?.value==="card";$("#post-installments-wrap").hidden=!card;$("#post-card-fields").hidden=!card};});
 const first=methods.find(r=>!r.disabled);if(first){first.checked=true;first.onchange();}
 else $("#post-payment-message").textContent="Pagamentos temporariamente indisponíveis.";
 $("#post-installments").disabled=true;
 const refreshPlans=async()=>{
  const bin=$("#post-card-number").value.replace(/\D/g,"").slice(0,6);
    postInstallmentQuote=null;
    try{const quote=await api("installment_options",{post_booking_charge_id:charge.id,credit_card_bin:bin.length===6?bin:undefined});
      if(bin!==$("#post-card-number").value.replace(/\D/g,"").slice(0,6))return;
   if(activeCharge?.id!==charge.id)return;
   postInstallmentQuote={...quote,chargeId:charge.id,cardBin:bin};
   $("#post-installments").innerHTML=quote.plans.map(p=>`<option value="${p.installments}">${p.installments}x de ${brlC(p.installment_cents)} · total ${brlC(p.total_cents)} · ${p.interest_free?"sem juros":"com juros"}</option>`).join("");
   $("#post-installments").disabled=false;$("#post-installments").dispatchEvent(new Event("change"));
  }catch{$("#post-installment-total").textContent="Não foi possível consultar as parcelas. Tente novamente.";}
 };
 $("#post-installments").onchange=()=>{
  const plan=postInstallmentQuote?.plans.find(p=>p.installments===Number($("#post-installments").value));
  $("#post-installment-total").textContent=plan?`${postInstallmentQuote?.indicative?"Estimativa; informe o cartão para confirmar":"Total a cobrar"}: ${brlC(plan.total_cents)} · ${plan.interest_free?"sem juros":"juros de "+brlC(plan.buyer_interest_cents)}`:"Consultando parcelas…";
 };
 const refresh=document.createElement("button");refresh.type="button";refresh.textContent="Consultar parcelas novamente";refresh.onclick=refreshPlans;$("#post-installments-wrap").appendChild(refresh);
 if(paymentSettings.card_enabled)refreshPlans();
  let previousBin="",binTimer;$("#post-card-number").addEventListener("input",()=>{
   const bin=$("#post-card-number").value.replace(/\D/g,"").slice(0,6);
   if(bin===previousBin)return;previousBin=bin;postInstallmentQuote=null;
   $("#post-installments").disabled=true;clearTimeout(binTimer);
   if(bin.length===6)binTimer=setTimeout(refreshPlans,300);
  });
 $("#post-pay-start").onclick=startChargePayment;
}
function loadPagBankCardSdk(){
 if(window.PagSeguro?.encryptCard)return Promise.resolve();
 return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";script.onload=resolve;script.onerror=()=>reject(new Error("card_sdk_unavailable"));document.head.appendChild(script)});
}
async function encryptPostBookingCard(){
 const key=await api("pagbank_sandbox_card_key");await loadPagBankCardSdk();
 const card=window.PagSeguro.encryptCard({publicKey:key.public_key,holder:$("#post-card-holder").value.trim(),
  number:$("#post-card-number").value.replace(/\D/g,""),expMonth:$("#post-card-month").value,
  expYear:$("#post-card-year").value,securityCode:$("#post-card-cvv").value});
 if(card.hasErrors||!card.encryptedCard)throw new Error("invalid_test_card");
 ["#post-card-number","#post-card-month","#post-card-year","#post-card-cvv"].forEach(id=>$(id).value="");
 return card.encryptedCard;
}
async function startChargePayment(){
 const btn=$("#post-pay-start");btn.disabled=true;$("#post-payment-message").textContent="Preparando pagamento…";
 const method=document.querySelector('input[name="post-method"]:checked')?.value||"pix";
 const installments=method==="card"?Number($("#post-installments").value||1):1;
 try{
  const credit_card_bin=method==="card"?$("#post-card-number").value.replace(/\D/g,"").slice(0,6):undefined;
  const quote=postInstallmentQuote;
  const plan=quote?.plans.find(p=>p.installments===installments);
  if(method==="card"&&(!plan||!quote.offer_id||quote.chargeId!==activeCharge.id||quote.cardBin!==credit_card_bin))
    throw new Error("installment_quote_required");
  const encrypted_card=method==="card"?await encryptPostBookingCard():undefined;
  const d=await api("start_post_booking_payment",{charge_id:activeCharge.id,method,installments,credit_card_bin,
    installment_offer_id:quote?.offer_id,quoted_total_cents:plan?.total_cents,provider:"pagbank_sandbox",encrypted_card});
  if(activeCharge){
   activeCharge.status="processing";
   activeCharge.payment_id=d.payment?.id||activeCharge.payment_id||null;
   activeCharge.payments={...(activeCharge.payments||{}),status:d.payment?.status||"pending",method:d.payment?.method||method,installments:d.payment?.installments||installments};
   renderPendingPayments(reservationsCache);renderReservations(reservationsCache);
  }
  $("#post-payment-message").textContent="";
  renderPostBookingPagBankPayment(d.payment);
 }catch(e){
  if(e.message==="pagbank_start_uncertain"&&e.data?.payment_id){renderPostBookingPagBankPayment({id:e.data.payment_id});return}
  const msg={charge_expired:"O prazo desta cobrança expirou.",payment_provider_not_ready:"O pagamento ainda não está disponível.",invalid_installments:"Escolha um parcelamento válido.",installment_quote_required:"Consulte as parcelas no PagBank antes de pagar.",installment_quote_changed:"O valor das parcelas mudou. Consulte novamente antes de pagar.",invalid_test_card:"Confira os dados do cartão de teste."}[e.message]||"Não foi possível iniciar o pagamento.";
  $("#post-payment-message").textContent=msg;btn.disabled=false;
 }
}
function renderPostBookingPagBankPayment(payment){
 const box=$("#post-payment-sim");
 box.innerHTML='<div class="post-charge-summary"><span>PagBank sandbox · '+(payment.method==="card"?"Cartão":"Pix")+'</span><strong>'+brlC(payment.amount_cents||activeCharge?.amount_cents)+'</strong></div>'+
  (payment.pix_code?'<p>Pix copia e cola de teste:</p><textarea readonly aria-label="Pix copia e cola">'+esc(payment.pix_code)+'</textarea>':'')+
  '<p id="post-sandbox-status" role="status">Consultando a cobrança no PagBank…</p>';
 $("#post-pay-start").hidden=true;
 $("#post-card-fields").hidden=true;
 $("#post-installments-wrap").hidden=true;
 clearInterval(window.__postPagbankPoll);
 let failures=0;
 const finish=(message,allowRefresh=true)=>{
  const status=$("#post-sandbox-status");if(!status)return;
  status.textContent=message;
  clearInterval(window.__postPagbankPoll);
  if(allowRefresh){const button=document.createElement("button");button.type="button";button.className="primary-action compact";button.textContent="Ver resultado em Minhas Reservas";button.onclick=()=>location.reload();box.appendChild(button)}
 };
 const tick=async()=>{try{
  const s=await api("pagbank_sandbox_status",{payment_id:payment.id});
  failures=0;
  const status=$("#post-sandbox-status");if(!status)return;
  if(s.manual_review){finish("Pagamento recebido, mas a experiência requer conferência manual. Não pague novamente.");return}
  if(s.charge_status==="applied"){finish("Pagamento aprovado pelo PagBank. Experiência incluída na reserva.");return}
  if(["refused","cancelled","expired"].includes(s.payment_status)){
   finish("Pagamento recusado ou encerrado pelo PagBank. A experiência não foi incluída. Se o prazo estiver aberto, você poderá tentar novamente em Minhas Reservas.");return;
  }
  status.textContent=s.payment_status==="under_review"?"Pagamento em análise no PagBank. Aguarde a confirmação.":"Aguardando confirmação do PagBank…";
 }catch{
  failures++;
  if(failures>=3){finish("Não foi possível consultar o resultado agora. Não repita o pagamento antes de conferir Minhas Reservas.",false);
   const button=document.createElement("button");button.type="button";button.className="primary-action compact";button.textContent="Consultar novamente";button.onclick=()=>{button.remove();failures=0;tick()};box.appendChild(button)}
 }};
 tick();window.__postPagbankPoll=setInterval(tick,5000);
}
function renderPostBookingMockPayment(payment){
 const box=$("#post-payment-sim");
 box.innerHTML='<div class="mock-controls post-mock"><span>SIMULAR RESULTADO:</span><button data-post-outcome="paid">Aprovado</button><button data-post-outcome="under_review">Em análise</button><button data-post-outcome="refused">Recusado</button><button data-post-outcome="expired">Expirado</button></div>';
 box.querySelectorAll("[data-post-outcome]").forEach(b=>b.onclick=()=>handlePostPaymentOutcome(payment.id,b.dataset.postOutcome,box));
}
async function handlePostPaymentOutcome(paymentId,outcome,box){
 box.querySelectorAll("button").forEach(b=>b.disabled=true);
 $("#post-payment-message").textContent="Atualizando pagamento…";
 try{
  const d=await api("mock_payment",{payment_id:paymentId,outcome});
  if(outcome==="paid"){
   $("#post-payment-message").textContent="Pagamento aprovado. A cobrança foi aplicada à sua reserva.";
   setTimeout(()=>location.reload(),900);
  }else if(outcome==="under_review"){
   if(activeCharge){
    activeCharge.status=d.charge_status||"processing";
    activeCharge.payments={...(activeCharge.payments||{}),status:"under_review"};
    renderPendingPayments(reservationsCache);renderReservations(reservationsCache);
   }
   $("#post-payment-message").textContent="Pagamento em análise. A alteração/experiência ainda não foi aplicada.";
   box.querySelectorAll("button").forEach(b=>b.disabled=b.dataset.postOutcome==="under_review");
   location.reload();
  }else{
   $("#post-payment-message").textContent=(outcome==="refused"?"Pagamento recusado. ":"Pagamento expirado. ")+(d.charge_status==="awaiting_payment"?"Você ainda pode tentar novamente antes do prazo final.":"O prazo desta cobrança terminou.");
   setTimeout(()=>location.reload(),1200);
  }
 }catch(e){
  $("#post-payment-message").textContent=e.message==="charge_expired"?"O prazo desta cobrança expirou.":"Não foi possível atualizar o pagamento.";
  box.querySelectorAll("button").forEach(b=>b.disabled=false);
 }
}
async function confirmFreeCharge(chargeId,btn){
 if(!confirm("Confirmar esta alteração sem cobrança adicional?"))return;
 btn.disabled=true;
 try{await api("confirm_free_post_booking_charge",{charge_id:chargeId});location.reload()}
 catch(e){btn.disabled=false;alert(e.message==="dates_unavailable"?"As novas datas deixaram de estar disponíveis.":"Não foi possível confirmar a alteração agora.")}
}
async function cancelPendingCharge(chargeId,btn){
 if(!confirm("Cancelar esta cobrança pendente?"))return;
 btn.disabled=true;
 try{await api("cancel_post_booking_charge",{charge_id:chargeId});location.reload()}
 catch(e){btn.disabled=false;alert(e.message==="payment_processing"?"O pagamento está em análise e não pode ser cancelado neste momento.":"Não foi possível cancelar agora.")}
}

function guaranteeAttention(code){return {
 authorization_declined:"O banco recusou a caução. Sua reserva continua confirmada; atualize o cartão ou fale com o atendimento.",
 card_token_missing:"Informe um cartão para regularizar a caução desta reserva.",
 renewal_consent_required:"A autorização atual não cobre toda a estadia. Atualize o cartão e autorize a renovação, ou fale com o atendimento.",
 authorization_result_uncertain:"Estamos consultando o resultado com o PagBank. Uma nova autorização só será solicitada depois de esclarecer a anterior.",
 authorization_expired:"A autorização anterior venceu. A caução precisa ser regularizada.",
 authorization_attempts_exhausted:"O limite de tentativas foi atingido. Entre em contato com o atendimento.",
 authorization_cleanup_pending:"A nova garantia foi processada, mas a liberação do bloqueio anterior ainda precisa ser confirmada.",
 incident_requires_review:"Há uma ocorrência em análise. A equipe acompanhará a caução.",
 identity_unavailable:"Confira seus dados cadastrais com o atendimento para regularizar a caução.",
 captured_guarantee_dates_changed:"As datas mudaram após uma cobrança de dano. A equipe precisa revisar a garantia.",
 unexpected_provider_capture:"Há uma divergência na garantia em análise pela equipe."
 }[code]||"";}
function renderGuarantee(g,r){
 if(!g)return "";
 const amount=brlC(g.amount_cents),captured=Number(g.captured_amount_cents||0);
 const expiry=Date.parse(g.provider_capture_before||""),departure=Date.parse(r.check_out+"T"+String(r.properties?.check_out_time||"11:00").slice(0,5)+":00-03:00");
 const attention=guaranteeAttention(g.attention_code||g.provider_error_code);
 const text=g.status==="released"?"Garantia liberada.":g.status==="captured"?"Foi utilizado "+brlC(captured)+" em uma ocorrência registrada.":
  attention|| (g.status==="guaranteed"?(expiry<=Date.now()?"A autorização venceu; a caução precisa ser regularizada.":"Valor autorizado até "+fmtDateTime(g.provider_capture_before)+"."+(expiry<departure+3600000?" O prazo atual não cobre o fim da estadia; será necessária renovação ou avaliação da equipe.":"")):
  g.status==="pending"?"Pré-autorização programada para perto do check-in com o cartão desta reserva.":"Aguardando confirmação do PagBank.");
 const canUpdate=r.status==="confirmed"&&departure>Date.now()&&["pending","guaranteed"].includes(g.status);
 return '<div class="guest-guarantee"><small>GARANTIA DA HOSPEDAGEM · SANDBOX</small><strong>'+amount+'</strong><p>'+text+'</p><p>A autorização reserva temporariamente o limite do cartão. Danos comprovados podem gerar captura parcial ou integral. O valor da hospedagem é tratado separadamente.</p>'+
  (canUpdate?'<button type="button" data-guarantee-card="'+esc(g.id)+'">Atualizar cartão da caução</button>':"")+
  '<button type="button" data-guarantee-status="'+esc(g.id)+'">Consultar caução</button></div>';
}
function openGuaranteeCard(id){
 const r=reservationsCache.find(r=>(r.guarantees||[]).some(g=>g.id===id)),g=r?.guarantees.find(g=>g.id===id);if(!g)return;
 const modal=document.createElement("div");modal.className="booking-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label","Atualizar cartão da caução");
 modal.innerHTML='<div class="booking-panel post-payment-panel"><button type="button" class="modal-close" aria-label="Fechar">×</button><small>CAUÇÃO · '+esc(r.confirmation_code)+'</small><h2>Atualizar cartão</h2><p>Valor da caução: '+brlC(g.amount_cents)+'. O PagBank guarda o cartão. O site guarda apenas um token vinculado a esta reserva.</p><form class="account-form"><label>Nome no cartão<input name="holder" autocomplete="cc-name" required></label><label>Número do cartão<input name="number" inputmode="numeric" autocomplete="cc-number" required></label><label>Mês<input name="month" inputmode="numeric" autocomplete="cc-exp-month" maxlength="2" required></label><label>Ano<input name="year" inputmode="numeric" autocomplete="cc-exp-year" maxlength="4" required></label><label>Código de segurança<input name="cvv" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></label><label><input name="consent" type="checkbox" required> Autorizo o uso deste cartão exclusivamente para a caução desta reserva e eventuais danos comprovados.</label><label><input name="renewal" type="checkbox"> Autorizo renovações durante esta estadia. Entendo que duas autorizações podem bloquear temporariamente até '+brlC(Number(g.amount_cents)*2)+' do limite, até a confirmação da liberação anterior.</label><p>Uma autorização já ativa continua válida. A troca será usada na próxima solicitação necessária.</p><p class="form-result" role="status"></p><button class="primary-action" type="submit">Salvar cartão da caução</button></form></div>';
 document.body.appendChild(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();
 const form=modal.querySelector('form'),fields=form.elements;fields.holder.value=profile?.full_name||"";fields.holder.focus();
 form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button'),message=form.querySelector('.form-result');btn.disabled=true;message.textContent="Validando cartão com o PagBank…";
  try{
   const key=await api("pagbank_sandbox_card_key");await loadPagBankCardSdk();
   const card=window.PagSeguro.encryptCard({publicKey:key.public_key,holder:fields.holder.value.trim(),number:fields.number.value.replace(/\D/g,""),expMonth:fields.month.value,expYear:fields.year.value,securityCode:fields.cvv.value});
   if(card.hasErrors||!card.encryptedCard)throw new Error("invalid_card");
   ["number","month","year","cvv"].forEach(n=>fields[n].value="");
   await guaranteeApi("replace_card",{guarantee_id:id,operation_key:crypto.randomUUID(),encrypted_card:card.encryptedCard,consent:fields.consent.checked,renewal_consent:fields.renewal.checked});
   message.textContent="Cartão atualizado. Consultando a caução…";await boot();modal.remove();
  }catch(error){message.textContent=error.message==="invalid_card"?"Confira os dados do cartão.":error.message==="card_update_unavailable"?"Há uma operação em andamento ou uma tentativa recente. Aguarde um minuto e consulte a caução.":"O cartão não foi atualizado. A reserva continua válida. Consulte a caução ou tente novamente mais tarde.";btn.disabled=false;}
 };
}
function renderModification(m){
 const target=properties.find(p=>Number(p.id)===Number(m.requested_property_id))?.name||"propriedade solicitada";
 const estimate=Number(m.estimated_additional_amount_cents||0),approved=Number(m.admin_additional_amount_cents||0);
 const charge=chargeForModification(m);
 let valueLine="",actions="";
 if(m.status==="quoted"||m.status==="requested"){
  valueLine='<div class="mod-price"><span>Reajuste estimado da diária</span><strong>'+brlC(estimate)+'</strong><small>A solicitação ainda está em análise e <strong>não bloqueia nem garante</strong> as novas datas. Sua reserva atual continua válida.</small></div>';
  actions='<div class="mod-actions"><button class="text-action danger" data-cancel-mod="'+m.id+'">Cancelar solicitação</button></div>';
 }else if(m.status==="awaiting_payment"){
  const due=fmtDateTime(charge?.expires_at||m.payment_due_at);
  const payText=approved>0
   ?'Esta alteração foi aprovada e gerará uma cobrança adicional de reajuste da diária. <strong>Ela só será confirmada depois do pagamento.</strong> As novas datas estão protegidas até '+due+'. Se não houver pagamento até esse prazo, a solicitação será cancelada automaticamente.'
   :'Esta alteração foi aprovada sem cobrança adicional. As novas datas estão protegidas até '+due+'. Confirme a alteração dentro do prazo.';
  valueLine='<div class="mod-price approved"><span>'+(approved>0?'Pagamento necessário':'Confirmação necessária')+'</span><strong>'+(approved>0?brlC(approved):'Sem cobrança adicional')+'</strong><small>'+payText+'</small></div>';
  const primary=chargeUnderReview(charge)
   ?'<span class="payment-review-state">Pagamento em análise</span>'
   :approved>0
   ?'<button class="primary-action compact" data-pay-charge="'+(charge?.id||m.payment_charge_id)+'">Ir para pagamento · '+brlC(approved)+'</button>'
   :'<button class="primary-action compact" data-confirm-free-charge="'+(charge?.id||m.payment_charge_id)+'">Confirmar alteração</button>';
  actions='<div class="mod-actions">'+primary+(chargeUnderReview(charge)?'':'<button class="text-action danger" data-cancel-mod="'+m.id+'">Cancelar solicitação</button>')+'</div>';
 }else if(m.status==="payment_expired"){
  valueLine='<div class="mod-price"><span>Solicitação cancelada</span><strong>Prazo de pagamento encerrado</strong><small>A alteração não foi aplicada. Sua reserva original permaneceu válida.</small></div>';
 }else if(m.status==="awaiting_guest_acceptance"){
  valueLine='<div class="mod-price approved"><span>Confirmação pendente</span><strong>'+brlC(approved)+'</strong><small>Solicitação criada antes do novo fluxo de pagamento.</small></div>';
  actions='<div class="mod-actions"><button class="primary-action compact" data-accept-mod="'+m.id+'" data-accept-amount="'+approved+'">Confirmar</button><button class="text-action danger" data-cancel-mod="'+m.id+'">Cancelar solicitação</button></div>';
 }else if(m.status==="accepted"){
  valueLine='<div class="mod-price approved"><span>Alteração aceita</span><strong>'+brlC(approved)+'</strong><small>Aguardando aplicação.</small></div>';
 }else if(m.status==="applied"){
  valueLine='<div class="mod-price applied"><span>Revisão de tarifa aplicada</span><strong>+'+brlC(approved)+'</strong><small>Alteração confirmada. Depois do pagamento/aplicação, ela não pode mais ser cancelada pelo hóspede.</small></div>';
 }
 return '<div class="mod-status"><small>ALTERAÇÃO · '+statusLabel(m.status).toUpperCase()+'</small><p><strong>'+target+'</strong><br>'+(m.requested_check_in?m.requested_check_in.split("-").reverse().join("/"):"")+' → '+(m.requested_check_out?m.requested_check_out.split("-").reverse().join("/"):"")+'</p>'+valueLine+(m.admin_note?'<p>'+esc(m.admin_note)+'</p>':'')+actions+'</div>';
}
async function acceptModification(id,btn){
 const amount=Number(btn.dataset.acceptAmount||0);
 const message=amount>0
   ?"Esta alteração gerará uma cobrança adicional de reajuste da diária no valor de "+brlC(amount)+".\n\nDeseja confirmar a alteração e esse valor adicional?"
   :"Esta alteração foi aprovada sem cobrança adicional. Deseja confirmar?";
 if(!confirm(message))return;
 btn.disabled=true;
 try{await api("modification_action",{operation:"guest_accept",request_id:id});location.reload()}
 catch(e){btn.disabled=false;alert("Não foi possível confirmar a alteração agora. Tente novamente.")}
}
async function cancelModification(id,btn){btn.disabled=true;try{await api("modification_action",{operation:"guest_cancel",request_id:id});location.reload()}catch(e){btn.disabled=false;alert("Não foi possível cancelar a solicitação agora. Tente novamente.")}}
$("#profile-form").addEventListener("submit",async e=>{e.preventDefault();const {error}=await sb.from("profiles").update({full_name:$("#profile-name").value.trim(),phone:$("#profile-phone").value.trim()}).eq("id",session.user.id);$("#account-message").textContent=error?"Não foi possível atualizar seus dados agora. Tente novamente.":"Dados atualizados."});
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.href="auth.html"});
$("#delete-account").addEventListener("click",async()=>{const {error}=await sb.from("account_deletion_requests").insert({user_id:session.user.id});$("#account-message").textContent=error?"Não foi possível registrar a solicitação agora. Tente novamente.":"Solicitação de exclusão registrada para análise."});
function openModification(reservationId,currentProperty,currentIn,currentOut){
 $("#modify-reservation-id").value=reservationId;$("#modify-current").innerHTML='<strong>Reserva atual</strong><span>'+properties.find(p=>Number(p.id)===Number(currentProperty))?.name+' · '+currentIn.split("-").reverse().join("/")+' → '+currentOut.split("-").reverse().join("/")+'</span>';
 const s=$("#modify-property");s.innerHTML=properties.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(currentProperty)?"selected":"")+'>'+p.name+'</option>').join("");
 const today=new Date().toISOString().slice(0,10);$("#modify-in").value="";$("#modify-out").value="";$("#modify-in").min=today;$("#modify-out").min=today;$("#modify-in").onchange=()=>{$("#modify-out").min=$("#modify-in").value||today;if($("#modify-out").value&&$("#modify-out").value<=$("#modify-in").value)$("#modify-out").value=""};
 $("#modify-result").textContent="";$("#modify-modal").hidden=false;
}
$("#modify-close").addEventListener("click",()=>$("#modify-modal").hidden=true);
$("#experience-shop-close")?.addEventListener("click",()=>$("#experience-shop-modal").hidden=true);
$("#post-payment-close")?.addEventListener("click",()=>{$("#post-payment-modal").hidden=true;activeCharge=null});
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const btn=e.submitter;if(!$("#modify-in").value||!$("#modify-out").value||$("#modify-out").value<=$("#modify-in").value){$("#modify-result").textContent="Escolha novas datas válidas.";return}btn.disabled=true;$("#modify-result").textContent="Enviando solicitação de alteração…";
 try{const d=await api("request_modification",{reservation_id:$("#modify-reservation-id").value,requested_check_in:$("#modify-in").value,requested_check_out:$("#modify-out").value,requested_property_id:Number($("#modify-property").value)});track("modification_requested",{reservation_id:$("#modify-reservation-id").value,metadata:{request_type:d.request?.request_type||null}});$("#modify-result").innerHTML='Solicitação registrada. <strong>Ela não bloqueia nem garante as novas datas.</strong> Sua reserva atual continua exatamente como está.<br>Reajuste estimado da diária: <strong>'+brlC(d.request.estimated_additional_amount_cents||0)+'</strong>. Se você aprovar a condição enviada pela operação, as novas datas serão protegidas temporariamente e, havendo diferença, a alteração só será confirmada após o pagamento no site dentro do prazo informado.';setTimeout(()=>location.reload(),2200)}
 catch(err){
  if(err.message==="modification_already_open") $("#modify-result").textContent="Já existe uma solicitação de alteração em andamento. Cancele ou conclua a anterior antes de fazer outra.";
  else if(err.message==="occupied") $("#modify-result").textContent="A nova opção não está disponível para essas datas.";
  else if(err.message==="minimum_stay"){
    const min=Number(err.data?.min_stay||1);
    $("#modify-result").textContent="Para estas datas, o mínimo de estadia deste chalé é de "+min+" "+(min===1?"noite":"noites")+". Escolha um período maior.";
  } else $("#modify-result").textContent="Não foi possível solicitar a alteração. Tente novamente.";
  btn.disabled=false
}
});
boot();
})();
