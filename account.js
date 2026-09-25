(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nights=(a,b)=>Math.max(1,Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000));
let session=null,profile=null,properties=[],mods=[],charges=[],cartItems=[],reservationsCache=[],shopReservationId=null,paymentSettings={},activeCharge=null;
const esc=v=>String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
let anonymousId="";
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
async function api(action,body={}){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers,body:JSON.stringify({action,...body})});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});return d}
function track(event_name,payload={}){api("track",{event_name,anonymous_id:anonymousId,...payload}).catch(()=>{})}
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando pagamento",expired:"Expirada",cancelled:"Cancelada",quoted:"Em análise",awaiting_guest_acceptance:"Aguardando sua confirmação",awaiting_payment:"Aguardando pagamento",payment_expired:"Cancelada por falta de pagamento",accepted:"Aceita",applied:"Aplicada",rejected:"Recusada",requested:"Solicitada"}[s]||s);
const fmtDateTime=v=>v?new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
async function boot(){
 const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:p},{data:reservations},{data:props},{data:m},{data:ch},{data:cart},cfg]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,property_id,check_in,check_out,status,guests,rate_plan_code,stay_amount,experience_amount,total_amount,created_at,properties(name,cover_image),payments(id,status,amount_cents,method,installments),guarantees(status,amount_cents,captured_amount_cents),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("created_at",{ascending:false}),
  sb.from("properties").select("id,name,active").eq("active",true).order("id"),
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
 const requestedCharge=new URLSearchParams(location.search).get("charge");
 if(requestedCharge){
  const charge=charges.find(x=>String(x.id)===String(requestedCharge)&&["awaiting_payment","processing"].includes(x.status));
  if(charge)setTimeout(()=>openChargePayment(charge),100);
 }
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
function fmtDate(v){return v?new Date(v).toLocaleDateString("pt-BR"):"—"}
function reservationStatus(r){
 const pending=liveCharges(r.id),active=activeModification(r.id);
 const now=Date.now(),checkIn=Date.parse(r.check_in+"T15:00:00-03:00"),checkOut=Date.parse(r.check_out+"T11:00:00-03:00");
 if(pending.length) return {label:"Pagamento pendente",tone:"action",priority:0,needsAction:true};
 if(active?.status==="awaiting_payment") return {label:"Alteração aguardando pagamento",tone:"action",priority:0,needsAction:true};
 if(active&&["requested","quoted","awaiting_guest_acceptance","accepted"].includes(active.status)) return {label:"Alteração em análise",tone:"info",priority:1,needsAction:true};
 if(r.status==="pending_payment") return {label:"Aguardando pagamento",tone:"action",priority:0,needsAction:true};
 if(r.status==="expired") return {label:"Expirada",tone:"muted",priority:4,needsAction:false};
 if(r.status==="cancelled") return {label:"Cancelada",tone:"muted",priority:4,needsAction:false};
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
   const targetPeriod=charge.kind==="modification"&&charge.snapshot?.target_check_in&&charge.snapshot?.target_check_out
     ?charge.snapshot.target_check_in.split("-").reverse().join("/")+" → "+charge.snapshot.target_check_out.split("-").reverse().join("/")
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
  const expItems=(r.experience_orders||[]).flatMap(o=>o.experience_order_items||[]).filter(i=>i.status==="active");
  const pendingExperienceCharges=liveCharges(r.id).filter(c=>["experience_add","experience_upgrade"].includes(c.kind));
  const guarantee=(r.guarantees||[])[0],n=nights(r.check_in,r.check_out),per=Number(r.stay_amount||0)/n;
  const paid=(r.payments||[]).some(p=>p.status==="paid");
  const appliedRevision=mods.filter(m=>m.reservation_id===r.id&&m.status==="applied").reduce((sum,m)=>sum+Number(m.admin_additional_amount_cents||0),0);
  const art=document.createElement("details");art.className="account-reservation reservation-accordion";art.dataset.status=ux.tone;
  if(String(r.id)===String(defaultOpen))art.open=true;
  const expRows=expItems.map(i=>'<div class="reservation-breakdown-row"><span>'+esc(i.product_name_snapshot)+'</span><strong>'+brlC(Number(i.unit_price_cents))+'</strong></div>').join("");
  const revisionRow=appliedRevision>0?'<div class="reservation-breakdown-row tariff-revision"><span>Revisão de tarifa da alteração</span><strong>+'+brlC(appliedRevision)+'</strong></div>':"";
  const pendingCharges=pendingExperienceCharges.map(renderPendingExperienceCharge).join("");
  const canShop=r.status==="confirmed"&&Date.parse(r.check_in+"T15:00:00-03:00")>Date.now();
  const experienceAction=canShop?'<button class="reservation-action experience-action" data-experience-shop="'+r.id+'">Adicionar experiência</button>':"";
  const modificationAction=!active&&r.status==="confirmed"?'<button class="reservation-action modification-action" data-modify="'+r.id+'" data-property="'+r.property_id+'" data-in="'+r.check_in+'" data-out="'+r.check_out+'">Solicitar alteração</button>':"";
  const reservationActions=(experienceAction||modificationAction)?'<div class="reservation-actions">'+experienceAction+modificationAction+'</div>':"";
  const period=r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/");
  art.innerHTML='<summary class="reservation-summary"><div class="reservation-summary-copy"><strong>'+esc(r.properties?.name||"Reserva")+'</strong><span>Reserva em '+fmtDate(r.created_at)+' · Estadia '+period+'</span></div><span class="reservation-status-badge '+ux.tone+'">'+ux.label+'</span><span class="reservation-summary-arrow">⌄</span></summary><div class="reservation-detail-grid"><img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div class="reservation-detail-copy"><small>'+ux.label.toUpperCase()+'</small><h3>'+esc(r.properties?.name||"Reserva")+'</h3><p>'+period+' · '+r.guests+' hóspedes</p><div class="reservation-breakdown"><div class="reservation-breakdown-row"><span>Hospedagem · '+n+' noites<small>'+brl(per)+' por noite</small></span><strong>'+brl(r.stay_amount)+'</strong></div>'+expRows+revisionRow+'<div class="reservation-breakdown-total"><span>'+(paid?"TOTAL PAGO":"TOTAL DA RESERVA")+'</span><strong>'+brl(r.total_amount)+'</strong></div></div><span>Código '+(r.confirmation_code||"—")+'</span>'+renderGuarantee(guarantee)+pendingCharges+reservationActions+(active?renderModification(active):"")+(history.length?'<details class="mod-history"><summary>Histórico de alterações</summary>'+history.map(renderModification).join("")+'</details>':'')+'</div></div>';
  box.appendChild(art);
 });
 box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify,b.dataset.property,b.dataset.in,b.dataset.out)));
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
 const maxInst=Math.max(1,Number(paymentSettings.max_card_installments||1));
 const opts=Array.from({length:maxInst},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'x</option>').join("");
 const rule=isModification
  ?'A alteração só será confirmada depois do pagamento. As novas datas estão protegidas até <strong>'+deadline+'</strong>. Se o pagamento não for concluído até esse prazo, a solicitação será cancelada automaticamente e sua reserva original continuará válida.'
  :'A experiência ou upgrade só será incluído no valor pago e na reserva depois da confirmação do pagamento.';
 content.innerHTML='<small>COBRANÇA DA RESERVA</small><h2>Ir para pagamento</h2><div class="post-charge-summary"><span>'+esc(charge.description||"Cobrança adicional")+'</span><strong>'+brlC(amount)+'</strong></div><p>'+rule+'</p><div class="post-payment-methods"><label><input type="radio" name="post-method" value="pix" checked> Pix</label><label><input type="radio" name="post-method" value="card"> Cartão</label></div><label id="post-installments-wrap" hidden>Parcelamento<select id="post-installments">'+opts+'</select></label><button class="primary-action" id="post-pay-start">Ir para pagamento</button><div id="post-payment-sim"></div><p id="post-payment-message" class="form-result"></p>';
 content.querySelectorAll('input[name="post-method"]').forEach(r=>r.onchange=()=>$("#post-installments-wrap").hidden=r.value!=="card"||!r.checked);
 $("#post-pay-start").onclick=startChargePayment;
}
async function startChargePayment(){
 const btn=$("#post-pay-start");btn.disabled=true;$("#post-payment-message").textContent="Preparando pagamento…";
 const method=document.querySelector('input[name="post-method"]:checked')?.value||"pix";
 const installments=method==="card"?Number($("#post-installments").value||1):1;
 try{
  const d=await api("start_post_booking_payment",{charge_id:activeCharge.id,method,installments});
  if(activeCharge){
   activeCharge.status="processing";
   activeCharge.payment_id=d.payment?.id||activeCharge.payment_id||null;
   activeCharge.payments={...(activeCharge.payments||{}),status:d.payment?.status||"pending",method:d.payment?.method||method,installments:d.payment?.installments||installments};
   renderPendingPayments(reservationsCache);renderReservations(reservationsCache);
  }
  $("#post-payment-message").textContent="";
  renderPostBookingMockPayment(d.payment);
 }catch(e){
  const msg={charge_expired:"O prazo desta cobrança expirou.",payment_provider_not_ready:"O pagamento ainda não está disponível.",invalid_installments:"Escolha um parcelamento válido."}[e.message]||"Não foi possível iniciar o pagamento.";
  $("#post-payment-message").textContent=msg;btn.disabled=false;
 }
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

function renderGuarantee(g){
 if(!g)return "";
 const amount=brlC(g.amount_cents),captured=Number(g.captured_amount_cents||0);
 let text=g.status==="released"?"Garantia liberada.":g.status==="captured"?"Foi utilizado "+brlC(captured)+" em uma ocorrência registrada.":"A pré-autorização será solicitada antes do check-in.";
 return '<div class="guest-guarantee"><small>GARANTIA DA HOSPEDAGEM</small><strong>'+amount+'</strong><p>'+text+' Não é uma cobrança e nenhum valor é capturado ao criar a garantia. O valor só poderá ser utilizado, total ou parcialmente, em caso de dano ou ocorrência comprovada. Sem ocorrência, a garantia é liberada. Dependendo do banco emissor, pode haver reserva temporária desse valor no limite do cartão.</p></div>';
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
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const btn=e.submitter;if(!$("#modify-in").value||!$("#modify-out").value||$("#modify-out").value<=$("#modify-in").value){$("#modify-result").textContent="Escolha novas datas válidas.";return}btn.disabled=true;$("#modify-result").textContent="Consultando disponibilidade e nova condição…";
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
