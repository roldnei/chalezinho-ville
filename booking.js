(()=>{
const C=window.CHALEZINHO_CONFIG,ENGINE=C.bookingEngine,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const state={config:null,search:null,property:null,selectedByProduct:{},quote:null,rate:null,rateCode:null,session:null};
const nights=(a,b)=>Math.max(1,Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000));
const stayNights=()=>nights($("#book-in").value,$("#book-out").value);
const nightly=c=>Math.round(Number(c||0)/stayNights());

async function api(action,body=null){
 const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development"};
 if(state.session?.access_token) headers.Authorization="Bearer "+state.session.access_token;
 const r=await fetch(ENGINE+"?action="+encodeURIComponent(action),{method:body?"POST":"GET",headers,body:body?JSON.stringify({action,...body}):undefined});
 const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));
 if(!r.ok||!d.ok) throw Object.assign(new Error(d.error||"request_failed"),{status:r.status,data:d});
 return d;
}

async function init(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;
 try{state.config=await api("config")}catch(e){error("Não foi possível carregar as configurações de reserva.");return}
 const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());const min=today.toISOString().slice(0,10);
 $("#book-in").min=min;$("#book-out").min=min;
 $("#book-in").addEventListener("change",()=>{$("#book-out").min=$("#book-in").value||min;if($("#book-out").value&&$("#book-out").value<=$("#book-in").value)$("#book-out").value=""});
 $("#book-search").addEventListener("click",search);
 $("#checkout-close").addEventListener("click",()=>$("#checkout-modal").hidden=true);
 $("#step-back").addEventListener("click",()=>showStep(Math.max(1,Number($("#checkout-panel").dataset.step||1)-1)));
 $("#step-next").addEventListener("click",next);
 renderDevBanner();
 await restoreResume();
}
function renderDevBanner(){if(document.querySelector(".dev-banner"))return;const b=document.createElement("div");b.className="dev-banner";b.textContent="AMBIENTE DE DESENVOLVIMENTO · nenhum pagamento real será realizado";document.body.prepend(b)}
function error(t){$("#booking-error").textContent=t}
function setFlowError(t){$("#checkout-error").textContent=t}

async function search(){
 const bi=$("#book-in").value,bo=$("#book-out").value,guests=Number($("#book-guests").value);
 if(!bi||!bo||bo<=bi)return error("Escolha datas válidas.");
 error("Consultando disponibilidade e valores...");
 try{
  const q=new URLSearchParams({action:"search",start:bi,end:bo,guests:String(guests)});
  const r=await fetch(ENGINE+"?"+q,{headers:{"X-Chalezinho-Env":"development"}}),d=await r.json();
  if(!r.ok||!d.ok)throw new Error(d.error||"search_failed");
  state.search=d.listings;renderResults(d.listings);error("");
 }catch(e){error("Não foi possível consultar agora. Tente novamente.");}
}
function renderResults(list){
 const box=$("#booking-list");box.innerHTML="";$("#booking-results").classList.remove("booking-results-hidden");
 const available=list.filter(x=>x.available).length;$("#availability-count").textContent=available+" opções disponíveis";
 $("#booking-period").textContent=$("#book-in").value.split("-").reverse().join("/")+" → "+$("#book-out").value.split("-").reverse().join("/");
 list.forEach(p=>{
  const a=document.createElement("article");a.className="booking-property"+(p.available?"":" is-unavailable");
  const feats=(p.features||[]).map(x=>"<span>"+x+"</span>").join("");
  const status=p.available?"Disponível":p.unavailable_reason==="minimum_stay"?"Mínimo de "+p.min_stay+" noites":p.unavailable_reason==="occupied"?"Indisponível":"Tarifa indisponível";
  const total=p.base_price!=null?Number(p.base_price)*1.10+Number(p.cleaning_fee):null;
  const preview=total!=null?brl(total):"—", perNight=total!=null?brl(total/stayNights()):"—";
  a.innerHTML='<div class="booking-gallery"><img src="'+p.cover_image+'" alt="'+p.name+'" loading="lazy"></div><div><small>'+String(p.property_type).toUpperCase()+'</small><h3>'+p.name+'</h3><p>'+p.summary+'</p><div class="booking-tags">'+feats+'</div></div><div class="booking-price"><span class="availability-status '+(p.available?"available":"unavailable")+'">● '+status+'</span><small>A PARTIR DE</small><strong>'+preview+'</strong><span class="price-note">pacote · '+perNight+' por noite</span><button class="booking-select" '+(p.available?"":"disabled")+' data-id="'+p.id+'">'+(p.available?"Ver tarifas":"Indisponível")+'</button></div>';
  box.appendChild(a);
 });
 box.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>openFlow(Number(b.dataset.id))));
 $("#booking-results").scrollIntoView({behavior:"smooth"});
}

