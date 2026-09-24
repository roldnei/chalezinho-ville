(()=>{
const C=window.CHALEZINHO_CONFIG,ENGINE=C.bookingEngine,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const state={config:null,search:null,property:null,selectedByProduct:{},quote:null,rate:null,rateCode:null,session:null,upsellHandled:false};
let anonymousId="";
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
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
function track(event_name,payload={}){api("track",{event_name,anonymous_id:anonymousId,...payload}).catch(()=>{})}

async function init(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;
 try{let last=null;for(let attempt=1;attempt<=3;attempt++){try{state.config=await api("config");last=null;break}catch(e){last=e;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,600*attempt))}}if(last)throw last}catch(e){error("Não foi possível carregar as configurações de reserva. Tente atualizar a página.");return}
 const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());const min=today.toISOString().slice(0,10);
 $("#book-in").min=min;$("#book-out").min=min;
 $("#book-in").addEventListener("change",()=>{$("#book-out").min=$("#book-in").value||min;if($("#book-out").value&&$("#book-out").value<=$("#book-in").value)$("#book-out").value=""});
 $("#book-search").addEventListener("click",search);
 $("#checkout-close").addEventListener("click",()=>$("#checkout-modal").hidden=true);$("#upsell-close")?.addEventListener("click",()=>$("#upsell-modal").hidden=true);
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
 track("search_started",{metadata:{nights:nights(bi,bo),guests}});
 try{
  const q=new URLSearchParams({action:"search",start:bi,end:bo,guests:String(guests)});
  const r=await fetch(ENGINE+"?"+q,{headers:{"X-Chalezinho-Env":"development"}}),d=await r.json();
  if(!r.ok||!d.ok)throw new Error(d.error||"search_failed");
  state.search=d.listings;renderResults(d.listings);error("");
  track("search_completed",{metadata:{nights:nights(bi,bo),guests,available_count:d.listings.filter(x=>x.available).length}});
 }catch(e){error("Não foi possível consultar agora. Tente novamente.");}
}
function renderResults(list){
 const box=$("#booking-list");box.innerHTML="";$("#booking-results").classList.remove("booking-results-hidden");
 const available=list.filter(x=>x.available).length;$("#availability-count").textContent=available+" opções disponíveis";
 $("#booking-period").textContent=$("#book-in").value.split("-").reverse().join("/")+" → "+$("#book-out").value.split("-").reverse().join("/");
 list.forEach(p=>{
  const a=document.createElement("article");a.className="booking-property"+(p.available?"":" is-unavailable");
  const feats=(p.features||[]).map(x=>"<span>"+x+"</span>").join("");
  const status=p.available?"Disponível":p.unavailable_reason==="minimum_stay"?"Estadia mínima não atendida":p.unavailable_reason==="occupied"?"Indisponível":"Tarifa indisponível";
  const minNotice=p.unavailable_reason==="minimum_stay"?'<div class="minimum-stay-alert"><small>MÍNIMO DE ESTADIA</small><strong>'+p.min_stay+' '+(Number(p.min_stay)===1?"noite":"noites")+'</strong><span>Para estas datas, este chalé exige no mínimo '+p.min_stay+' '+(Number(p.min_stay)===1?"noite":"noites")+'.</span></div>':"";
  const total=p.from_stay_price!=null?Number(p.from_stay_price):null;
  const preview=total!=null?brl(total):"—", perNight=total!=null?brl(total/stayNights()):"—";
  a.innerHTML='<div class="booking-gallery"><img src="'+p.cover_image+'" alt="'+p.name+'" loading="lazy"></div><div><small>'+String(p.property_type).toUpperCase()+'</small><h3>'+p.name+'</h3><p>'+p.summary+'</p><div class="booking-tags">'+feats+'</div>'+minNotice+'</div><div class="booking-price"><span class="availability-status '+(p.available?"available":"unavailable")+'">● '+status+'</span><small>A PARTIR DE</small><strong>'+preview+'</strong><span class="price-note">pacote · '+perNight+' por noite</span><button class="booking-select" '+(p.available?"":"disabled")+' data-id="'+p.id+'">'+(p.available?"Ver tarifas":"Indisponível")+'</button></div>';
  box.appendChild(a);
 });
 box.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>openFlow(Number(b.dataset.id))));
 $("#booking-results").scrollIntoView({behavior:"smooth"});
}

