(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nights=(a,b)=>Math.max(1,Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000));
let session=null,profile=null,properties=[],mods=[],shopReservationId=null;
const esc=v=>String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
let anonymousId="";
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
async function api(action,body={}){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers,body:JSON.stringify({action,...body})});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});return d}
function track(event_name,payload={}){api("track",{event_name,anonymous_id:anonymousId,...payload}).catch(()=>{})}
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando pagamento",expired:"Expirada",cancelled:"Cancelada",quoted:"Em análise",awaiting_guest_acceptance:"Aguardando sua confirmação",accepted:"Aceita",applied:"Aplicada",rejected:"Recusada",requested:"Solicitada"}[s]||s);
async function boot(){
 const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:p},{data:reservations},{data:props},{data:m}]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,property_id,check_in,check_out,status,guests,rate_plan_code,stay_amount,experience_amount,total_amount,created_at,properties(name,cover_image),payments(status,amount_cents),guarantees(status,amount_cents,captured_amount_cents),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("check_in",{ascending:false}),
  sb.from("properties").select("id,name,active").eq("active",true).order("id"),
  sb.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,original_amount_cents,reference_amount_cents,estimated_additional_amount_cents,admin_additional_amount_cents,status,admin_note,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false})
 ]);
 profile=p;properties=props||[];mods=m||[];$("#profile-name").value=profile?.full_name||"";$("#profile-phone").value=profile?.phone||"";
 if(profile?.role==="admin"){$("#ops-link").hidden=false;$("#experience-admin-link").hidden=false}
 renderReservations(reservations||[]);
}
function activeModification(reservationId){return mods.find(m=>m.reservation_id===reservationId&&["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status))}
function renderReservations(reservations){
 const box=$("#reservation-list");box.innerHTML="";if(!reservations.length){box.innerHTML='<div class="empty-state">Você ainda não tem reservas vinculadas a esta conta.</div>';return}
 reservations.forEach(r=>{
  const active=activeModification(r.id),history=mods.filter(m=>m.reservation_id===r.id&&!["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status)).slice(0,2);
  const expItems=(r.experience_orders||[]).flatMap(o=>o.experience_order_items||[]);
  const guarantee=(r.guarantees||[])[0],n=nights(r.check_in,r.check_out),per=Number(r.stay_amount||0)/n;
  const paid=(r.payments||[]).some(p=>p.status==="paid");
  const appliedRevision=mods.filter(m=>m.reservation_id===r.id&&m.status==="applied").reduce((sum,m)=>sum+Number(m.admin_additional_amount_cents||0),0);
  const art=document.createElement("article");art.className="account-reservation";
  const expRows=expItems.map(i=>'<div class="reservation-breakdown-row"><span>'+i.product_name_snapshot+'</span><strong>'+brlC(Number(i.unit_price_cents)*1)+'</strong></div>').join("");
  const revisionRow=appliedRevision>0?'<div class="reservation-breakdown-row tariff-revision"><span>Revisão de tarifa da alteração</span><strong>+'+brlC(appliedRevision)+'</strong></div>':"";
  const canShop=r.status==="confirmed"&&Date.parse(r.check_in+"T15:00:00-03:00")>Date.now();
  const experienceAction=canShop?'<button class="text-action guest-experience-open" data-experience-shop="'+r.id+'">Adicionar experiência</button>':"";
  art.innerHTML='<img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div><small>'+statusLabel(r.status).toUpperCase()+'</small><h3>'+r.properties?.name+'</h3><p>'+r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/")+' · '+r.guests+' hóspedes</p><div class="reservation-breakdown"><div class="reservation-breakdown-row"><span>Hospedagem · '+n+' noites<small>'+brl(per)+' por noite</small></span><strong>'+brl(r.stay_amount)+'</strong></div>'+expRows+revisionRow+'<div class="reservation-breakdown-total"><span>'+(paid?"TOTAL PAGO":"TOTAL DA RESERVA")+'</span><strong>'+brl(r.total_amount)+'</strong></div></div><span>Código '+(r.confirmation_code||"—")+'</span>'+renderGuarantee(guarantee)+experienceAction+(active?renderModification(active):'<button class="text-action" data-modify="'+r.id+'" data-property="'+r.property_id+'" data-in="'+r.check_in+'" data-out="'+r.check_out+'">Solicitar alteração</button>')+(history.length?'<details class="mod-history"><summary>Histórico de alterações</summary>'+history.map(renderModification).join("")+'</details>':'')+'</div>';
  box.appendChild(art);
 });
 box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify,b.dataset.property,b.dataset.in,b.dataset.out)));
 box.querySelectorAll("[data-accept-mod]").forEach(b=>b.addEventListener("click",()=>acceptModification(b.dataset.acceptMod,b)));
 box.querySelectorAll("[data-cancel-mod]").forEach(b=>b.addEventListener("click",()=>cancelModification(b.dataset.cancelMod,b)));
 box.querySelectorAll("[data-experience-shop]").forEach(b=>b.addEventListener("click",()=>openExperienceShop(b.dataset.experienceShop)));
}

async function openExperienceShop(reservationId){
 shopReservationId=reservationId;
 $("#experience-shop-modal").hidden=false;
 $("#guest-experience-list").innerHTML='<div class="loading-state">Buscando experiências disponíveis…</div>';
 $("#guest-experience-message").textContent="";
 try{
  const d=await api("guest_experience_catalog",{reservation_id:reservationId});
  renderGuestExperiences(d.items||[]);
  track("experience_viewed",{reservation_id:reservationId,metadata:{source:"post_booking",available_count:(d.items||[]).length}});
 }catch(e){
  $("#guest-experience-list").innerHTML='<div class="empty-state">Não foi possível carregar as experiências agora.</div>';
 }
}
function renderGuestExperiences(items){
 const box=$("#guest-experience-list");
 if(!items.length){box.innerHTML='<div class="empty-state">Não há novas experiências disponíveis para esta reserva neste momento.</div>';return}
 box.innerHTML=items.map(item=>{
  const photos=(item.media||[]).slice(0,5).map(m=>'<img src="'+esc(m.media_url)+'" alt="'+esc(m.alt_text||item.name)+'" loading="lazy">').join("");
  return '<article class="guest-experience-card"><div class="guest-experience-gallery">'+photos+'</div><div class="guest-experience-copy"><small>'+esc(String(item.package_type||"experiência").toUpperCase())+'</small><h3>'+esc(item.name)+'</h3>'+(item.sales_headline?'<strong>'+esc(item.sales_headline)+'</strong>':'')+'<p>'+esc(item.description||"")+'</p><div class="guest-experience-buy"><span>'+brlC(item.price_cents)+'</span><button class="primary-action compact" data-buy-experience="'+esc(item.variant_id)+'" data-product="'+esc(item.product_id)+'" data-name="'+esc(item.name)+'" data-price="'+Number(item.price_cents||0)+'">Adicionar</button></div></div></article>';
 }).join("");
 box.querySelectorAll("[data-buy-experience]").forEach(b=>b.addEventListener("click",()=>purchaseGuestExperience(b)));
}
async function purchaseGuestExperience(btn){
 const amount=Number(btn.dataset.price||0),name=btn.dataset.name||"experiência";
 if(!confirm("Adicionar "+name+" por "+brlC(amount)+" à sua reserva?"))return;
 btn.disabled=true;$("#guest-experience-message").textContent="Adicionando experiência…";
 try{
  const d=await api("purchase_post_booking_experience",{reservation_id:shopReservationId,variant_id:btn.dataset.buyExperience});
  $("#guest-experience-message").textContent="Experiência adicionada à reserva por "+brlC(d.amount_cents)+".";
  track("experience_added",{reservation_id:shopReservationId,metadata:{source:"post_booking",product_id:btn.dataset.product,amount_cents:Number(d.amount_cents||0)}});
  setTimeout(()=>location.reload(),900);
 }catch(e){
  const messages={experience_already_added:"Esta experiência já está na sua reserva.",experience_lead_time:"O prazo mínimo para adicionar esta experiência já passou.",experience_out_of_stock:"Esta experiência não está disponível no momento.",experience_capacity_reached:"A capacidade desta experiência para sua data foi atingida.",payment_provider_not_ready:"A compra desta experiência ainda não está disponível."};
  $("#guest-experience-message").textContent=messages[e.message]||"Não foi possível adicionar a experiência agora.";
  btn.disabled=false;
 }
}
function renderGuarantee(g){
 if(!g)return "";
 const amount=brlC(g.amount_cents),captured=Number(g.captured_amount_cents||0);
 let text=g.status==="released"?"Garantia liberada.":g.status==="captured"?"Foi utilizado "+brlC(captured)+" em uma ocorrência registrada.":"A pré-autorização será solicitada antes do check-in.";
 return '<div class="guest-guarantee"><small>GARANTIA DA HOSPEDAGEM</small><strong>'+amount+'</strong><p>'+text+' Não é uma cobrança e nenhum valor é capturado ao criar a garantia. O valor só poderá ser utilizado, total ou parcialmente, em caso de dano ou ocorrência comprovada. Sem ocorrência, a garantia é liberada. Dependendo do banco emissor, pode haver reserva temporária desse valor no limite do cartão.</p></div>';
}
function renderModification(m){
 const target=properties.find(p=>Number(p.id)===Number(m.requested_property_id))?.name||"propriedade solicitada";
 const estimate=Number(m.estimated_additional_amount_cents||0);
 let valueLine="";
 if(m.status==="quoted"||m.status==="requested"){
   valueLine='<div class="mod-price"><span>Reajuste estimado da diária</span><strong>'+brlC(estimate)+'</strong><small>Esta alteração solicitada poderá gerar uma cobrança adicional de reajuste da diária neste valor. O valor final será confirmado após a análise.</small></div>';
 }else if(m.status==="awaiting_guest_acceptance"){
   const approved=Number(m.admin_additional_amount_cents||0);
   valueLine='<div class="mod-price approved"><span>Cobrança adicional da alteração</span><strong>'+brlC(approved)+'</strong><small>Esta alteração gerará uma cobrança adicional de reajuste da diária no valor acima. Ao aceitar, você concorda com esse acréscimo na reserva.</small></div>';
 }else if(m.status==="accepted"){
   valueLine='<div class="mod-price approved"><span>Valor da alteração aceito</span><strong>'+brlC(Number(m.admin_additional_amount_cents||0))+'</strong><small>Aguardando aplicação da alteração.</small></div>';
 }else if(m.status==="applied"){
   valueLine='<div class="mod-price applied"><span>Revisão de tarifa aplicada</span><strong>'+brlC(Number(m.admin_additional_amount_cents||0))+'</strong></div>';
 }
 const acceptedAmount=Number(m.admin_additional_amount_cents||0);
 const acceptLabel=acceptedAmount>0?"Aceitar alteração + "+brlC(acceptedAmount):"Aceitar alteração sem cobrança adicional";
 const actions=["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status)?'<div class="mod-actions">'+(m.status==="awaiting_guest_acceptance"?'<button class="primary-action compact" data-accept-mod="'+m.id+'" data-accept-amount="'+acceptedAmount+'">'+acceptLabel+'</button>':'')+'<button class="text-action danger" data-cancel-mod="'+m.id+'">Cancelar solicitação</button></div>':"";
 return '<div class="mod-status"><small>ALTERAÇÃO · '+statusLabel(m.status).toUpperCase()+'</small><p><strong>'+target+'</strong><br>'+(m.requested_check_in?m.requested_check_in.split("-").reverse().join("/"):"")+' → '+(m.requested_check_out?m.requested_check_out.split("-").reverse().join("/"):"")+'</p>'+valueLine+(m.admin_note?'<p>'+m.admin_note+'</p>':'')+actions+'</div>';
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
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const btn=e.submitter;if(!$("#modify-in").value||!$("#modify-out").value||$("#modify-out").value<=$("#modify-in").value){$("#modify-result").textContent="Escolha novas datas válidas.";return}btn.disabled=true;$("#modify-result").textContent="Consultando disponibilidade e nova condição…";
 try{const d=await api("request_modification",{reservation_id:$("#modify-reservation-id").value,requested_check_in:$("#modify-in").value,requested_check_out:$("#modify-out").value,requested_property_id:Number($("#modify-property").value)});track("modification_requested",{reservation_id:$("#modify-reservation-id").value,metadata:{request_type:d.request?.request_type||null}});$("#modify-result").innerHTML='Solicitação registrada. <strong>Sua reserva atual continua exatamente como está.</strong><br>Reajuste estimado da diária: <strong>'+brlC(d.request.estimated_additional_amount_cents||0)+'</strong>. Se a alteração for aprovada, o valor final será apresentado para sua confirmação antes de qualquer cobrança.';setTimeout(()=>location.reload(),2200)}
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