async function openFlow(id){
 state.property=state.search.find(x=>Number(x.id)===id);state.selectedByProduct={};state.quote=null;state.rate=null;state.rateCode=null;
 $("#checkout-modal").hidden=false;$("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=$("#book-in").value.split("-").reverse().join("/")+" a "+$("#book-out").value.split("-").reverse().join("/");
 showStep(1);$("#rate-options").innerHTML='<div class="loading-state">Preparando as tarifas…</div>';setFlowError("");
 try{
  await generateQuote(false);renderRates();
 }catch(e){setFlowError(e.message==="minimum_stay"?"A estadia mínima mudou. Faça uma nova busca.":"Não foi possível preparar as tarifas. Faça uma nova busca.");}
}
function showStep(n){
 $("#checkout-panel").dataset.step=String(n);$$(".checkout-step").forEach(x=>x.hidden=Number(x.dataset.step)!==n);$$(".progress-dot").forEach(x=>x.classList.toggle("active",Number(x.dataset.dot)<=Math.min(n,5)));
 $("#step-back").hidden=n===1||n===6;$("#step-next").hidden=n===6;
 $("#step-next").textContent=n===5?"Iniciar pagamento de teste":"Continuar";
}
async function generateQuote(withExperiences){
 const chosen=withExperiences?Object.values(state.selectedByProduct):[];
 const q=await api("quote",{property_id:state.property.id,check_in:$("#book-in").value,check_out:$("#book-out").value,guests:Number($("#book-guests").value),experience_variant_ids:chosen});
 state.quote=q;startCountdown(q.expires_at);return q;
}
function renderRates(){
 const box=$("#rate-options");box.innerHTML="";const ref=state.quote.rate_options.find(x=>x.code==="reference");
 state.quote.rate_options.filter(x=>x.selectable).forEach(r=>{
  const d=document.createElement("button");d.type="button";d.className="rate-card";d.dataset.option=r.quote_option_id;
  if(state.rateCode===r.code){d.classList.add("selected");state.rate=r}
  const extra=r.experience_amount_cents?'<span class="rate-extra">Experiências selecionadas já incluídas</span>':"";
  d.innerHTML='<small>'+r.name.toUpperCase()+'</small><span class="strike">'+(ref?brlC(ref.total_amount_cents):"")+'</span><strong>'+brlC(r.total_amount_cents)+'</strong><span class="package-line">Pacote de '+stayNights()+' noites · '+brlC(nightly(r.total_amount_cents))+' por noite</span>'+extra+'<p>'+((r.cancellation_policy?.body)||"Política informada antes do pagamento.")+'</p>';
  d.addEventListener("click",()=>{state.rate=r;state.rateCode=r.code;box.querySelectorAll(".rate-card").forEach(x=>x.classList.toggle("selected",x===d))});
  box.appendChild(d);
 });
}
function renderExperienceStep(){
 const purpose=$("#trip-purpose-initial");
 purpose.innerHTML='<option value="">Prefiro escolher depois</option>'+(state.config.purposes||[]).map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join("");
 purpose.onchange=()=>renderExperienceList(purpose.value);
 renderExperienceList(purpose.value);
}
function renderExperienceList(purpose){
 const box=$("#experience-options");box.innerHTML="";
 let products=(state.config.experience_products||[]).filter(p=>(p.experience_property_eligibility||[]).some(e=>Number(e.property_id)===Number(state.property.id)));
 if(purpose)products=products.filter(p=>!(p.travel_purposes||[]).length||(p.travel_purposes||[]).includes(purpose));
 if(!products.length){box.innerHTML='<p class="empty-state">Nenhuma experiência recomendada para este momento. Você pode continuar sem adicionar nada.</p>';return}
 products.forEach(p=>{
  const variants=(p.experience_variants||[]).filter(v=>v.active).sort((a,b)=>a.display_order-b.display_order);
  const media=(p.experience_media||[]).slice().sort((a,b)=>a.display_order-b.display_order);
  const selected=state.selectedByProduct[p.id],base=variants[0];
  const slides=media.length?media.map((m,i)=>'<img class="experience-slide '+(i===0?"active":"")+'" src="'+m.media_url+'" alt="'+(m.alt_text||p.name)+'" loading="lazy">').join(""):'<div class="experience-placeholder">Fotos em preparação</div>';
  const controls=media.length>1?'<button class="exp-arrow prev" type="button" aria-label="Foto anterior">‹</button><button class="exp-arrow next" type="button" aria-label="Próxima foto">›</button><div class="exp-dots">'+media.map((_,i)=>'<span class="'+(i===0?"active":"")+'"></span>').join("")+'</div>':"";
  let actions="";
  variants.forEach((v,i)=>{
    if(i===0) actions+='<button type="button" class="experience-buy '+(selected===v.id?"selected":"")+'" data-product="'+p.id+'" data-variant="'+v.id+'">'+(selected===v.id?"✓ Adicionado":"Adicionar "+v.name)+' · '+brlC(v.price_cents)+'</button>';
    else{
      const diff=Math.max(0,Number(v.price_cents)-Number(base?.price_cents||0));
      actions+='<button type="button" class="experience-upgrade '+(selected===v.id?"selected":"")+'" data-product="'+p.id+'" data-variant="'+v.id+'">'+(selected===v.id?"✓ "+v.name:"Upgrade para "+v.name+" por +"+brlC(diff))+'</button>';
    }
  });
  const item=document.createElement("article");item.className="experience-card";
  item.innerHTML='<div class="experience-carousel">'+slides+controls+'</div><div class="experience-copy"><small>'+p.status.toUpperCase()+'</small><h4>'+p.name+'</h4><strong class="experience-headline">'+(p.sales_headline||"Um detalhe a mais para a estadia.")+'</strong><p>'+p.description+'</p><div class="experience-actions">'+actions+(selected?'<button class="text-action remove-experience" type="button" data-remove="'+p.id+'">Continuar sem este adicional</button>':"")+'</div></div>';
  box.appendChild(item);
 });
 bindExperienceControls();
}
function bindExperienceControls(){
 $$(".experience-carousel").forEach(car=>{
  const slides=[...car.querySelectorAll(".experience-slide")],dots=[...car.querySelectorAll(".exp-dots span")];let index=0;
  const go=n=>{if(!slides.length)return;index=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.classList.toggle("active",i===index));dots.forEach((d,i)=>d.classList.toggle("active",i===index))};
  car.querySelector(".prev")?.addEventListener("click",()=>go(index-1));car.querySelector(".next")?.addEventListener("click",()=>go(index+1));
 });
 $$("[data-variant]").forEach(b=>b.addEventListener("click",()=>{state.selectedByProduct[b.dataset.product]=b.dataset.variant;renderExperienceList($("#trip-purpose-initial").value)}));
 $$("[data-remove]").forEach(b=>b.addEventListener("click",()=>{delete state.selectedByProduct[b.dataset.remove];renderExperienceList($("#trip-purpose-initial").value)}));
}
async function refreshQuoteAfterExperiences(){
 const code=state.rateCode;setFlowError("Atualizando o pacote com suas escolhas…");
 await generateQuote(true);state.rateCode=code;state.rate=state.quote.rate_options.find(x=>x.code===code&&x.selectable)||null;setFlowError("");
}