async function openFlow(id){
 state.property=state.search.find(x=>Number(x.id)===id);state.selectedByProduct={};state.quote=null;state.rate=null;state.rateCode=null;state.upsellHandled=false;
 track("property_viewed",{property_id:state.property.id,metadata:{nights:stayNights()}});
 $("#checkout-modal").hidden=false;$("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=$("#book-in").value.split("-").reverse().join("/")+" a "+$("#book-out").value.split("-").reverse().join("/");
 showStep(1);$("#rate-options").innerHTML='<div class="loading-state">Preparando as tarifas…</div>';setFlowError("");
 try{
  await generateQuote(false);renderRates();
 }catch(e){
  if(e.message==="minimum_stay"){
    const min=Number(e.data?.min_stay||state.property?.min_stay||1);
    setFlowError("Para estas datas, o mínimo de estadia deste chalé é de "+min+" "+(min===1?"noite":"noites")+". Faça uma nova busca com o período mínimo.");
  }else setFlowError("Não foi possível preparar as tarifas. Faça uma nova busca.");
}
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
 track("rate_viewed",{property_id:state.property.id,metadata:{rate_count:state.quote.rate_options.filter(x=>x.selectable).length}});
 state.quote.rate_options.filter(x=>x.selectable).forEach(r=>{
  const d=document.createElement("button");d.type="button";d.className="rate-card";d.dataset.option=r.quote_option_id;
  if(state.rateCode===r.code){d.classList.add("selected");state.rate=r}
  const extra=r.experience_amount_cents?'<span class="rate-extra">Experiências selecionadas já incluídas</span>':"";
  d.innerHTML='<small>'+r.name.toUpperCase()+'</small><span class="strike">'+(ref?brlC(ref.total_amount_cents):"")+'</span><strong>'+brlC(r.total_amount_cents)+'</strong><span class="package-line">Pacote de '+stayNights()+' noites · '+brlC(nightly(r.total_amount_cents))+' por noite</span>'+extra+'<p>'+((r.cancellation_policy?.body)||"Política informada antes do pagamento.")+'</p>';
  d.addEventListener("click",()=>{state.rate=r;state.rateCode=r.code;box.querySelectorAll(".rate-card").forEach(x=>x.classList.toggle("selected",x===d));track("rate_selected",{property_id:state.property.id,metadata:{rate_code:r.code,total_cents:Number(r.total_amount_cents||0)}})});
  box.appendChild(d);
 });
}
function renderExperienceStep(){
 const purpose=$("#trip-purpose-initial");
 purpose.innerHTML='<option value="">Prefiro escolher depois</option>'+(state.config.purposes||[]).map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join("");
 purpose.onchange=()=>renderExperienceList(purpose.value);
 renderExperienceList(purpose.value);
}
function eligibleExperienceProducts(purpose=""){
 const checkIn=$("#book-in")?.value||"";
 const checkInAt=checkIn?Date.parse(checkIn+"T15:00:00-03:00"):Infinity;
 return (state.config.experience_products||[])
  .filter(p=>p.status==="active")
  .filter(p=>Number(p.price_cents||0)>0)
  .filter(p=>(p.experience_media||[]).length>=5)
  .filter(p=>p.inventory==null||Number(p.inventory)>0)
  .filter(p=>!checkIn||checkInAt-Date.now()>=Number(p.minimum_lead_hours||0)*3600000)
  .filter(p=>(p.experience_property_eligibility||[]).some(e=>Number(e.property_id)===Number(state.property.id)))
  .filter(p=>!purpose||!(p.travel_purposes||[]).length||(p.travel_purposes||[]).includes(purpose));
}
function primaryVariant(p){
 return (p.experience_variants||[]).filter(v=>v.active).sort((a,b)=>a.display_order-b.display_order)[0]||null;
}
function selectedProducts(){
 const ids=new Set(Object.keys(state.selectedByProduct));
 return (state.config.experience_products||[]).filter(p=>ids.has(String(p.id)));
}
function renderExperienceList(purpose){
 const box=$("#experience-options");box.innerHTML="";
 const products=eligibleExperienceProducts(purpose);
 track("experience_viewed",{property_id:state.property?.id||null,metadata:{source:"booking",purpose:purpose||null,available_count:products.length}});
 if(!products.length){box.innerHTML='<p class="empty-state">Nenhuma experiência disponível para este momento. Você pode continuar sem adicionar nada.</p>';return}
 products.sort((a,b)=>String(a.package_type).localeCompare(String(b.package_type))||Number(a.price_cents)-Number(b.price_cents));
 products.forEach(p=>{
  const variant=primaryVariant(p);if(!variant)return;
  const media=(p.experience_media||[]).slice().sort((a,b)=>a.display_order-b.display_order);
  const selected=state.selectedByProduct[p.id]===variant.id;
  const slides=media.map((m,i)=>'<img class="experience-slide '+(i===0?"active":"")+'" src="'+m.media_url+'" alt="'+(m.alt_text||p.name)+'" loading="lazy">').join("");
  const controls=media.length>1?'<button class="exp-arrow prev" type="button" aria-label="Foto anterior">‹</button><button class="exp-arrow next" type="button" aria-label="Próxima foto">›</button><div class="exp-dots">'+media.map((_,i)=>'<span class="'+(i===0?"active":"")+'"></span>').join("")+'</div>':"";
  const item=document.createElement("article");item.className="experience-card"+(selected?" selected":"");
  item.innerHTML='<div class="experience-carousel">'+slides+controls+'</div><div class="experience-copy"><small>'+String(p.package_type||"experiência").toUpperCase()+'</small><h4>'+p.name+'</h4><strong class="experience-headline">'+(p.sales_headline||"Um detalhe a mais para a estadia.")+'</strong><p>'+p.description+'</p><div class="experience-actions"><button type="button" class="experience-buy '+(selected?"selected":"")+'" data-package="'+p.id+'" data-variant="'+variant.id+'">'+(selected?"✓ Adicionado":"Adicionar por "+brlC(p.price_cents))+'</button>'+(selected?'<button class="text-action remove-experience" type="button" data-remove="'+p.id+'">Remover experiência</button>':"")+'</div></div>';
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
 $$("[data-package]").forEach(b=>b.addEventListener("click",()=>{
   const product=(state.config.experience_products||[]).find(p=>String(p.id)===String(b.dataset.package));if(!product)return;
   for(const p of selectedProducts()) if(p.package_type===product.package_type) delete state.selectedByProduct[p.id];
   state.selectedByProduct[product.id]=b.dataset.variant;state.upsellHandled=false;
   track("experience_added",{property_id:state.property?.id||null,metadata:{source:"booking",product_id:product.id,amount_cents:Number(product.price_cents||0)}});
   renderExperienceList($("#trip-purpose-initial").value);
 }));
 $$("[data-remove]").forEach(b=>b.addEventListener("click",()=>{delete state.selectedByProduct[b.dataset.remove];state.upsellHandled=false;renderExperienceList($("#trip-purpose-initial").value)}));
}
async function serverUpsellPreview(){
 try{
  const d=await api("upsell_preview",{quote_id:state.quote.quote_id});
  return d.upsell||null;
 }catch(e){
  if(e.message==="quote_expired")throw e;
  return null;
 }
}
function paymentChoice(){
 return {method:document.querySelector('input[name="pay-method"]:checked')?.value||"pix",installments:Number($("#installments")?.value||1)};
}
async function maybeOfferUpsell(){
 if(!$("#accept-cancel")?.checked){setFlowError("Aceite a política de cancelamento para continuar.");return}
 const choice=paymentChoice();
 if(state.upsellHandled){await performStartPayment(choice);return}
 setFlowError("Verificando a melhor opção antes do pagamento…");
 let candidate=null;
 try{candidate=await serverUpsellPreview()}catch(e){setFlowError(e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":"Não foi possível verificar o upsell.");return}
 setFlowError("");
 if(!candidate){state.upsellHandled=true;await performStartPayment(choice);return}

 const target=(state.config.experience_products||[]).find(p=>String(p.id)===String(candidate.to_product_id));
 const media=(target?.experience_media||[]).slice().sort((a,b)=>a.display_order-b.display_order)[0];
 const newTotal=Number(state.rate.total_amount_cents||0)+Number(candidate.difference_cents||0);
 $("#upsell-image").src=media?.media_url||"";
 $("#upsell-image").alt=media?.alt_text||candidate.to_name;
 $("#upsell-title").textContent=candidate.to_name;
 $("#upsell-copy").innerHTML='Você escolheu <strong>'+candidate.from_name+'</strong> por '+brlC(candidate.from_price_cents)+'. O próximo pacote é <strong>'+candidate.to_name+'</strong> por '+brlC(candidate.to_price_cents)+'. Você pode fazer o upgrade por <strong>+'+brlC(candidate.difference_cents)+'</strong>.';
 $("#upsell-total").textContent="Novo total da reserva: "+brlC(newTotal);
 $("#upsell-no").textContent="Não, manter "+candidate.from_name;
 $("#upsell-yes").textContent="Sim, quero o upgrade por +"+brlC(candidate.difference_cents);
 $("#upsell-modal").hidden=false;

 $("#upsell-no").onclick=async()=>{
   state.upsellHandled=true;$("#upsell-modal").hidden=true;
   await performStartPayment(choice);
 };

 $("#upsell-yes").onclick=async()=>{
   $("#upsell-yes").disabled=true;$("#upsell-no").disabled=true;
   $("#upsell-total").textContent="Atualizando o valor da reserva…";
   try{
     const d=await api("apply_upsell",{
       quote_id:state.quote.quote_id,
       quote_option_id:state.rate.quote_option_id,
       target_product_id:candidate.to_product_id
     });
     state.quote=d.quote;
     state.rate=d.selected_rate;
     state.rateCode=d.selected_rate.code;
     state.upsellHandled=true;
     startCountdown(state.quote.expires_at);

     delete state.selectedByProduct[candidate.from_product_id];
     const targetProduct=(state.config.experience_products||[]).find(p=>String(p.id)===String(candidate.to_product_id));
     const targetVariant=targetProduct?primaryVariant(targetProduct):null;
     if(targetVariant)state.selectedByProduct[candidate.to_product_id]=targetVariant.id;

     renderSummary();
     track("experience_upgraded",{property_id:state.property?.id||null,metadata:{from_product_id:candidate.from_product_id,to_product_id:candidate.to_product_id,difference_cents:Number(candidate.difference_cents||0)}});
     $("#upsell-total").textContent="Pacote atualizado · novo total: "+brlC(state.rate.total_amount_cents);
     $("#upsell-copy").innerHTML='<strong>'+candidate.to_name+'</strong> foi aplicado à reserva.';
     $("#upsell-yes").textContent="Continuar para pagamento";
     $("#upsell-no").hidden=true;
     $("#upsell-yes").disabled=false;
     $("#upsell-yes").onclick=async()=>{$("#upsell-modal").hidden=true;await performStartPayment(choice)};
   }catch(e){
     $("#upsell-total").textContent="Não foi possível atualizar o pacote.";
     $("#upsell-yes").disabled=false;$("#upsell-no").disabled=false;
     if(e.message==="upsell_not_available")$("#upsell-copy").textContent="A condição do pacote mudou. Feche esta oferta e tente novamente.";
   }
 };
}
async function refreshQuoteAfterExperiences(){
 const code=state.rateCode;setFlowError("Atualizando o pacote com suas escolhas…");
 await generateQuote(true);state.rateCode=code;state.rate=state.quote.rate_options.find(x=>x.code===code&&x.selectable)||null;state.upsellHandled=false;setFlowError("");
}

async function next(){
 const step=Number($("#checkout-panel").dataset.step||1);
 if(step===1){if(!state.rate)return setFlowError("Escolha uma tarifa para continuar.");showStep(2);renderExperienceStep();return}
 if(step===2){try{await refreshQuoteAfterExperiences();track("checkout_started",{property_id:state.property?.id||null,metadata:{rate_code:state.rateCode,total_cents:Number(state.rate?.total_amount_cents||0)}});showStep(3);await renderLoginStep()}catch(e){setFlowError("Não foi possível atualizar o pacote. Tente novamente.");}return}
 if(step===3){if(!state.session){saveResume();location.href="auth.html?mode=login&return="+encodeURIComponent("reservar.html?resume=1");return}showStep(4);renderGuestStep();return}
 if(step===4){if(!validateGuest())return;showStep(5);renderSummary();return}
 if(step===5){await maybeOfferUpsell()}
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
 const total=Number(state.rate.total_amount_cents||0),stay=Number(state.rate.stay_amount_cents||0);
 const perNight=Math.round(stay/stayNights());
 const experiences=state.quote?.experiences||[];
 const expRows=experiences.map(e=>'<div class="summary-line"><span>'+e.product+'</span><strong>'+brlC(e.price_cents)+'</strong></div>').join("");
 $("#summary-content").innerHTML='<div class="booking-breakdown"><div class="summary-line"><span>Hospedagem · '+stayNights()+' noites<small>'+brlC(perNight)+' por noite</small></span><strong>'+brlC(stay)+'</strong></div>'+expRows+'<div class="summary-total"><span>TOTAL DA RESERVA</span><strong>'+brlC(total)+'</strong></div></div><div class="summary-line summary-meta"><span>'+state.property.name+'</span><span>'+state.rate.name+'</span></div><div class="summary-line summary-meta"><span>Datas</span><span>'+$("#book-in").value.split("-").reverse().join("/")+' → '+$("#book-out").value.split("-").reverse().join("/")+'</span></div>';
 const guarantee=Number(state.property.guarantee_amount_cents||0);
 $("#guarantee-info").innerHTML=guarantee?'<div class="guarantee-card"><small>GARANTIA DA HOSPEDAGEM</small><h4>'+brlC(guarantee)+'</h4><p>Antes do check-in, fazemos uma <strong>pré-autorização no cartão</strong> como garantia da hospedagem. <strong>Não é uma cobrança e nenhum valor é capturado nesse momento.</strong> O valor só poderá ser utilizado, total ou parcialmente, em caso de dano ou ocorrência comprovada. Sem ocorrência, a garantia é liberada. Dependendo do banco emissor, a pré-autorização pode ficar temporariamente reservada no limite do cartão.</p></div>':"";
 const pol=$("#policy-box");pol.innerHTML='<label class="accept-line"><input id="accept-cancel" type="checkbox"> <span>Li e aceito a política <strong>'+state.rate.cancellation_policy.title+'</strong>: '+state.rate.cancellation_policy.body+'</span></label><p class="dev-note">Termos de hospedagem, regras da propriedade e política de privacidade ainda estão em versão de desenvolvimento e precisam de aprovação antes do GO-LIVE.</p>';
 const pay=$("#payment-options"),max=Number(state.config.payment_settings.max_card_installments||1);pay.innerHTML='<label><input type="radio" name="pay-method" value="pix" checked> PIX · expira em '+state.config.payment_settings.pix_expiration_minutes+' min</label><label><input type="radio" name="pay-method" value="card"> Cartão</label><select id="installments">'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'x</option>').join("")+'</select><p class="dev-note">Ambiente de teste: nenhum PIX ou cartão real será criado.</p>';
}
async function performStartPayment(choice){
 const method=choice?.method||"pix",installments=Number(choice?.installments||1);setFlowError("Protegendo temporariamente as datas para iniciar o pagamento…");
 track("payment_started",{property_id:state.property?.id||null,metadata:{method,installments,total_cents:Number(state.rate?.total_amount_cents||0)}});
 try{
  const d=await api("start_payment",{quote_id:state.quote.quote_id,quote_option_id:state.rate.quote_option_id,guest_name:$("#guest-name").value.trim(),guest_email:$("#guest-email").value.trim(),guest_phone:$("#guest-phone").value.trim(),guests:Number($("#book-guests").value),travel_purpose_code:$("#trip-purpose-initial").value,accepted_document_ids:[state.rate.cancellation_policy?.id].filter(Boolean),method,installments});
  renderMockPayment(d);showStep(6);setFlowError("");
 }catch(e){track("payment_failed",{property_id:state.property?.id||null,metadata:{stage:"start_payment",reason:e.message||"unknown"}});setFlowError(e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":e.message==="dates_unavailable"?"Essas datas acabaram de ficar indisponíveis.":"Não foi possível iniciar o pagamento de teste.")}
}
function renderMockPayment(d){
 const exp=(state.quote?.experiences||[]).map(e=>'<div class="summary-line"><span>'+e.product+'</span><strong>'+brlC(e.price_cents)+'</strong></div>').join("");
 const breakdown='<div class="booking-breakdown payment-final"><div class="summary-line"><span>Hospedagem</span><strong>'+brlC(state.rate.stay_amount_cents)+'</strong></div>'+exp+'<div class="summary-total"><span>TOTAL PARA PAGAMENTO</span><strong>'+brlC(state.rate.total_amount_cents)+'</strong></div></div>';
 const box=$("#mock-payment");box.innerHTML='<div class="success-state"><small>PRÉ-RESERVA DE PAGAMENTO</small><h3>'+d.confirmation_code+'</h3><p>Agora sim as datas estão protegidas temporariamente enquanto o pagamento é processado.</p></div>'+breakdown+'<div class="mock-controls"><span>SIMULAR RESULTADO:</span><button data-outcome="paid">Aprovado</button><button data-outcome="under_review">Em análise</button><button data-outcome="refused">Recusado</button><button data-outcome="expired">Expirado</button></div><p id="mock-result"></p>';
 box.querySelectorAll("[data-outcome]").forEach(b=>b.addEventListener("click",async()=>{try{await api("mock_payment",{payment_id:d.payment.id,outcome:b.dataset.outcome});const labels={under_review:"Pagamento em análise",refused:"Pagamento recusado",expired:"Pagamento expirado"};if(b.dataset.outcome==="paid")track("booking_confirmed",{reservation_id:d.reservation_id,property_id:state.property?.id||null,metadata:{total_cents:Number(state.rate?.total_amount_cents||0)}});else if(["refused","expired"].includes(b.dataset.outcome))track("payment_failed",{reservation_id:d.reservation_id,property_id:state.property?.id||null,metadata:{stage:"mock_outcome",reason:b.dataset.outcome}});$("#mock-result").innerHTML=b.dataset.outcome==="paid"?'Reserva confirmada. <a href="conta.html">Ver em Minhas Reservas →</a>':(labels[b.dataset.outcome]||"Estado atualizado")}catch(e){$("#mock-result").textContent="Falha ao simular estado."}}));
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