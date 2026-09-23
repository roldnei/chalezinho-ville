(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey);
const $=s=>document.querySelector(s),brl=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function boot(){
 const {data:{session}}=await sb.auth.getSession();if(!session){location.href="auth.html?mode=login&return=conta.html";return}
 $("#account-email").textContent=session.user.email||"";
 const [{data:profile},{data:reservations}]=await Promise.all([
  sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle(),
  sb.from("reservations").select("id,confirmation_code,check_in,check_out,status,guests,rate_plan_code,total_amount,created_at,properties(name,cover_image),payments(status,amount_cents),guarantees(status,amount_cents),experience_orders(id,status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,status))").eq("user_id",session.user.id).order("check_in",{ascending:false})
 ]);
 $("#profile-name").value=profile?.full_name||"";$("#profile-phone").value=profile?.phone||"";
 const box=$("#reservation-list");box.innerHTML="";
 if(!reservations?.length)box.innerHTML='<div class="empty-state">Você ainda não tem reservas vinculadas a esta conta.</div>';
 (reservations||[]).forEach(r=>{const art=document.createElement("article");art.className="account-reservation";
  art.innerHTML='<img src="'+(r.properties?.cover_image||"assets/hero-signature.webp")+'" alt=""><div><small>'+String(r.status).toUpperCase()+'</small><h3>'+r.properties?.name+'</h3><p>'+r.check_in.split("-").reverse().join("/")+' → '+r.check_out.split("-").reverse().join("/")+' · '+r.guests+' hóspedes</p><p><strong>'+Number(r.total_amount||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})+'</strong> · '+(r.rate_plan_code||"tarifa")+'</p><span>Código '+(r.confirmation_code||"—")+'</span><button class="text-action" data-modify="'+r.id+'">Solicitar alteração</button></div>';
  box.appendChild(art);
 });
 box.querySelectorAll("[data-modify]").forEach(b=>b.addEventListener("click",()=>openModification(b.dataset.modify)));
}
$("#profile-form").addEventListener("submit",async e=>{e.preventDefault();const {data:{session}}=await sb.auth.getSession();if(!session)return;
 const {error}=await sb.from("profiles").update({full_name:$("#profile-name").value.trim(),phone:$("#profile-phone").value.trim()}).eq("id",session.user.id);
 $("#account-message").textContent=error?error.message:"Dados atualizados.";
});
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.href="auth.html"});
$("#delete-account").addEventListener("click",async()=>{const {data:{session}}=await sb.auth.getSession();if(!session)return;
 const {error}=await sb.from("account_deletion_requests").insert({user_id:session.user.id});$("#account-message").textContent=error?error.message:"Solicitação de exclusão registrada para análise.";
});
function openModification(reservationId){$("#modify-reservation-id").value=reservationId;$("#modify-modal").hidden=false}
$("#modify-close").addEventListener("click",()=>$("#modify-modal").hidden=true);
$("#modify-form").addEventListener("submit",async e=>{e.preventDefault();const {data:{session}}=await sb.auth.getSession();if(!session)return;
 const payload={reservation_id:$("#modify-reservation-id").value,user_id:session.user.id,request_type:"dates",requested_check_in:$("#modify-in").value,requested_check_out:$("#modify-out").value};
 const {error}=await sb.from("modification_requests").insert(payload);$("#modify-result").textContent=error?error.message:"Solicitação enviada. A reserva original permanece válida até análise.";if(!error)e.target.reset();
});
boot();
})();