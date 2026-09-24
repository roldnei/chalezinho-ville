(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nights=(a,b)=>Math.max(1,Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000));
let session=null,profile=null,properties=[],mods=[];
async function api(action,body={}){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers,body:JSON.stringify({action,...body})});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});return d}
const statusLabel=s=>({confirmed:"Confirmada",pending_payment:"Aguardando pagamento",expired:"Expirada",cancelled:"Cancelada",quoted:"Em análise",awaiting_guest_acceptance:"Aguardando sua confirmação",accepted:"Aceita",applied:"Aplicada",rejected:"Recusada",requested:"Solicitada"}[s]||s);
async function boot(){
 const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:p},{data:reservations},{data:props},{data:m}]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,property_id,check_in,check_out,status,guests,rate_plan_code,accommodation_amount,cleaning_fee,experience_amount,total_amount,created_at,properties(name,cover_image),payments(status,amount_cents),guarantees(status,amount_cents,captured_amount_cents),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("check_in",{ascending:false}),
  sb.from("properties").select("id,name,active").eq("active",true).order("id"),
  sb.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,original_amount_cents,reference_amount_cents,admin_additional_amount_cents,status,admin_note,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false})
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
  const guarantee=(r.guarantees||[])[0],n=nights(r.check_in,r.check_out),per=Number(r.accommodation_amount||0)/n;
  const paid=(r.payments||[]).some(p=>p.status==="paid");
  const art=document.createElement("article");art.className="account-reservation";
  const expRows=expItems.map(i=>'<div class="reservation-breakdown-row"><span>'+i.product_name_snapshot+'</span><strong>'+brlC(Number(i.unit_price_cents)*1)+'</strong></div>').join("");
  art.innerHTML='<img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div><small>'+statusLabel(r.status).toUpperCase()+'</small><h3>'+r.properties?.name+'</h3><p>'+r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/")+' · '+r.guests+' hóspedes</p><div class="reservation-breakdown"><div class="reservation-breakdown-row"><span>Hospedagem · '+n+' noites<small>'+brl(per)+' por noite</small></span><strong>'+brl(r.accommodation_amount)+'</strong></div><div class="reservation-breakdown-row"><span>Taxa de limpeza</span><strong>'+brl(r.cleaning_fee)+'</strong></div>'+expRows+'<div class="reservation-breakdown-total"><span>'+(paid?"TOTAL PAGO":"TOTAL DA RESERVA")+'</span><strong>'+brl(r.total_amount)+'</strong></div></div><span>Código '+(r.confirmation_code||"—")+'</span>'+renderGuarantee(guarantee)+(active?renderModification(active):'<button class="text-action" data-modify="'+r.id+'" data-property="'+r.property_id+'" data-in="'+r.check_in+'" data-out="'+r.check_out+'">Solicitar alteração</button>')+(history.length?'<details class="mod-history"><summary>Histórico de alterações</summary>'+history.map(renderModification).join("")+'</details>':'')+'</div>';
  box.appendChild(art);
 });
 box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify,b.dataset.property,b.dataset.in,b.dataset.out)));
 box.querySelectorAll("[data-accept-mod]").forEach(b=>b.addEventListener("click",()=>acceptModification(b.dataset.acceptMod,b)));
 box.querySelectorAll("[data-cancel-mod]").forEach(b=>b.addEventListener("click",()=>cancelModification(b.dataset.cancelMod,b)));
}
function renderGuarantee(g){
 if(!g)return "";
 const amount=brlC(g.amount_cents),captured=Number(g.captured_amount_cents||0);
 let text=g.status==="released"?"Garantia liberada.":g.status==="captured"?"Foi utilizado "+brlC(captured)+" em uma ocorrência registrada.":"A pré-autorização será solicitada antes do check-in.";
 return '<div class="guest-guarantee"><small>GARANTIA DA HOSPEDAGEM</small><strong>'+amount+'</strong><p>'+text+' Não é uma cobrança e nenhum valor é capturado ao criar a garantia. O valor só poderá ser utilizado, total ou parcialmente, em caso de dano ou ocorrência comprovada. Sem ocorrência, a garantia é liberada. Dependendo do banco emissor, pode haver reserva temporária desse valor no limite do cartão.</p></div>';
}
function renderModification(m){
 const target=properties.find(p=>Number(p.id)===Number(m.requested_property_id))?.name||"propriedade solicitada";
 let charge='<strong>Valor adicional: em análise</strong>';
 if(m.admin_additional_amount_cents!=null) charge=Number(m.admin_additional_amount_cents)>0?'<strong>Valor adicional a pagar: '+brlC(m.admin_additional_amount_cents)+'</strong>':'<strong>Valor adicional: sem cobrança adicional</strong>';
 const actions=["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status)?'<div class="mod-actions">'+(m.status==="awaiting_guest_acceptance"?'<button class="primary-action compact" data-accept-mod="'+m.id+'">Aceitar condição</button>':'')+'<button class="text-action danger" data-cancel-mod="'+m.id+'">Cancelar solicitação</button></div>':"";
 return '<div class="mod-status"><small>ALTERAÇÃO · '+statusLabel(m.status).toUpperCase()+'</small><p><strong>'+target+'</strong><br>'+(m.requested_check_in?m.requested_check_in.split("-").reverse().join("/"):"")+' → '+(m.requested_check_out?m.requested_check_out.split("-").reverse().join("/"):"")+'</p><p>Nova condição de referência: '+brlC(m.reference_amount_cents)+'</p><p>'+charge+'</p>'+(m.admin_note?'<p>'+m.admin_note+'</p>':'')+actions+'</div>';
}
async function acceptModification(id,btn){btn.disabled=true;try{await api("modification_action",{operation:"guest_accept",request_id:id});location.reload()}catch(e){btn.disabled=false;alert("Não foi possível aceitar: "+e.message)}}
async function cancelModification(id,btn){btn.disabled=true;try{await api("modification_action",{operation:"guest_cancel",request_id:id});location.reload()}catch(e){btn.disabled=false;alert("Não foi possível cancelar: "+e.message)}}
$("#profile-form").addEventListener("submit",async e=>{e.preventDefault();const {error}=await sb.from("profiles").update({full_name:$("#profile-name").value.trim(),phone:$("#profile-phone").value.trim()}).eq("id",session.user.id);$("#account-message").textContent=error?error.message:"Dados atualizados."});
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.href="auth.html"});
$("#delete-account").addEventListener("click",async()=>{const {error}=await sb.from("account_deletion_requests").insert({user_id:session.user.id});$("#account-message").textContent=error?error.message:"Solicitação de exclusão registrada para análise."});
function openModification(reservationId,currentProperty,currentIn,currentOut){
 $("#modify-reservation-id").value=reservationId;$("#modify-current").innerHTML='<strong>Reserva atual</strong><span>'+properties.find(p=>Number(p.id)===Number(currentProperty))?.name+' · '+currentIn.split("-").reverse().join("/")+' → '+currentOut.split("-").reverse().join("/")+'</span>';
 const s=$("#modify-property");s.innerHTML=properties.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(currentProperty)?"selected":"")+'>'+p.name+'</option>').join("");
 const today=new Date().toISOString().slice(0,10);$("#modify-in").value="";$("#modify-out").value="";$("#modify-in").min=today;$("#modify-out").min=today;$("#modify-in").onchange=()=>{$("#modify-out").min=$("#modify-in").value||today;if($("#modify-out").value&&$("#modify-out").value<=$("#modify-in").value)$("#modify-out").value=""};
 $("#modify-result").textContent="";$("#modify-modal").hidden=false;
}
$("#modify-close").addEventListener("click",()=>$("#modify-modal").hidden=true);
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const btn=e.submitter;if(!$("#modify-in").value||!$("#modify-out").value||$("#modify-out").value<=$("#modify-in").value){$("#modify-result").textContent="Escolha novas datas válidas.";return}btn.disabled=true;$("#modify-result").textContent="Consultando disponibilidade e nova condição…";
 try{const d=await api("request_modification",{reservation_id:$("#modify-reservation-id").value,requested_check_in:$("#modify-in").value,requested_check_out:$("#modify-out").value,requested_property_id:Number($("#modify-property").value)});$("#modify-result").innerHTML='Solicitação registrada. <strong>Sua reserva atual continua exatamente como está.</strong> A nova condição de referência é '+brlC(d.request.reference_amount_cents)+'. O valor adicional, se houver, será informado para sua aprovação antes de qualquer alteração.';setTimeout(()=>location.reload(),1800)}
 catch(err){$("#modify-result").textContent=err.message==="modification_already_open"?"Já existe uma solicitação de alteração em andamento. Cancele ou conclua a anterior antes de fazer outra.":err.message==="occupied"?"A nova opção não está disponível para essas datas.":"Não foi possível solicitar a alteração: "+err.message;btn.disabled=false}
});
boot();
})();