async function next(){
 const step=Number($("#checkout-panel").dataset.step||1);
 if(step===1){if(!state.rate)return setFlowError("Escolha uma tarifa para continuar.");showStep(2);renderExperienceStep();return}
 if(step===2){try{await refreshQuoteAfterExperiences();showStep(3);await renderLoginStep()}catch(e){setFlowError("Não foi possível atualizar o pacote. Tente novamente.");}return}
 if(step===3){if(!state.session){saveResume();location.href="auth.html?mode=login&return="+encodeURIComponent("reservar.html?resume=1");return}showStep(4);renderGuestStep();return}
 if(step===4){if(!validateGuest())return;showStep(5);renderSummary();return}
 if(step===5){await startPayment()}
}
async function renderLoginStep(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;const box=$("#login-state");
 if(session){const {data:u}=await sb.auth.getUser();box.innerHTML='<div class="success-state">✓ Você está conectado como <strong>'+u.user.email+'</strong>.</div>'}
 else box.innerHTML='<p>Para proteger sua reserva e deixar tudo disponível em “Minhas Reservas”, entre ou crie sua conta agora.</p><a class="primary-action inline" href="auth.html?mode=login&return='+encodeURIComponent("reservar.html?resume=1")+'">Entrar ou criar conta</a>';
}
function renderGuestStep(){
 const meta=state.session?.user?.user_metadata||{};$("#guest-name").value=$("#guest-name").value||meta.full_name||"";$("#guest-email").value=state.session?.user?.email||"";$("#guest-phone").value=$("#guest-phone").value||meta.phone||"";
}
function validateGuest(){if(!$("#guest-name").value.trim()||!$("#guest-email").value.trim()||!$("#guest-phone").value.trim()){setFlowError("Preencha seus dados.");return false}return true}
function renderSummary(){
 const total=Number(state.rate.total_amount_cents||0),per=nightly(total),selectedProducts=Object.keys(state.selectedByProduct).length;
 $("#summary-content").innerHTML='<div class="summary-price"><small>SEU PACOTE</small><strong>'+brlC(total)+'</strong><span>'+stayNights()+' noites · '+brlC(per)+' por noite</span>'+(selectedProducts?'<em>Experiências selecionadas incluídas no valor</em>':'')+'</div><div class="summary-line"><span>'+state.property.name+'</span><span>'+state.rate.name+'</span></div><div class="summary-line"><span>Datas</span><span>'+$("#book-in").value.split("-").reverse().join("/")+' → '+$("#book-out").value.split("-").reverse().join("/")+'</span></div>';
 const guarantee=Number(state.property.guarantee_amount_cents||0);
 $("#guarantee-info").innerHTML=guarantee?'<div class="guarantee-card"><small>GARANTIA DA HOSPEDAGEM</small><h4>'+brlC(guarantee)+'</h4><p>Antes do check-in, poderemos solicitar uma <strong>pré-autorização no cartão</strong>. Não é uma compra nem uma cobrança. O emissor do cartão pode reservar temporariamente esse valor do limite disponível até a liberação. Sem ocorrência, nenhum valor é capturado.</p></div>':"";
 const pol=$("#policy-box");pol.innerHTML='<label class="accept-line"><input id="accept-cancel" type="checkbox"> <span>Li e aceito a política <strong>'+state.rate.cancellation_policy.title+'</strong>: '+state.rate.cancellation_policy.body+'</span></label><p class="dev-note">Termos de hospedagem, regras da propriedade e política de privacidade ainda estão em versão de desenvolvimento e precisam de aprovação antes do GO-LIVE.</p>';
 const pay=$("#payment-options"),max=Number(state.config.payment_settings.max_card_installments||1);pay.innerHTML='<label><input type="radio" name="pay-method" value="pix" checked> PIX · expira em '+state.config.payment_settings.pix_expiration_minutes+' min</label><label><input type="radio" name="pay-method" value="card"> Cartão</label><select id="installments">'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'x</option>').join("")+'</select><p class="dev-note">Ambiente de teste: nenhum PIX ou cartão real será criado.</p>';
}
async function startPayment(){
 if(!$("#accept-cancel")?.checked)return setFlowError("Aceite a política de cancelamento para continuar.");
 const method=document.querySelector('input[name="pay-method"]:checked')?.value||"mock";setFlowError("Protegendo temporariamente as datas para iniciar o pagamento…");
 try{
  const d=await api("start_payment",{quote_id:state.quote.quote_id,quote_option_id:state.rate.quote_option_id,guest_name:$("#guest-name").value.trim(),guest_email:$("#guest-email").value.trim(),guest_phone:$("#guest-phone").value.trim(),guests:Number($("#book-guests").value),travel_purpose_code:$("#trip-purpose-initial").value,accepted_document_ids:[state.rate.cancellation_policy?.id].filter(Boolean),method,installments:Number($("#installments")?.value||1)});
  renderMockPayment(d);showStep(6);setFlowError("");
 }catch(e){setFlowError(e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":e.message==="dates_unavailable"?"Essas datas acabaram de ficar indisponíveis.":"Não foi possível iniciar o pagamento de teste.")}
}
function renderMockPayment(d){
 const box=$("#mock-payment");box.innerHTML='<div class="success-state"><small>PRÉ-RESERVA DE PAGAMENTO</small><h3>'+d.confirmation_code+'</h3><p>Agora sim as datas estão protegidas temporariamente enquanto o pagamento é processado.</p></div><div class="mock-controls"><span>SIMULAR RESULTADO:</span><button data-outcome="paid">Aprovado</button><button data-outcome="under_review">Em análise</button><button data-outcome="refused">Recusado</button><button data-outcome="expired">Expirado</button></div><p id="mock-result"></p>';
 box.querySelectorAll("[data-outcome]").forEach(b=>b.addEventListener("click",async()=>{try{await api("mock_payment",{payment_id:d.payment.id,outcome:b.dataset.outcome});$("#mock-result").innerHTML=b.dataset.outcome==="paid"?'Reserva confirmada. <a href="conta.html">Ver em Minhas Reservas →</a>':"Estado atualizado: "+b.dataset.outcome}catch(e){$("#mock-result").textContent="Falha ao simular estado."}}));
}
function startCountdown(exp){
 const el=$("#quote-countdown");clearInterval(window.__quoteTimer);
 const tick=()=>{const s=Math.max(0,Math.floor((Date.parse(exp)-Date.now())/1000));el.textContent="Preço garantido por "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0")+" · datas ainda não bloqueadas";if(!s){el.textContent="Cotação expirada · gere uma nova para atualizar o preço";clearInterval(window.__quoteTimer)}};
 tick();window.__quoteTimer=setInterval(tick,1000);
}
function saveResume(){
 sessionStorage.setItem("chalezinho_booking_resume",JSON.stringify({property:state.property,selectedByProduct:state.selectedByProduct,quote:state.quote,rateCode:state.rateCode,check_in:$("#book-in").value,check_out:$("#book-out").value,guests:$("#book-guests").value,purpose:$("#trip-purpose-initial")?.value||""}));
}
async function restoreResume(){
 if(!new URLSearchParams(location.search).has("resume"))return;let saved=null;try{saved=JSON.parse(sessionStorage.getItem("chalezinho_booking_resume")||"null")}catch{}
 if(!saved)return;sessionStorage.removeItem("chalezinho_booking_resume");
 $("#book-in").value=saved.check_in||"";$("#book-out").value=saved.check_out||"";$("#book-guests").value=saved.guests||"2";state.property=saved.property;state.selectedByProduct=saved.selectedByProduct||{};state.quote=saved.quote;state.rateCode=saved.rateCode;
 state.rate=state.quote?.rate_options?.find(x=>x.code===state.rateCode&&x.selectable)||null;
 const {data:{session}}=await sb.auth.getSession();state.session=session;if(!session)return;
 $("#checkout-modal").hidden=false;$("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=saved.check_in.split("-").reverse().join("/")+" a "+saved.check_out.split("-").reverse().join("/");
 if(state.quote?.expires_at)startCountdown(state.quote.expires_at);showStep(4);renderGuestStep();
}
init();
})();