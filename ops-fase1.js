(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine,$=s=>document.querySelector(s),brl=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let session=null;
async function api(action,body=null){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:body?"POST":"GET",headers,body:body?JSON.stringify({action,...body}):undefined});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw new Error(d.error||"request_failed");return d}
async function boot(){const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session)return location.href="auth.html?mode=login&return=ops-fase1.html";const {data:p}=await sb.from("profiles").select("role,full_name").eq("id",session.user.id).single();if(p?.role!=="admin"){$("#ops-root").innerHTML='<div class="empty-state">Esta rota é restrita à operação interna.</div>';return}$("#ops-user").textContent=p.full_name||session.user.email;await load()}
async function load(){const d=await api("ops");renderMods(d.modifications||[]);renderGuarantees(d.guarantees||[])}
function renderMods(rows){
 const box=$("#ops-mods");box.innerHTML=rows.length?"":'<div class="empty-state">Nenhuma alteração registrada.</div>';
 rows.forEach(m=>{
  const el=document.createElement("article");el.className="ops-card";
  const suggested=Number(m.estimated_additional_amount_cents||0);
  const finalAmount=m.admin_additional_amount_cents!=null?Number(m.admin_additional_amount_cents):suggested;
  const due=m.payment_due_at?new Date(m.payment_due_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):null;
  let controls="";
  if(["requested","quoted"].includes(m.status)){
    controls='<label>Valor adicional a cobrar<input data-amount="'+m.id+'" type="number" min="0" step="0.01" value="'+(finalAmount/100)+'"></label><label>Observação<input data-note="'+m.id+'" value="'+(m.admin_note||"")+'"></label><div class="ops-actions"><button data-decide="'+m.id+'">Aprovar e gerar cobrança</button><button data-reject="'+m.id+'">Rejeitar</button></div>';
  }else if(m.status==="awaiting_payment"){
    controls='<div class="ops-payment-wait"><strong>Aguardando pagamento: '+brl(finalAmount)+'</strong><p>Prazo: '+(due||"—")+'. A nova condição fica protegida somente até esse prazo. O pagamento confirmado aplica a alteração automaticamente.</p></div>';
  }else if(m.status==="payment_expired"){
    controls='<div class="ops-payment-wait"><strong>Cancelada por falta de pagamento</strong><p>A reserva original foi mantida.</p></div>';
  }else if(m.status==="applied"){
    controls='<div class="ops-payment-wait"><strong>Alteração aplicada</strong><p>Pagamento/aceite concluído. Não há ação manual de aplicação.</p></div>';
  }else if(m.status==="rejected"||m.status==="cancelled"){
    controls='<div class="ops-payment-wait"><strong>'+m.status.toUpperCase()+'</strong></div>';
  }else if(m.status==="accepted"){
    controls='<div class="ops-payment-wait"><strong>Fluxo legado aceito</strong><p>Registro anterior ao novo fluxo de pagamento.</p></div>';
  }
  el.innerHTML='<small>'+m.status.toUpperCase()+'</small><h3>'+m.reservations?.confirmation_code+' · '+m.reservations?.properties?.name+'</h3><p>Hospedagem atual: '+brl(m.original_amount_cents)+' · nova hospedagem: '+brl(m.reference_amount_cents)+' · diferença estimada: '+brl(suggested)+'</p><p>Solicitado: '+(m.requested_check_in||"—")+' → '+(m.requested_check_out||"—")+'</p>'+controls;
  box.appendChild(el);
 });
 box.querySelectorAll("[data-decide]").forEach(b=>b.onclick=()=>decide(b.dataset.decide,false));
 box.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>decide(b.dataset.reject,true));
}
async function decide(id,reject){
 try{
  const amount=Math.round(Number(document.querySelector('[data-amount="'+id+'"]')?.value||0)*100);
  const note=document.querySelector('[data-note="'+id+'"]')?.value||"";
  const d=await api("modification_action",{operation:"decide",request_id:id,decision:reject?"reject":"approve",additional_amount_cents:amount,admin_note:note});
  if(!reject&&d.status==="awaiting_payment"){
    alert("Alteração aprovada. A cobrança foi gerada e as novas datas estão protegidas até o prazo informado ao hóspede.");
  }
  await load();
 }catch(e){
  const messages={dates_unavailable:"As novas datas não estão mais disponíveis.",modification_payment_deadline_passed:"O check-in está próximo demais ou o prazo já se encerrou.",minimum_stay:"A nova condição não atende ao mínimo de noites."};
  alert(messages[e.message]||e.message);
 }
}
function renderGuarantees(rows){const box=$("#ops-guarantees");box.innerHTML=rows.length?"":'<div class="empty-state">Nenhuma garantia criada.</div>';rows.forEach(g=>{const el=document.createElement("article");el.className="ops-card";el.innerHTML='<small>'+g.status.toUpperCase()+'</small><h3>'+g.reservations?.confirmation_code+' · '+g.reservations?.properties?.name+'</h3><p>Garantia: '+brl(g.amount_cents)+' · capturado: '+brl(g.captured_amount_cents)+'</p><label>Valor da ocorrência/captura<input data-gamount="'+g.id+'" type="number" min="0" step="0.01" value="0"></label><label>Descrição<input data-gdesc="'+g.id+'" placeholder="Descreva a ocorrência"></label><div class="ops-actions"><button data-incident="'+g.id+'">Registrar ocorrência</button><button data-capture="'+g.id+'">Capturar parcialmente</button><button data-release="'+g.id+'">Liberar garantia</button></div>';box.appendChild(el)});
 box.querySelectorAll("[data-incident]").forEach(b=>b.onclick=()=>gAction(b.dataset.incident,"report_incident"));box.querySelectorAll("[data-capture]").forEach(b=>b.onclick=()=>gAction(b.dataset.capture,"capture"));box.querySelectorAll("[data-release]").forEach(b=>b.onclick=()=>gAction(b.dataset.release,"release"))}
async function gAction(id,operation){try{await api("guarantee_action",{operation,guarantee_id:id,amount_cents:Math.round(Number(document.querySelector('[data-gamount="'+id+'"]').value||0)*100),description:document.querySelector('[data-gdesc="'+id+'"]').value});await load()}catch(e){alert(e.message)}}
boot();
})();