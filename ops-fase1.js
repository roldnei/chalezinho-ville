(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine,$=s=>document.querySelector(s),brl=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let session=null;
async function api(action,body=null){const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};const r=await fetch(ENGINE+"?action="+action,{method:body?"POST":"GET",headers,body:body?JSON.stringify({action,...body}):undefined});const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw new Error(d.error||"request_failed");return d}
async function boot(){const {data:{session:s}}=await sb.auth.getSession();session=s;if(!session)return location.href="auth.html?mode=login&return=ops-fase1.html";const {data:p}=await sb.from("profiles").select("role,full_name").eq("id",session.user.id).single();if(p?.role!=="admin"){$("#ops-root").innerHTML='<div class="empty-state">Esta rota é restrita à operação interna.</div>';return}$("#ops-user").textContent=p.full_name||session.user.email;await load()}
async function load(){const d=await api("ops");renderSettings(d);renderIntegrations(d);renderMods(d.modifications||[]);renderPayments(d.payments||[]);renderCharges(d.charges||[]);renderGuarantees(d.guarantees||[]);renderNotifications(d.notifications||[])}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function dateTime(v){return v?new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}
function empty(box,text){box.innerHTML='<div class="empty-state">'+text+'</div>'}
function renderSettings(d){
 const box=$("#ops-settings"),s=d.settings||{};
 box.innerHTML='<article class="ops-card"><small>REGRAS DE PAGAMENTO</small><h3>Configuração central</h3><form id="payment-settings-form" class="ops-settings-form"><label>Parcelas máximas no cartão<input name="max_card_installments" type="number" min="1" max="24" value="'+Number(s.max_card_installments||1)+'"></label><label>Validade do Pix (minutos)<input name="pix_expiration_minutes" type="number" min="5" max="1440" value="'+Number(s.pix_expiration_minutes||15)+'"></label><label>Prazo de pagamento pós-reserva (minutos)<input name="post_booking_payment_minutes" type="number" min="5" max="1440" value="'+Number(s.post_booking_payment_minutes||15)+'"></label><label>Prazo para alteração aprovada (horas)<input name="modification_payment_deadline_hours" type="number" min="1" max="168" value="'+Number(s.modification_payment_deadline_hours||24)+'"></label><button class="primary-action">Salvar regras</button><p class="form-result"></p></form></article>'+(d.properties||[]).map(p=>'<article class="ops-card"><small>'+esc(p.code)+'</small><h3>'+esc(p.name)+'</h3><form class="property-settings-form" data-property="'+p.id+'"><label>Taxa de limpeza interna (R$)<input name="cleaning_fee" type="number" min="0" step="0.01" value="'+Number(p.cleaning_fee||0)+'"></label><label>Garantia / pré-autorização (R$)<input name="guarantee_amount" type="number" min="0" step="0.01" value="'+(Number(p.guarantee_amount_cents||0)/100)+'"></label><button class="primary-action compact">Salvar propriedade</button><p class="form-result"></p></form></article>').join("");
 $("#payment-settings-form").onsubmit=savePaymentSettings;
 box.querySelectorAll(".property-settings-form").forEach(f=>f.onsubmit=savePropertySettings);
}
async function savePaymentSettings(e){e.preventDefault();const f=e.currentTarget,b=f.querySelector("button"),m=f.querySelector(".form-result");b.disabled=true;m.textContent="Salvando…";try{await api("ops_settings_action",{operation:"payment_settings",max_card_installments:Number(f.max_card_installments.value),pix_expiration_minutes:Number(f.pix_expiration_minutes.value),post_booking_payment_minutes:Number(f.post_booking_payment_minutes.value),modification_payment_deadline_hours:Number(f.modification_payment_deadline_hours.value)});m.textContent="Regras atualizadas."}catch{m.textContent="Não foi possível salvar."}b.disabled=false}
async function savePropertySettings(e){e.preventDefault();const f=e.currentTarget,b=f.querySelector("button"),m=f.querySelector(".form-result");b.disabled=true;m.textContent="Salvando…";try{await api("ops_settings_action",{operation:"property_settings",property_id:Number(f.dataset.property),cleaning_fee:Number(f.cleaning_fee.value),guarantee_amount_cents:Math.round(Number(f.guarantee_amount.value)*100)});m.textContent="Propriedade atualizada."}catch{m.textContent="Não foi possível salvar."}b.disabled=false}
function renderIntegrations(d){
 const box=$("#ops-integrations"),byProperty=new Map((d.properties||[]).map(p=>[Number(p.id),p.name]));
 const configured=new Map((d.booking_configured||[]).map(x=>[x.environment_key,x.configured]));
 const rows=(d.integrations||[]).map(i=>{const isBooking=i.provider==="booking",ok=!isBooking||configured.get(i.environment_key);return '<article class="ops-card integration-card '+(ok?'is-ok':'is-missing')+'"><small>'+esc(String(i.provider).toUpperCase())+'</small><h3>'+esc(byProperty.get(Number(i.property_id))||"Propriedade")+'</h3><p>'+(ok?'Configurada e ativa':'Aguardando a URL iCal externa')+'</p><code>'+esc(i.environment_key||i.external_listing_id||"configuração interna")+'</code></article>'});
 box.innerHTML=rows.length?rows.join(""):'<div class="empty-state">Nenhuma integração registrada.</div>';
}
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
function renderPayments(rows){const box=$("#ops-payments");if(!rows.length)return empty(box,"Nenhum pagamento registrado.");box.innerHTML=rows.map(p=>'<article class="ops-card"><small>'+esc(String(p.status).toUpperCase())+'</small><h3>'+esc(p.reservations?.confirmation_code||"Sem reserva")+' · '+esc(p.reservations?.properties?.name||"")+'</h3><p>'+brl(p.amount_cents)+' · '+esc(p.method||"—")+(p.installments?' · '+p.installments+'x':'')+' · '+dateTime(p.created_at)+'</p><code>'+esc(p.provider)+'</code></article>').join("")}
function renderCharges(rows){const box=$("#ops-charges");if(!rows.length)return empty(box,"Nenhuma cobrança pós-reserva registrada.");box.innerHTML=rows.map(c=>'<article class="ops-card"><small>'+esc(String(c.status).toUpperCase())+' · '+esc(String(c.kind).toUpperCase())+'</small><h3>'+esc(c.reservations?.confirmation_code||"Reserva")+' · '+esc(c.reservations?.properties?.name||"")+'</h3><p>'+esc(c.description||"Cobrança adicional")+' · '+brl(c.amount_cents)+'</p><p>Vencimento: '+dateTime(c.expires_at)+'</p></article>').join("")}
function renderNotifications(rows){const box=$("#ops-notifications");if(!rows.length)return empty(box,"A fila está vazia. Novos eventos transacionais aparecerão aqui.");box.innerHTML=rows.map(n=>'<article class="ops-card"><small>'+esc(String(n.status).toUpperCase())+'</small><h3>'+esc(n.template_code)+'</h3><p>Reserva '+esc(n.reservations?.confirmation_code||"—")+' · envio '+dateTime(n.send_after)+'</p><p>Tentativas: '+Number(n.attempt_count||0)+'/'+Number(n.max_attempts||5)+(n.last_error?' · '+esc(n.last_error):'')+'</p></article>').join("")}
boot();
})();