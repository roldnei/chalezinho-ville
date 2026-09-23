(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let session=null,profile=null,properties=[];
async function api(action,body={}){
 const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};
 const r=await fetch(ENGINE+"?action="+action,{method:"POST",headers,body:JSON.stringify({action,...body})});
 const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw new Error(d.error||"request_failed");return d;
}
async function boot(){
 const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:p},{data:reservations},{data:props},{data:mods}]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,property_id,check_in,check_out,status,guests,rate_plan_code,total_amount,created_at,properties(name,cover_image),payments(status,amount_cents),guarantees(status,amount_cents,captured_amount_cents),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("check_in",{ascending:false}),
  sb.from("properties").select("id,name,active").eq("active",true).order("id"),
  sb.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,original_amount_cents,reference_amount_cents,admin_additional_amount_cents,status,admin_note,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false})
 ]);
 profile=p;properties=props||[];
 $("#profile-name").value=profile?.full_name||"";$("#profile-phone").value=profile?.phone||"";
 if(profile?.role==="admin"){$("#ops-link").hidden=false}
 renderReservations(reservations||[],mods||[]);
}
function renderReservations(reservations,mods){
 const box=$("#reservation-list");box.innerHTML="";
 if(!reservations.length){box.innerHTML='<div class="empty-state">Você ainda não tem reservas vinculadas a esta conta.</div>';return}
 reservations.forEach(r=>{const latest=mods.find(m=>m.reservation_id===r.id),art=document.createElement("article");art.className="account-reservation";
  const exp=(r.experience_orders||[]).flatMap(o=>o.experience_order_items||[]).map(i=>i.product_name_snapshot+(i.variant_name_snapshot?" · "+i.variant_name_snapshot:"")).join(", ");
  const guarantee=(r.guarantees||[])[0];
  art.innerHTML='<img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div><small>'+String(r.status).toUpperCase()+'</small><h3>'+r.properties?.name+'</h3><p>'+r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/")+' · '+r.guests+' hóspedes</p><p><strong>'+brl(r.total_amount)+'</strong> · '+(r.rate_plan_code||"tarifa")+'</p><span>Código '+(r.confirmation_code||"—")+'</span>'+(exp?'<p>Adicionais: '+exp+'</p>':'')+(guarantee?'<p>Garantia: '+guarantee.status+' · '+brlC(guarantee.amount_cents)+'</p>':'')+'<button class="text-action" data-modify="'+r.id+'" data-property="'+r.property_id+'">Solicitar alteração</button>'+(latest?renderModification(latest):"")+'</div>';
  box.appendChild(art);
 });
 box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify,b.dataset.property)));
 box.querySelectorAll("[data-accept-mod]").forEach(b=>b.addEventListener("click",()=>acceptModification(b.dataset.acceptMod,b)));
}
function renderModification(m){
 let action=m.status==="awaiting_guest_acceptance"?'<button class="primary-action compact" data-accept-mod="'+m.id+'">Aceitar alteração e valor adicional</button>':"";
 return '<div class="mod-status"><small>ALTERAÇÃO · '+m.status.toUpperCase()+'</small><p>'+(m.requested_check_in?m.requested_check_in.split("-").reverse().join("/"):"")+' → '+(m.requested_check_out?m.requested_check_out.split("-").reverse().join("/"):"")+'</p><p>Referência nova: '+brlC(m.reference_amount_cents)+(m.admin_additional_amount_cents!=null?' · adicional definido: '+brlC(m.admin_additional_amount_cents):"")+'</p>'+(m.admin_note?'<p>'+m.admin_note+'</p>':'')+action+'</div>';
}
async function acceptModification(id,btn){btn.disabled=true;try{await api("modification_action",{operation:"guest_accept",request_id:id});location.reload()}catch(e){btn.disabled=false;alert("Não foi possível aceitar: "+e.message)}}
$("#profile-form").addEventListener("submit",async e=>{e.preventDefault();const {error}=await sb.from("profiles").update({full_name:$("#profile-name").value.trim(),phone:$("#profile-phone").value.trim()}).eq("id",session.user.id);$("#account-message").textContent=error?error.message:"Dados atualizados."});
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.href="auth.html"});
$("#delete-account").addEventListener("click",async()=>{const {error}=await sb.from("account_deletion_requests").insert({user_id:session.user.id});$("#account-message").textContent=error?error.message:"Solicitação de exclusão registrada para análise."});
function openModification(reservationId,currentProperty){$("#modify-reservation-id").value=reservationId;const s=$("#modify-property");s.innerHTML=properties.map(p=>'<option value="'+p.id+'" '+(String(p.id)===String(currentProperty)?"selected":"")+'>'+p.name+'</option>').join("");$("#modify-modal").hidden=false}
$("#modify-close").addEventListener("click",()=>$("#modify-modal").hidden=true);
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;$("#modify-result").textContent="Consultando disponibilidade e nova condição...";
 try{const d=await api("request_modification",{reservation_id:$("#modify-reservation-id").value,requested_check_in:$("#modify-in").value,requested_check_out:$("#modify-out").value,requested_property_id:Number($("#modify-property").value)});$("#modify-result").textContent="Solicitação registrada. A reserva original continua válida até análise. Referência da nova condição: "+brlC(d.request.reference_amount_cents);setTimeout(()=>location.reload(),1200)}
 catch(err){$("#modify-result").textContent=err.message==="occupied"?"A nova opção não está disponível para essas datas.":"Não foi possível solicitar a alteração: "+err.message;btn.disabled=false}
});
boot();
})();