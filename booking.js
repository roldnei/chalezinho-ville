(()=>{
const C=window.CHALEZINHO_CONFIG,ENGINE=C.bookingEngine,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function downloadPolicyDocument(doc){
 const content=`Chalezinho Ville — ${doc.title}\nVersão ${doc.version}\nCódigo ${doc.code}\n\n${doc.body}\n`;
 const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=`chalezinho-politica-${String(doc.code||"cancelamento").replace(/[^a-z0-9_-]/gi,"-")}-v${String(doc.version||"").replace(/[^0-9.]/g,"")}.txt`;
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const state={config:null,search:null,property:null,selectedByProduct:{},quote:null,rate:null,rateCode:null,session:null,upsellHandled:false,activePayment:null,installmentQuote:null,offerId:null,preferences:{},fastCheckout:false,fastUpdating:false,rateConfirmed:false,stage:"review",entrySource:"manual"};
const pagbankSandbox=window.CHALEZINHO_CONFIG.environment==="development";
let anonymousId="",searchSequence=0;
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
function accessSessionId(){
 try{
  if(navigator.globalPrivacyControl||navigator.doNotTrack==="1")return null;
  const visit=JSON.parse(sessionStorage.getItem("ville-access-session"));
  return visit&&Date.now()-visit.last<=30*60*1000?visit.id:null;
 }catch{return null}
}
function track(event_name,payload={}){api("track",{event_name,anonymous_id:anonymousId,...payload}).catch(()=>{})}

async function flushVillegramAttribution(){
 if(!state.session?.access_token)return;
 try{const pending=JSON.parse(sessionStorage.getItem('villegram-pending-reservation')||'null');if(!pending)return;if(Date.now()-pending.at>86400000){sessionStorage.removeItem('villegram-pending-reservation');return}const r=await fetch(C.supabaseUrl+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.session.access_token},body:JSON.stringify({operation:'attribute',reservation_id:pending.reservation_id,attribution:pending.attribution}),signal:AbortSignal.timeout(10000),keepalive:true});if(r.ok||r.status===404)sessionStorage.removeItem('villegram-pending-reservation')}catch{}
}
setInterval(flushVillegramAttribution,30000);
async function init(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;flushVillegramAttribution();
 try{let last=null;for(let attempt=1;attempt<=3;attempt++){try{state.config=await api("config");last=null;break}catch(e){last=e;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,600*attempt))}}if(last)throw last}catch(e){error("Não foi possível carregar as configurações de reserva. Tente atualizar a página.");return}
 const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());const min=today.toISOString().slice(0,10);
 $("#book-in").min=min;$("#book-out").min=min;
 $("#book-in").addEventListener("change",()=>{$("#book-out").min=$("#book-in").value||min;if($("#book-out").value&&$("#book-out").value<=$("#book-in").value)$("#book-out").value=""});
 $("#book-search").addEventListener("click",search);
 $("#checkout-close").addEventListener("click",closeCheckout);$("#upsell-close")?.addEventListener("click",()=>$("#upsell-modal").hidden=true);
 $("#step-back").addEventListener("click",()=>state.stage==="finalize"?openFastCheckout():closeCheckout());
 $("#step-next").addEventListener("click",next);
 await initChaletFilter();
 initStayModes();
 initTripPurpose();
 $("#change-dates").onclick=()=>{document.body.classList.remove("booking-results-screen");document.documentElement.classList.remove("booking-dates-arrival")};
 window.addEventListener("beforeunload",()=>{if(state.property&&!$("#checkout-modal").hidden&&Number($("#checkout-panel").dataset.step)<6)saveResume()});
 renderDevBanner();
 const incoming=new URLSearchParams(location.search);
 if(incoming.has("check_in")&&incoming.has("check_out")&&await restoreResume(true))return;
 if(incoming.has("check_in")&&incoming.has("check_out")){
  $("#book-in").value=incoming.get("check_in");$("#book-out").value=incoming.get("check_out");$("#book-guests").value=incoming.get("guests")||"2";
  await search({scroll:incoming.get("from")!=="showcase"});
  if(incoming.get("from")==="showcase"){
   state.fastCheckout=true;state.entrySource="showcase";
   const property=state.search?.find(p=>p.code===incoming.get("chalet")&&p.available&&p.quote);
   if(incoming.has("stay_offer")&&state.offerId!==incoming.get("stay_offer")){directCheckoutError();return}
   if(property){await openFlow(property.id);const rate=state.quote?.rate_options?.find(r=>r.code===incoming.get("rate")&&r.selectable);
    if(rate){state.rate=rate;state.rateCode=rate.code;await openFastCheckout()}
    else directCheckoutError();
   }else directCheckoutError();
  }
 }else{await restoreResume();await restoreSameDay()}
}
async function initChaletFilter(){
 const select=$("#book-chalet"),requested=new URLSearchParams(location.search).get("chalet")||"";
 try{
  const data=await api("property_media");
  state.properties=data.properties;
  for(const p of data.properties){const option=document.createElement("option");option.value=p.code;option.textContent=p.name;select.appendChild(option)}
 }catch{
  if(requested){const option=document.createElement("option");option.value=requested;option.textContent="Chalé "+requested.slice(0,40);select.appendChild(option)}
 }
 select.value=[...select.options].some(o=>o.value===requested)?requested:"";
 select.addEventListener("change",async()=>{
  const url=new URL(location.href);if(select.value)url.searchParams.set("chalet",select.value);else url.searchParams.delete("chalet");history.replaceState(null,"",url);
  refreshStayOptions();persistSelection();
 });
}
function setCheckoutVisible(visible){
 const modal=$("#checkout-modal"),root=document.documentElement;
 if(visible&&modal.hidden){
  modal.dataset.pageScroll=String(window.scrollY||0);
  root.style.setProperty('--booking-scroll-offset',`-${window.scrollY||0}px`);
  root.classList.add('booking-checkout-open');
  modal.scrollTop=0;
 }
 modal.hidden=!visible;
 if(!visible)root.classList.remove('direct-checkout');
 if(!visible&&root.classList.contains('booking-checkout-open')){
  root.classList.remove('booking-checkout-open');root.style.removeProperty('--booking-scroll-offset');
  window.scrollTo({top:Number(modal.dataset.pageScroll||0),behavior:'instant'});
 }
}
async function closeCheckout(){
 const btn=$("#checkout-close"),step=Number($("#checkout-panel").dataset.step||1),active=state.activePayment;
 if(step===6&&active?.provider==="pagbank_sandbox"){
  setCheckoutVisible(false);setFlowError("");return;
 }
 if(step===6&&active?.payment_id&&active.status==="awaiting_payment"){
  btn.disabled=true;setFlowError("Encerrando a tentativa de pagamento e liberando as datas…");
  try{
   await api("cancel_pending_payment",{payment_id:active.payment_id});
   state.activePayment=null;state.quote=null;state.rate=null;state.rateCode=null;state.selectedByProduct={};state.upsellHandled=false;
   clearInterval(window.__quoteTimer);setCheckoutVisible(false);$("#upsell-modal").hidden=true;setFlowError("");
   await search();
  }catch(e){
   if(e.message==="payment_not_cancellable"){
    setCheckoutVisible(false);setFlowError("");
   }else{
    setFlowError("Não foi possível encerrar a tentativa agora. Tente novamente antes de fechar.");
   }
  }finally{btn.disabled=false}
  return;
 }
 setCheckoutVisible(false);
 if($("#booking-results").classList.contains("booking-results-hidden")&&state.search)await search();
}
function renderDevBanner(){if(document.querySelector(".dev-banner"))return;const b=document.createElement("div");b.className="dev-banner";b.textContent="AMBIENTE DE DESENVOLVIMENTO · "+(pagbankSandbox?"PagBank sandbox, sem cobrança real":"nenhum pagamento real será realizado");document.body.prepend(b)}
function error(t){$("#booking-error").textContent=t;if(t&&!state.search&&document.documentElement.classList.contains("booking-dates-arrival"))$("#booking-list").textContent=t;if(document.documentElement.classList.contains("direct-checkout"))$("#direct-checkout-status p").textContent=t}
function setFlowError(t){$("#checkout-error").textContent=t}

async function search({scroll=true}={}){
 const sequence=++searchSequence;
 const bi=$("#book-in").value,bo=$("#book-out").value,guests=Number($("#book-guests").value);
 if(!bi||!bo||bo<=bi)return error("Escolha datas válidas.");
 error("Consultando disponibilidade e valores...");
 document.body.classList.add("booking-results-screen");$("#booking-results").classList.remove("booking-results-hidden");
 $("#booking-period").textContent=bi.split('-').reverse().join('/')+' → '+bo.split('-').reverse().join('/');$('#availability-count').textContent='Consultando disponibilidade…';$('#booking-list').innerHTML='<p role="status">Buscando estadias para suas datas…</p>';
 window.VillegramSignals?.mark("dates_query");track("search_started",{metadata:{nights:nights(bi,bo),guests}});
 try{
  const q=new URLSearchParams({action:"search",start:bi,end:bo,guests:String(guests)});
  if(state.offerId)q.set("stay_offer_id",state.offerId);
  persistSelection();
  const r=await fetch(ENGINE+"?"+q,{headers:{"X-Chalezinho-Env":"development"}}),d=await r.json();
  if(sequence!==searchSequence)return;
  if(!r.ok||!d.ok)throw new Error(d.error||"search_failed");
  state.search=d.listings;document.body.classList.add("booking-results-screen");renderResults(d.listings,{scroll});error("");
  track("search_completed",{metadata:{nights:nights(bi,bo),guests,available_count:d.listings.filter(x=>x.available).length}});
 }catch(e){if(sequence===searchSequence){$('#availability-count').textContent='Consulta indisponível';$('#booking-list').innerHTML='<p role="status">Não foi possível consultar agora. Use “Alterar datas e motivo da viagem” para tentar novamente.</p>';error("Não foi possível consultar agora. Tente novamente.");}}
}
function renderResults(list,{scroll=true}={}){
 const code=$("#book-chalet").value;
 if(code)list=list.filter(p=>p.code===code);
 const box=$("#booking-list");box.innerHTML="";$("#booking-results").classList.remove("booking-results-hidden");
 const available=list.filter(x=>x.available).length;$("#availability-count").textContent=available+(available===1?" opção disponível":" opções disponíveis");
 $("#booking-period").textContent=$("#book-in").value.split("-").reverse().join("/")+" → "+$("#book-out").value.split("-").reverse().join("/");
 if(!list.length)box.innerHTML='<p>Este imóvel não está disponível para consulta. Selecione “Todos os imóveis” para ver outras opções.</p>';
 list.forEach(p=>{
  const a=document.createElement("article");a.className="booking-property"+(p.available?"":" is-unavailable");
  const feats=(Array.isArray(p.features)?p.features:p.features?.amenities||[]).filter(x=>typeof x==='string').map(x=>"<span>"+(window.VilleAmenities?.icon(x)||"")+esc(x)+"</span>").join("");
  const availabilityMessages={maximum_stay:"Estadia acima do máximo permitido",advance_notice:"Antecedência mínima não atendida",same_day_cutoff:"Horário limite para hoje encerrado",availability_window:"Fora do período disponível",checkin_day:"Check-in não permitido neste dia",checkout_day:"Checkout não permitido neste dia",past_date:"Data de entrada já passou"};
  const status=p.requestable?"Sujeito à aprovação":availabilityMessages[p.unavailable_reason]||(p.available?"Disponível":p.unavailable_reason==="minimum_stay"?"Estadia mínima não atendida":p.unavailable_reason==="occupied"?"Datas ocupadas":"Tarifa indisponível");
  const minNotice=p.unavailable_reason==="minimum_stay"?'<div class="minimum-stay-alert"><small>MÍNIMO DE ESTADIA</small><strong>'+p.min_stay+' '+(Number(p.min_stay)===1?"noite":"noites")+'</strong><span>Para estas datas, este imóvel exige no mínimo '+p.min_stay+' '+(Number(p.min_stay)===1?"noite":"noites")+'.</span></div>':"";
  const total=p.from_stay_price!=null?Number(p.from_stay_price):null;
  const preview=total!=null?brl(total):"—", perNight=total!=null?brl(total/stayNights()):"—";
  const fromRate=p.quote?.rate_options?.filter(x=>x.selectable).sort((a,b)=>a.total_amount_cents-b.total_amount_cents)[0];
  const offerBlocked=state.offerId&&(p.offer_issues||[]).length;
  const price=p.available&&!offerBlocked?'<small>A PARTIR DE</small><strong>'+preview+'</strong><span class="price-note">'+(state.offerId?'Com experiência incluída':'Somente hospedagem')+' · '+perNight+' por noite'+(fromRate?' · Tarifa '+esc(fromRate.name):'')+'</span>':'<span class="price-note">Escolha outras datas para consultar o valor.</span>';
  a.innerHTML='<div class="booking-gallery"><img src="'+esc(p.cover_image)+'" alt="'+esc(p.name)+'" loading="lazy"></div><div><small>'+esc(({chalet:'Chalé',apartment:'Apartamento',house:'Casa',studio:'Studio'})[p.property_type]||'Imóvel')+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.summary)+'</p><div class="booking-tags">'+feats+'</div>'+minNotice+'</div><div class="booking-price"><span class="availability-status '+(p.available?"available":"unavailable")+'">● '+status+'</span>'+price+'<button class="booking-select" '+(p.available||p.requestable?"":"disabled")+' data-id="'+p.id+'">'+(p.requestable?"Pedir aprovação":p.available?"Escolher esta estadia":"Indisponível")+'</button></div>';
  VilleImages.set(a.querySelector(".booking-gallery img"),p.cover_image,{sizes:"(max-width: 800px) 100vw, 240px"});
  if(offerBlocked){a.querySelector('.booking-price').insertAdjacentHTML('afterbegin','<p class="offer-unavailable-reason">'+p.offer_issues.map(x=>esc(window.VilleOffers.issues[x]||'Experiência indisponível')).join('. ')+'</p>');const b=a.querySelector('.booking-select');b.textContent='Ver somente hospedagem';b.dataset.stayOnly='1'}
  else if(p.quote){const c=p.quote.rate_options.filter(x=>x.selectable).sort((a,b)=>a.total_amount_cents-b.total_amount_cents)[0]?.contract_snapshot;a.querySelector('.booking-price').insertAdjacentHTML('beforeend',window.VilleOffers.contractMarkup(c))}
  box.appendChild(a);
 });
 box.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",async()=>{if(b.dataset.stayOnly){state.offerId=null;syncStayModes();persistSelection();await search();}const p=state.search.find(x=>x.id===Number(b.dataset.id));return p?.requestable?openSameDayRequest(p.id):openFlow(Number(b.dataset.id))}));
 if(scroll&&$("#checkout-modal").hidden)$("#booking-results").scrollIntoView({behavior:"smooth"});
}

async function openSameDayRequest(propertyId){
 const p=state.search.find(x=>Number(x.id)===propertyId);if(!p)return;
 if(!state.session){const ret=new URLSearchParams({request_property:String(propertyId),check_in:$('#book-in').value,check_out:$('#book-out').value,guests:$('#book-guests').value,purpose:$('#trip-purpose-initial').value});location.href='auth.html?mode=login&return='+encodeURIComponent('reservar.html?'+ret);return}
 let dialog=$('#same-day-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='same-day-dialog';dialog.className='same-day-dialog';document.body.appendChild(dialog)}
 dialog.innerHTML=`<h2>Pedido de reserva para hoje</h2><p>${esc(p.name)} · ${esc($('#book-in').value)} a ${esc($('#book-out').value)}</p><p><strong>Este pedido passará por aprovação.</strong> Nenhuma cobrança será feita agora. Após a aprovação, você deverá escolher a tarifa e pagar para confirmar. As datas não ficam garantidas enquanto o pagamento não for iniciado.</p><form id="same-day-form"><label>Nome<input name="guest_name" required minlength="2" maxlength="160" autocomplete="name"></label><label>Telefone<input name="guest_phone" required minlength="8" maxlength="30" autocomplete="tel"></label><label>Horário previsto de chegada<input name="estimated_arrival_time" type="time" required></label><p>Informe o horário local de Guarapari. A previsão será analisada junto com seu pedido.</p><label>Mensagem (opcional)<textarea name="note" maxlength="1000"></textarea></label><p id="same-day-message" role="status"></p><button type="submit">Enviar pedido para aprovação</button><button type="button" id="close-same-day">Voltar</button></form>`;
 dialog.showModal();$('#close-same-day').onclick=()=>dialog.close();$('#same-day-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;
 try{await api('same_day_request',{operation:'create',property_id:propertyId,check_in:$('#book-in').value,check_out:$('#book-out').value,guests:Number($('#book-guests').value),guest_name:f.elements.guest_name.value,guest_phone:f.elements.guest_phone.value,estimated_arrival_time:f.elements.estimated_arrival_time.value,note:f.elements.note.value});dialog.innerHTML='<h2>Pedido recebido</h2><p>A equipe foi avisada com prioridade. Acompanhe a aprovação em Minhas reservas.</p><a class="primary-action" href="conta.html">Acompanhar pedido</a><button id="close-same-day" type="button">Fechar</button>';$('#close-same-day').onclick=()=>dialog.close()}
 catch(e){$('#same-day-message').textContent=e.message==='dates_unavailable'?'Estas datas não estão mais disponíveis para pedido. Consulte novamente.':'Não foi possível enviar o pedido. Confira os dados e tente novamente.';b.disabled=false}};
}
async function restoreSameDay(){
 const q=new URLSearchParams(location.search),id=q.get('approved_request');
 if(id){try{const {request:r}=await api('same_day_request',{operation:'get',id});if(r.status!=='approved')throw Error('expired');state.approvedRequest=r.id;$('#book-in').value=r.check_in;$('#book-out').value=r.check_out;$('#book-guests').value=r.guests;await search();await openFlow(Number(r.property_id))}catch{error('Este pedido não está aprovado ou expirou. Consulte Minhas reservas.')}return}
 if(q.has('request_property')){$('#book-in').value=q.get('check_in')||'';$('#book-out').value=q.get('check_out')||'';$('#book-guests').value=q.get('guests')||'2';await search();if(state.search.some(p=>p.requestable&&p.id===Number(q.get('request_property'))))openSameDayRequest(Number(q.get('request_property')))}
}

async function openFlow(id){
 state.fastCheckout=true;state.rateConfirmed=false;state.stage="review";state.property=state.search.find(x=>Number(x.id)===id);state.selectedByProduct={};const desiredExperience=new URLSearchParams(location.search).get('experience');const desired=(state.config?.experience_products||[]).find(p=>p.id===desiredExperience);const variant=desired?.experience_variants?.find(v=>v.active);if(!state.offerId&&desired&&variant)state.selectedByProduct[desired.id]=variant.id;state.quote=null;state.rate=null;state.rateCode=null;state.upsellHandled=false;
 track("property_viewed",{property_id:state.property.id,metadata:{nights:stayNights()}});
 setCheckoutVisible(true);$("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=$("#book-in").value.split("-").reverse().join("/")+" a "+$("#book-out").value.split("-").reverse().join("/");
 if(state.fastCheckout)$("#summary-content").innerHTML='<p class="loading-state">Confirmando sua escolha…</p>';
 showStep(2);$("#rate-options").innerHTML='<div class="loading-state">Preparando as tarifas…</div>';setFlowError("");
 try{
  await generateQuote(true);state.rate=state.quote.rate_options.find(r=>r.selectable)||null;state.rateCode=state.rate?.code||null;if(state.rate)await openFastCheckout();
 }catch(e){
  if(e.message==="minimum_stay"){
    const min=Number(e.data?.min_stay||state.property?.min_stay||1);
    setFlowError("Para estas datas, o mínimo de estadia deste chalé é de "+min+" "+(min===1?"noite":"noites")+". Faça uma nova busca com o período mínimo.");
  }else setFlowError(window.VilleOffers.issues[e.message]|| (e.message==="cancellation_policy_unavailable"?"As regras desta tarifa ainda não estão configuradas. Entre em contato para reservar.":"Não foi possível preparar as tarifas. Faça uma nova busca."));
}
}
function showStep(n){
 $('#checkout-panel').dataset.step=String(n);$$('.checkout-step').forEach(x=>x.hidden=Number(x.dataset.step)!==n);
 $('#step-back').hidden=n===6;$('#step-next').hidden=n===6||(n===5&&!state.session);
 $('#reservation-stage-label').textContent=n===2?'2 · SUA ESTADIA':'3 · FINALIZAR RESERVA';
 $('#step-back').textContent=n===5?'← Alterar reserva':'← Ver outros chalés';
 $('#step-next').textContent=n===2?'Continuar para identificação':'Ir para pagamento de teste';setFlowError('');
}
async function generateQuote(withExperiences){
 const controls=['#stay-mode','#checkout-stay-mode','#step-next'].map($).filter(Boolean);controls.forEach(x=>x.disabled=true);
 try{
 const chosen=withExperiences?Object.values(state.selectedByProduct):[];
 const q=await api("quote",{property_id:state.property.id,check_in:$("#book-in").value,check_out:$("#book-out").value,guests:Number($("#book-guests").value),experience_variant_ids:chosen,stay_offer_id:state.offerId||undefined,experience_preferences:state.preferences,same_day_request_id:state.approvedRequest||undefined});
 q.selected_variant_ids=chosen.map(String).sort();q.preferences_key=JSON.stringify(state.preferences);state.quote=q;startCountdown(q.expires_at);renderOfferContext();return q;
 }finally{controls.forEach(x=>x.disabled=x.id==='checkout-stay-mode'&&$('#checkout-panel').dataset.step==='6')}
}
function initTripPurpose(){
 const purpose=$("#trip-purpose-initial");
 let saved={};try{saved=JSON.parse(sessionStorage.getItem('ville-stay-selection')||'{}')}catch{}
 const previous=purpose.value||saved.purpose;purpose.innerHTML='<option value="">Sem preferência</option>'+(state.config.purposes||[]).map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join("");
 purpose.value=new URLSearchParams(location.search).get("purpose")??previous??"";
 const review=$('#trip-purpose-review');review.innerHTML=purpose.innerHTML;review.value=purpose.value;
 const change=e=>{if(state.fastUpdating){e.target.value=purpose.value;return}purpose.value=e.target.value;review.value=purpose.value;persistSelection();refreshStayOptions();if(state.property&&!$('#checkout-modal').hidden)renderExperienceStep()};purpose.onchange=change;review.onchange=change;
}
function renderExperienceStep(){$('#trip-purpose-review').value=$('#trip-purpose-initial').value;renderOfferChoices();renderExperienceList($("#trip-purpose-initial").value);}
function eligibleExperienceProducts(purpose=""){
 const checkIn=$("#book-in")?.value||"";
 const checkInAt=checkIn?Date.parse(checkIn+"T15:00:00-03:00"):Infinity;
 return (state.config.experience_products||[])
  .filter(p=>p.status==="active")
  .filter(p=>p.details?.standalone_enabled!==false&&!selectedOffer()?.product_ids.includes(p.id))
  .filter(p=>!selectedOffer()?.product_ids.some(id=>(state.config.experience_products||[]).find(x=>x.id===id)?.package_type===p.package_type))
  .filter(p=>Number(p.price_cents||0)>0)
  .filter(p=>(p.experience_media||[]).length>=1)
  .filter(p=>p.inventory==null||Number(p.inventory)>0)
  .filter(p=>(p.experience_property_eligibility||[]).some(e=>Number(e.property_id)===Number(state.property.id)))
  .filter(p=>state.selectedByProduct[p.id]||!purpose||!(p.travel_purposes||[]).length||(p.travel_purposes||[]).includes(purpose));
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
   renderExperienceList($("#trip-purpose-initial").value);renderOfferChoices();if(state.fastCheckout)updateFastQuote();
 }));
 $$("[data-remove]").forEach(b=>b.addEventListener("click",()=>{delete state.selectedByProduct[b.dataset.remove];state.upsellHandled=false;renderExperienceList($("#trip-purpose-initial").value);renderOfferChoices();if(state.fastCheckout)updateFastQuote()}));
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
 return {method:document.querySelector('input[name="pay-method"]:checked')?.value||"pix",installments:Number($("#installments")?.value||0)};
}
async function maybeOfferUpsell(){
 if(!$("#accept-all")?.checked){setFlowError("Aceite os termos e a política de cancelamento para continuar.");return}
 const choice=paymentChoice();
 if(choice.method==="card"&&(!choice.installments||$("#installments").disabled)){setFlowError("Escolha uma opção de parcelamento disponível para este cartão.");return}
 if(state.upsellHandled){await performStartPayment(choice);return}
 setFlowError("Verificando a melhor opção antes do pagamento…");
 let candidate=null;
 try{candidate=await serverUpsellPreview()}catch(e){if(e.message==="policy_version_changed"){try{const current=await api("legal_documents");state.config.required_booking_documents=current.documents;renderSummary()}catch{}setFlowError("Os documentos foram atualizados. Leia e aceite a nova versão antes de pagar.");return}
  setFlowError(e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":"Não foi possível verificar o upsell.");return}
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
     state.quote.selected_variant_ids=Object.values(state.selectedByProduct).map(String).sort();

     renderSummary();
     track("experience_upgraded",{property_id:state.property?.id||null,metadata:{from_product_id:candidate.from_product_id,to_product_id:candidate.to_product_id,difference_cents:Number(candidate.difference_cents||0)}});
     $("#upsell-total").textContent="Pacote atualizado · novo total: "+brlC(state.rate.total_amount_cents);
     $("#upsell-copy").innerHTML='<strong>'+candidate.to_name+'</strong> foi aplicado à reserva.';
     $("#upsell-yes").textContent="Continuar para pagamento";
     $("#upsell-no").hidden=true;
     $("#upsell-yes").disabled=false;
     $("#upsell-yes").onclick=async()=>{$("#upsell-modal").hidden=true;if(!validExperienceChoices()){showStep(2);renderExperienceStep();return;}
       setFlowError("O pacote mudou. Confira o novo total e consulte novamente as parcelas antes de pagar.")};
   }catch(e){
     $("#upsell-total").textContent="Não foi possível atualizar o pacote.";
     $("#upsell-yes").disabled=false;$("#upsell-no").disabled=false;
     if(e.message==="upsell_not_available")$("#upsell-copy").textContent="A condição do pacote mudou. Feche esta oferta e tente novamente.";
   }
 };
}
async function refreshQuoteAfterExperiences(){
 const chosen=Object.values(state.selectedByProduct).map(String).sort();
 const previous=state.quote?.selected_variant_ids||((state.quote?.experiences||[]).length===0?[]:null);
 if(previous&&JSON.stringify(previous)===JSON.stringify(chosen)&&(state.quote?.preferences_key??"{}")===JSON.stringify(state.preferences)){
  if(Date.parse(state.quote.expires_at)<=Date.now())throw new Error("quote_expired");
  return;
 }
 const code=state.rateCode;setFlowError("Atualizando o pacote com suas escolhas…");
 await generateQuote(true);state.rateCode=code;state.rate=state.quote.rate_options.find(x=>x.code===code&&x.selectable)||null;state.upsellHandled=false;setFlowError("");
}

const cpfPaymentMessage="Para pagar pelo PagBank, o titular da reserva precisa ter CPF cadastrado. Passaporte é aceito na identificação da hospedagem, mas não substitui o CPF neste pagamento. Fale com nosso atendimento para orientar a atualização do cadastro.";
async function checkPaymentIdentity(){
 const identity=await api("identity_status");
 if(!identity.payment_eligible)throw new Error("pagbank_cpf_required");
}
async function next(){
 if(state.stage==='review'){
  if(!state.rateConfirmed)return setFlowError('Escolha a tarifa para continuar.');
  if(!validExperienceChoices())return setFlowError('Escolha as preferências dos itens do pacote antes de continuar.');
  if(state.fastUpdating)return;
  try{await refreshQuoteAfterExperiences();if(!state.rate)return directCheckoutError();await openFinalization()}
  catch(e){setFlowError(window.VilleOffers.issues[e.message]||'Não foi possível confirmar suas escolhas. Tente novamente.')}return;
 }
 await payFastCheckout();
}
async function renderLoginStep(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;const box=$('#login-state');
 if(session){const {data:u}=await sb.auth.getUser();if(u.user)state.session={...session,user:u.user};box.innerHTML='<p class="success-state">✓ Conectado como '+esc(state.session.user?.email||'')+'</p>';return}
 const ret=encodeURIComponent('reservar.html?resume=1'+(pagbankSandbox?'&pagbank=sandbox':''));
 box.innerHTML='<p>Entre para continuar com seus dados, termos e pagamento. Sua escolha está guardada.</p><form id="checkout-login"><label>E-mail<input id="checkout-login-email" type="email" autocomplete="username" required></label><label>Senha<input id="checkout-login-password" type="password" autocomplete="current-password" required></label><button class="primary-action" type="submit">Entrar e continuar</button><p id="checkout-login-error" role="status"></p></form><p><a id="checkout-signup" href="auth.html?mode=signup&return='+ret+'">Criar minha conta</a> · <a id="checkout-recover" href="auth.html?mode=recover&return='+ret+'">Esqueci a senha</a></p>';
 box.querySelectorAll('a').forEach(a=>a.addEventListener('click',saveResume));
 $('#checkout-login').onsubmit=async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector('button');if(button.disabled)return;button.disabled=true;saveResume();
  try{const {data,error}=await sb.auth.signInWithPassword({email:$('#checkout-login-email').value.trim(),password:$('#checkout-login-password').value});$('#checkout-login-password').value='';
   if(error||!data?.session){$('#checkout-login-error').textContent=error?.code==='email_not_confirmed'?'Confirme seu e-mail antes de entrar.':'Não foi possível entrar. Confira e-mail e senha ou tente novamente.';return}
   state.session=data.session;await openFinalization();
  }catch{$('#checkout-login-error').textContent='Não foi possível conectar ao login. Tente novamente.'}finally{button.disabled=false}
 };
}
async function openFinalization(){
 state.stage='finalize';showStep(5);$('#authenticated-finalization').hidden=true;
 $('#final-selection').textContent=state.property.name+' · '+state.rate.name+' · '+brlC(state.rate.total_amount_cents);
 $('#final-summary-slot').appendChild($('#summary-content'));
 $('#guarantee-info').innerHTML='';$('#policy-box').innerHTML='';$('#payment-options').innerHTML='';
 await renderLoginStep();
 if(!state.session){$('#step-next').hidden=true;return}
 renderGuestStep();renderSummary();$('#authenticated-finalization').hidden=false;$('#step-next').hidden=false;
 try{const identity=await api('identity_status');$('#identity-state').innerHTML=identity.complete?'':'<p>Complete sua identificação para pagar. Sua reserva será mantida.</p><a id="complete-identity" href="auth.html?mode=identify&return='+encodeURIComponent('reservar.html?resume=1')+'">Completar CPF ou passaporte</a>';$('#complete-identity')?.addEventListener('click',saveResume)}catch{setFlowError('Não foi possível conferir a identificação agora. Tente novamente antes de pagar.')}
}
function renderGuestStep(){
 $("#guest-promotions").checked=state.session?.user?.user_metadata?.marketing_opt_in===true;
 const meta=state.session?.user?.user_metadata||{};$("#guest-name").value=$("#guest-name").value||meta.full_name||"";$("#guest-email").value=state.session?.user?.email||"";$("#guest-phone").value=$("#guest-phone").value||meta.phone||"";
}
function validateGuest(){if(!$("#guest-name").value.trim()||!$("#guest-email").value.trim()||!$("#guest-phone").value.trim()){setFlowError("Preencha seus dados.");return false}return true}
function renderSelectionSummary(){
 const total=Number(state.rate.total_amount_cents||0),stay=Number(state.rate.stay_amount_cents||0);
 const perNight=Math.round(stay/stayNights());
 const experiences=state.quote?.experiences||[];
 const expRows=experiences.map(e=>'<div class="summary-line"><span>'+e.product+'</span><strong>'+brlC(state.rate?.contract_snapshot?.lines?.find(l=>l.key===e.product_id)?.net_cents??e.price_cents)+'</strong></div>').join("");
 $("#summary-content").innerHTML=window.VilleOffers.contractMarkup(state.rate.contract_snapshot)+'<div class="booking-breakdown"><div class="summary-line"><span>Hospedagem e limpeza · '+stayNights()+' noites<small>'+brlC(perNight)+' por noite</small></span><strong>'+brlC(stay)+'</strong></div>'+expRows+'<div class="summary-total"><span>'+(state.fastCheckout&&!state.rateConfirmed?'TOTAL DA TARIFA EXIBIDA · ESCOLHA SUA TARIFA':'TOTAL DA RESERVA')+'</span><strong>'+brlC(total)+'</strong></div></div><div class="summary-line summary-meta"><span>'+state.property.name+'</span><span>'+(state.fastCheckout&&!state.rateConfirmed?'Tarifa a escolher':state.rate.name)+'</span></div><div class="summary-line summary-meta"><span>Datas</span><span>'+$("#book-in").value.split("-").reverse().join("/")+' → '+$("#book-out").value.split("-").reverse().join("/")+'</span></div>';
}
function renderSummary(){
 renderSelectionSummary();
 const total=Number(state.rate.total_amount_cents||0);
 const guarantee=Number(state.property.guarantee_amount_cents||0);
 const guaranteeBody=guarantee?'Informe o cartão neste pagamento para a caução. O PagBank guarda os dados do cartão; o site guarda apenas um token vinculado à reserva. A pré-autorização será solicitada perto do check-in e reservará temporariamente '+brlC(guarantee)+' do limite, sem cobrança. Uma ocorrência comprovada poderá gerar captura parcial; sem dano, a autorização será liberada. Em estadias longas, cada autorização tem prazo próprio. O aceite da garantia e de suas renovações é obrigatório para reservar. A renovação pode bloquear temporariamente até duas vezes o valor da caução, até a liberação da autorização anterior. Autorizo o uso deste cartão exclusivamente para a caução desta reserva e suas renovações durante a estadia, conforme estas regras.':'';
 $("#guarantee-info").innerHTML=guarantee?'<p class="guarantee-notice">Caução: <strong>'+brlC(guarantee)+'</strong> de limite reservado no cartão, sem cobrança imediata. As regras da garantia e da renovação estão nos Termos de Hospedagem abaixo.</p>':"";
 const doc=state.rate.cancellation_policy;
 const pol=$("#policy-box");pol.innerHTML='<div class="policy-document"><strong>'+esc(doc.title)+' · versão '+esc(doc.version)+'</strong><p>'+esc(doc.body)+'</p><button id="download-cancel-policy" type="button" class="text-action">Baixar esta versão da política (.txt)</button></div>';
 const requiredDocs=state.config.required_booking_documents||[];
 pol.insertAdjacentHTML("beforeend",requiredDocs.map(d=>'<details class="policy-document"><summary>'+esc(d.title)+' · versão '+esc(d.version)+'</summary><p>'+esc(d.body)+'</p><button type="button" class="text-action" data-download-document="'+esc(d.id)+'">Baixar esta versão (.txt)</button></details>').join('')+'<label class="accept-line"><input id="accept-all" type="checkbox" required><span>Li e aceito os Termos de Hospedagem, as Regras da Propriedade e a política de cancelamento da tarifa que escolhi'+(guarantee?', incluindo o uso do cartão para a caução e suas renovações, com possível sobreposição temporária dos limites bloqueados':'')+'. Estou ciente da Política de Privacidade.</span></label>');
 if(guarantee&&!requiredDocs.some(d=>d.document_type==='hosting_terms'))pol.insertAdjacentHTML('afterbegin','<details class="policy-document"><summary>Termos da garantia · versão 2</summary><p>'+esc(guaranteeBody)+'</p></details>');
 pol.querySelectorAll('[data-download-document]').forEach(b=>b.onclick=()=>downloadPolicyDocument(requiredDocs.find(d=>d.id===b.dataset.downloadDocument)));
 $("#download-cancel-policy").addEventListener("click",()=>downloadPolicyDocument(doc));
 if(state.fastCheckout){
  const documentBox=pol.querySelector('.policy-document');
  const details=document.createElement('details');details.className='policy-document';
  const summary=document.createElement('summary');summary.textContent=doc.title+' · versão '+doc.version;
  details.hidden=!state.rateConfirmed;details.appendChild(summary);while(documentBox.firstChild)details.appendChild(documentBox.firstChild);documentBox.replaceWith(details);
 }

 if(state.fastCheckout){$("#accept-all").disabled=!state.rateConfirmed;$("#step-next").disabled=!state.rateConfirmed;}
 const pay=$("#payment-options"),terms=state.property.features?.payment_terms||{max_installments:12,no_interest_installments:6};
 const max=Math.min(Number(terms.max_installments),Math.max(1,Math.floor(total/500)));
 const free=terms.interest_payer==="merchant"?max:Math.min(Number(terms.no_interest_installments),max);
 state.installmentQuote=null;
 pay.innerHTML='<label><input type="radio" name="pay-method" value="pix" checked> PIX · expira em '+state.config.payment_settings.pix_expiration_minutes+' min</label><label><input type="radio" name="pay-method" value="card"> Cartão · até '+free+'x sem juros; até '+max+'x com juros após '+free+'x</label><label id="installment-field">Parcelamento<select id="installments" aria-label="Parcelas no cartão"><option value="">Consultando parcelas…</option></select></label><p id="installment-total" role="status">Total no Pix e cartão sem juros: '+brlC(total)+'.</p><p id="installment-warning" role="status"></p><p class="dev-note">Ambiente de teste: nenhum PIX ou cartão real será criado.</p>';
 if(pagbankSandbox){
  const enabled=state.config.payment_settings;
  const methods=[...pay.querySelectorAll('input[name="pay-method"]')];
  methods.forEach(r=>{r.disabled=enabled.active_provider!=="pagbank_sandbox"||enabled[r.value+"_enabled"]!==true;r.checked=false;});
  const first=methods.find(r=>!r.disabled);if(first)first.checked=true;
  else $("#installment-warning").textContent="Pagamentos temporariamente indisponíveis.";
  pay.querySelector(".dev-note").textContent="PagBank sandbox: use somente cartões de teste. Nenhuma cobrança real será feita.";
  const card=document.createElement("div");card.id="sandbox-card-fields";card.hidden=!guarantee;
  card.innerHTML='<label>Nome no cartão<input id="card-holder" autocomplete="cc-name"></label><label>Número do cartão<input id="card-number" inputmode="numeric" autocomplete="cc-number"></label><div class="sandbox-card-row"><label>Mês<input id="card-month" inputmode="numeric" maxlength="2" autocomplete="cc-exp-month"></label><label>Ano<input id="card-year" inputmode="numeric" maxlength="4" autocomplete="cc-exp-year"></label><label>CVV<input id="card-cvv" inputmode="numeric" autocomplete="cc-csc"></label></div>';
  pay.appendChild(card);
  const optionId=state.rate.quote_option_id;
  const refreshPlans=async()=>{
    const previousInstallments=$("#installments").value;
    $("#installments").disabled=true;
    const bin=$("#card-number").value.replace(/\D/g,"").slice(0,6);
    state.installmentQuote=null;
    try{const quote=await api("installment_options",{quote_option_id:optionId,credit_card_bin:bin.length===6?bin:undefined});
      if(bin!==$("#card-number").value.replace(/\D/g,"").slice(0,6))return;
      if(state.rate.quote_option_id!==optionId)return;
      state.installmentQuote={...quote,optionId,cardBin:bin};
      $("#installments").innerHTML=quote.plans.map(p=>`<option value="${p.installments}">${p.installments}x de ${brlC(p.installment_cents)} · total ${brlC(p.total_cents)} · ${p.interest_free?"sem juros":"com juros"}</option>`).join("");
      if(previousInstallments){
        if(quote.plans.some(p=>String(p.installments)===previousInstallments))$("#installments").value=previousInstallments;
        else {$("#installments").insertAdjacentHTML("afterbegin",'<option value="">Escolha outra opção de parcelamento</option>');$("#installments").value=""}
      }
      $("#installments").disabled=false;$("#installments").dispatchEvent(new Event("change"));
    }catch{$("#installment-total").textContent="Parcelas indisponíveis. Tente consultar novamente.";}
  };
  $("#installments").addEventListener("change",()=>{
    if(paymentChoice().method!=="card"){$("#installment-total").textContent="Total no Pix: "+brlC(total)+".";return;}
    const plan=state.installmentQuote?.plans.find(p=>p.installments===Number($("#installments").value));
    $("#installment-total").textContent=plan?`${state.installmentQuote?.indicative?"Estimativa; informe o cartão para confirmar":"Total a cobrar"}: ${brlC(plan.total_cents)}. ${plan.interest_free?"Sem juros.":"Juros: "+brlC(plan.buyer_interest_cents)+"."} Condição válida até ${new Date(state.installmentQuote.expires_at).toLocaleTimeString("pt-BR")}.`:"Escolha uma opção de parcelamento disponível para este cartão.";
  });
  const retryPlans=document.createElement("button");retryPlans.type="button";retryPlans.textContent="Consultar parcelas novamente";retryPlans.onclick=refreshPlans;pay.insertBefore(retryPlans,card);
  if(enabled.card_enabled&&(!state.fastCheckout||state.session))refreshPlans();
  else if(state.fastCheckout&&!state.session)$("#installment-total").textContent="Entre na sua conta para consultar as parcelas e finalizar o pagamento.";
  let previousBin="",binTimer;$("#card-number").addEventListener("input",()=>{
   const bin=$("#card-number").value.replace(/\D/g,"").slice(0,6);
   if(bin===previousBin)return;previousBin=bin;state.installmentQuote=null;
   $("#installments").disabled=true;clearTimeout(binTimer);
   if(bin.length===6)binTimer=setTimeout(refreshPlans,300);
  });
  const updateMethod=()=>{const isCard=paymentChoice().method==="card";
    card.hidden=(state.fastCheckout&&!state.session)||(!guarantee&&!isCard);$("#installment-field").hidden=!isCard;retryPlans.hidden=!isCard;
    $("#installments").dispatchEvent(new Event("change"));};
  pay.querySelectorAll('input[name="pay-method"]').forEach(r=>r.addEventListener("change",updateMethod));updateMethod();
  const resume=document.createElement("button");resume.type="button";resume.className="text-action";
  resume.textContent="Consultar minha última cobrança de teste";pay.appendChild(resume);
  resume.onclick=async()=>{resume.disabled=true;
   try{const s=await api("pagbank_sandbox_status",{});
    state.activePayment={payment_id:s.payment_id,provider:"pagbank_sandbox",status:s.payment_status};
    renderSandboxPayment({payment:{id:s.payment_id,amount_cents:s.amount_cents},confirmation_code:"Última cobrança de teste"});
    showStep(6);setFlowError("");
   }catch(e){setFlowError(e.message==="not_found"?"Nenhuma cobrança de teste recente foi encontrada.":"Não foi possível consultar a cobrança agora.");}
   finally{resume.disabled=false;}};
 }
}
function loadPagBankSdk(){
 if(window.PagSeguro?.encryptCard)return Promise.resolve();
 return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";script.onload=resolve;script.onerror=()=>reject(new Error("card_sdk_unavailable"));document.head.appendChild(script)});
}
async function encryptSandboxCard(){
 const key=await api("pagbank_sandbox_card_key");await loadPagBankSdk();
 const card=window.PagSeguro.encryptCard({publicKey:key.public_key,holder:$("#card-holder").value.trim(),
  number:$("#card-number").value.replace(/\D/g,""),expMonth:$("#card-month").value,
  expYear:$("#card-year").value,securityCode:$("#card-cvv").value});
 if(card.hasErrors||!card.encryptedCard)throw new Error("invalid_test_card");
 ["#card-number","#card-month","#card-year","#card-cvv"].forEach(id=>$(id).value="");
 return card.encryptedCard;
}
function bookingConsentPayload(){
 const accepted=$('#accept-all')?.checked===true;
 const guarantee=Number(state.property?.guarantee_amount_cents||0)>0;
 return {terms_consent:accepted,accepted_document_ids:accepted?[state.rate.cancellation_policy?.id,...(state.config.required_booking_documents||[]).map(d=>d.id)].filter(Boolean):[],guarantee_card_consent:guarantee&&accepted,guarantee_renewal_consent:guarantee&&accepted,guarantee_consent_version:'guarantee-v2'};
}
async function performStartPayment(choice){
 if(state.fastCheckout&&!state.rateConfirmed){setFlowError('Escolha uma tarifa antes de pagar.');return}
 const method=choice?.method||"pix",installments=Number(choice?.installments||1);setFlowError("Protegendo temporariamente as datas para iniciar o pagamento…");
 track("payment_started",{property_id:state.property?.id||null,metadata:{method,installments,total_cents:Number(state.rate?.total_amount_cents||0)}});
 try{
  const credit_card_bin=method==="card"?$("#card-number").value.replace(/\D/g,"").slice(0,6):undefined;
  const quoted=state.installmentQuote;
  const plan=quoted?.plans.find(p=>p.installments===installments);
  if(method==="card"&&(!plan||!quoted.offer_id||quoted.optionId!==state.rate.quote_option_id||quoted.cardBin!==credit_card_bin))
    throw new Error("installment_quote_required");
  if(!$("#accept-all")?.checked)throw new Error("policy_acceptance_required");
  const current=await api("legal_documents");
  if(current.documents.map(d=>d.id).join()!==(state.config.required_booking_documents||[]).map(d=>d.id).join()){
   state.config.required_booking_documents=current.documents;renderSummary();throw new Error("policy_version_changed");
  }
  const hasGuarantee=Number(state.property?.guarantee_amount_cents||0)>0;
  if(hasGuarantee&&!$("#accept-all")?.checked)throw new Error("guarantee_consent_required");
  const encrypted_card=pagbankSandbox&&(method==="card"||hasGuarantee)?await encryptSandboxCard():undefined;
  const d=await api("start_payment",{access_session_id:accessSessionId(),villegram_attribution:window.VillegramSignals?.attribution(),quote_id:state.quote.quote_id,quote_option_id:state.rate.quote_option_id,guest_name:$("#guest-name").value.trim(),guest_email:$("#guest-email").value.trim(),guest_phone:$("#guest-phone").value.trim(),guests:Number($("#book-guests").value),travel_purpose_code:$("#trip-purpose-initial").value,...bookingConsentPayload(),method,installments,credit_card_bin,installment_offer_id:quoted?.offer_id,quoted_total_cents:plan?.total_cents,...(pagbankSandbox?{provider:"pagbank_sandbox",encrypted_card}:{})});
  const attribution=window.VillegramSignals?.attribution();if(attribution&&d.reservation_id){try{sessionStorage.setItem('villegram-pending-reservation',JSON.stringify({reservation_id:d.reservation_id,attribution,at:Date.now()}))}catch{}flushVillegramAttribution();}
  state.activePayment={payment_id:d.payment.id,reservation_id:d.reservation_id,status:d.payment.status||"awaiting_payment",provider:d.payment.provider};
  if(pagbankSandbox)renderSandboxPayment(d);else renderMockPayment(d);
  showStep(6);setFlowError("");
 }catch(e){track("payment_failed",{property_id:state.property?.id||null,metadata:{stage:"start_payment",reason:e.message||"unknown"}});
  if(e.message==="pagbank_start_uncertain"&&e.data?.payment_id){
   const id=e.data.payment_id;state.activePayment={payment_id:id,provider:"pagbank_sandbox",status:"awaiting_payment"};
   renderSandboxPayment({payment:{id,amount_cents:Number(state.rate?.total_amount_cents||0)},confirmation_code:"Cobrança de teste em verificação"});
   showStep(6);setFlowError("A cobrança pode ter sido criada. Consultando o PagBank; não inicie outra reserva agora.");return;
  }
  if(e.message==="policy_version_changed"){try{const current=await api("legal_documents");state.config.required_booking_documents=current.documents;renderSummary()}catch{}setFlowError("Os documentos foram atualizados. Leia e aceite a nova versão antes de pagar.");return}
  setFlowError(e.message==="pagbank_cpf_required"?cpfPaymentMessage:e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":e.message==="installment_quote_required"||e.message==="installment_quote_changed"?"Consulte novamente as parcelas no PagBank antes de pagar.":e.message==="dates_unavailable"?"Essas datas acabaram de ficar indisponíveis.":e.message==="guarantee_consent_required"?"O aceite da garantia e da renovação automática é obrigatório para reservar.":e.message==="policy_acceptance_required"?"Aceite os termos e a política de cancelamento antes de pagar.":e.message==="booking_terms_unavailable"?"Os termos da reserva estão indisponíveis. Tente novamente mais tarde.":e.message==="guarantee_card_unavailable"?"O PagBank não conseguiu guardar o cartão da caução. Nenhuma reserva foi iniciada; tente novamente.":e.message==="guarantee_card_required"?"Informe o cartão da caução e aceite as regras antes de pagar.":e.message==="pagbank_customer_name_invalid"?"Revise o nome completo: remova colchetes e outros símbolos especiais.":e.message==="pagbank_card_rejected"?"O PagBank recusou os dados da solicitação. Confira os dados do hóspede e do cartão e inicie uma nova cotação.":e.message==="invalid_test_card"?"Confira os dados do cartão de teste.":"Não foi possível iniciar o pagamento de teste.")}
}
function renderSandboxPayment(d){
 clearInterval(window.__quoteTimer);
 $("#quote-countdown").textContent="Pagamento iniciado · aguardando confirmação";
 const box=$("#mock-payment"),pix=d.payment.pix_code;
 box.innerHTML=window.VilleOffers.contractMarkup(state.rate?.contract_snapshot)+'<div class="success-state"><small>PAGBANK SANDBOX</small><h3>'+esc(d.confirmation_code)+'</h3><p>Valor: '+brlC(d.payment.amount_cents)+'. Esta cobrança utiliza apenas o ambiente de testes.</p></div>'+
  (pix?'<label>Pix copia e cola<textarea readonly id="sandbox-pix-code"></textarea></label><button type="button" id="sandbox-copy-pix">Copiar Pix</button>':'<p id="sandbox-provider-progress">O cartão de teste foi enviado. Consultando o resultado…</p>')+
  '<p id="sandbox-payment-result" role="status">Aguardando confirmação do PagBank.</p>';
 if(pix){$("#sandbox-pix-code").value=pix;$("#sandbox-copy-pix").onclick=async()=>{
  const button=$("#sandbox-copy-pix");
  try{await navigator.clipboard.writeText(pix);button.textContent="Pix copiado";}
  catch{button.textContent="Selecione e copie o código Pix";$("#sandbox-pix-code").focus();$("#sandbox-pix-code").select();}
 }}
 const tick=async()=>{if(state.activePayment?.payment_id!==d.payment.id)return;
  try{const s=await api("pagbank_sandbox_status",{payment_id:d.payment.id});
   if(s.manual_review||s.reservation_status==="confirmed"||["refused","cancelled","expired"].includes(s.payment_status))$("#sandbox-provider-progress")?.remove();
   if(s.manual_review){setFlowError("");$("#sandbox-payment-result").textContent="Pagamento requer conferência manual. Entre em contato antes de tentar novamente.";clearInterval(window.__pagbankPoll);return}
   if(s.reservation_status==="confirmed"){setFlowError("");$("#quote-countdown").textContent="Reserva confirmada";state.activePayment.status='paid';$("#sandbox-payment-result").innerHTML='Pagamento aprovado no sandbox. Reserva confirmada. <a href="conta.html#reservas">Ver em Minhas Reservas →</a>';clearInterval(window.__pagbankPoll);return}
   if(["refused","cancelled","expired"].includes(s.payment_status)){
    setFlowError("");state.activePayment.status=s.payment_status;$("#quote-countdown").textContent="Pagamento não aprovado · reserva não confirmada";
    $("#sandbox-payment-result").innerHTML='Pagamento não aprovado. Consulte novamente a disponibilidade antes de tentar outro pagamento. <button class="primary-action" type="button" id="sandbox-new-search">Consultar novamente</button>';
    $("#sandbox-new-search").onclick=async()=>{state.activePayment=null;state.quote=null;state.rate=null;state.rateCode=null;state.rateConfirmed=false;sessionStorage.removeItem('chalezinho_booking_resume');setCheckoutVisible(false);await search()};
    clearInterval(window.__pagbankPoll);
   }
  }catch{ /* The provider may still be processing; the webhook is authoritative. */ }};
 clearInterval(window.__pagbankPoll);tick();window.__pagbankPoll=setInterval(tick,5000);
}
function renderMockPayment(d){
 const exp=(state.quote?.experiences||[]).map(e=>'<div class="summary-line"><span>'+e.product+'</span><strong>'+brlC(state.rate?.contract_snapshot?.lines?.find(l=>l.key===e.product_id)?.net_cents??e.price_cents)+'</strong></div>').join("");
 const accommodation=Number(state.rate.stay_amount_cents||0);
 const breakdown=window.VilleOffers.contractMarkup(state.rate.contract_snapshot)+'<div class="booking-breakdown payment-final"><div class="summary-line"><span>Hospedagem e limpeza</span><strong>'+brlC(accommodation)+'</strong></div>'+exp+'<div class="summary-total"><span>TOTAL PARA PAGAMENTO</span><strong>'+brlC(state.rate.total_amount_cents)+'</strong></div></div>';
 const box=$("#mock-payment");
 box.innerHTML='<div class="success-state"><small>PRÉ-RESERVA DE PAGAMENTO</small><h3>'+d.confirmation_code+'</h3><p>Agora sim as datas estão protegidas temporariamente enquanto o pagamento é processado.</p></div>'+breakdown+'<div class="mock-controls"><span>SIMULAR RESULTADO:</span><button data-outcome="paid">Aprovado</button><button data-outcome="under_review">Em análise</button><button data-outcome="refused">Recusado</button><button data-outcome="expired">Expirado</button><small class="mock-help">Aprovado, Recusado e Expirado são resultados finais. Depois de escolher um deles, os outros deixam de ser válidos para esta pré-reserva.</small></div><p id="mock-result"></p>';
 const buttons=[...box.querySelectorAll("[data-outcome]")];
 const setState=outcome=>{
  if(outcome==="under_review") buttons.forEach(x=>x.disabled=x.dataset.outcome==="under_review");
  else buttons.forEach(x=>x.disabled=true);
 };
 buttons.forEach(b=>b.addEventListener("click",async()=>{
  try{
   await api("mock_payment",{payment_id:d.payment.id,outcome:b.dataset.outcome});
   const outcome=b.dataset.outcome;
   if(state.activePayment?.payment_id===d.payment.id)state.activePayment.status=outcome==="paid"?"paid":outcome==="under_review"?"under_review":outcome==="refused"?"refused":"expired";
   if(outcome==="paid"){
    track("booking_confirmed",{reservation_id:d.reservation_id,property_id:state.property?.id||null,metadata:{total_cents:Number(state.rate?.total_amount_cents||0)}});
    $("#mock-result").innerHTML='Pagamento aprovado. Reserva confirmada. <a href="conta.html">Ver em Minhas Reservas →</a>';
   }else if(outcome==="under_review"){
    $("#mock-result").textContent="Pagamento em análise. Você ainda pode simular aprovação, recusa ou expiração.";
   }else{
    track("payment_failed",{reservation_id:d.reservation_id,property_id:state.property?.id||null,metadata:{stage:"mock_outcome",reason:outcome}});
    $("#mock-result").textContent=outcome==="refused"?"Pagamento recusado. A reserva não foi confirmada.":"Pagamento expirado. A reserva não foi confirmada.";
   }
   setState(outcome);
  }catch(e){
   if(e.message==="payment_state_final"){
    buttons.forEach(x=>x.disabled=true);
    $("#mock-result").textContent="Este pagamento já foi finalizado. Para testar outro resultado final, inicie uma nova pré-reserva.";
   }else{
    $("#mock-result").textContent="Não foi possível atualizar o status do pagamento.";
   }
  }
 }));
}
function startCountdown(exp){
 const el=$("#quote-countdown");clearInterval(window.__quoteTimer);
 const tick=()=>{const s=Math.max(0,Math.floor((Date.parse(exp)-Date.now())/1000));el.textContent="Preço garantido por "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0")+" · datas ainda não bloqueadas";if(!s){el.textContent="Cotação expirada · gere uma nova para atualizar o preço";clearInterval(window.__quoteTimer)}};
 tick();window.__quoteTimer=setInterval(tick,1000);
}
function saveResume(){
 sessionStorage.setItem("chalezinho_booking_resume",JSON.stringify({entryUrl:location.pathname+location.search,reopen:true,fastCheckout:state.fastCheckout,stage:state.stage,entrySource:state.entrySource,rateConfirmed:state.rateConfirmed,guestName:$("#guest-name").value,guestPhone:$("#guest-phone").value,offerId:state.offerId,preferences:state.preferences,property:state.property,selectedByProduct:state.selectedByProduct,quote:state.quote,rateCode:state.rateCode,check_in:$("#book-in").value,check_out:$("#book-out").value,guests:$("#book-guests").value,purpose:$("#trip-purpose-initial")?.value||""}));
}
async function restoreResume(matchingEntry=false){
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem("chalezinho_booking_resume")||"null")}catch{}
 if(!saved?.property||!saved.check_in||!saved.check_out)return false;
 // A new link must not inherit the composition of a different stay in this tab.
 if(matchingEntry&&saved.entryUrl!==location.pathname+location.search)return false;
 sessionStorage.removeItem("chalezinho_booking_resume");
 const resumeQuery=new URLSearchParams(location.search);if(resumeQuery.get("resume")!=="1"&&((resumeQuery.get("mode")==="stay"&&saved.offerId)||(resumeQuery.has("stay_offer")&&resumeQuery.get("stay_offer")!==saved.offerId)))return;
 state.fastCheckout=true;state.stage=saved.stage||"review";state.entrySource=saved.entrySource||(saved.fastCheckout?"showcase":"manual");state.rateConfirmed=saved.rateConfirmed===true;state.offerId=saved.offerId||null;state.preferences=saved.preferences||{};syncStayModes();
 $("#book-in").value=saved.check_in||"";$("#book-out").value=saved.check_out||"";$("#book-guests").value=saved.guests||"2";state.property=saved.property;state.selectedByProduct=saved.selectedByProduct||{};state.quote=saved.quote;state.rateCode=saved.rateCode;
 state.rate=state.quote?.rate_options?.find(x=>x.code===state.rateCode&&x.selectable)||null;
 const {data:{session}}=await sb.auth.getSession();state.session=session;
 setCheckoutVisible(true);$("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=saved.check_in.split("-").reverse().join("/")+" a "+saved.check_out.split("-").reverse().join("/");
 if(state.fastCheckout){
  if(state.entrySource==='showcase')document.documentElement.classList.add('direct-checkout');
  $('#trip-purpose-initial').value=saved.purpose||'';
  $('#guest-name').value=saved.guestName||'';$('#guest-phone').value=saved.guestPhone||'';
  if(!state.quote||Date.parse(state.quote.expires_at)<=Date.now()){
   try{await generateQuote(true);state.rate=state.quote.rate_options.find(r=>r.code===state.rateCode&&r.selectable)||null}catch{directCheckoutError();return true}
  }
  if(!state.rate){directCheckoutError();return true}if(state.stage==="finalize"&&state.rateConfirmed)await openFinalization();else await openFastCheckout();return true;
 }

}
function renderCheckoutRates(){
 let box=$('#checkout-rate-options');
 if(!box){box=document.createElement('fieldset');box.id='checkout-rate-options';$('#summary-content').before(box)}
 const rates=state.quote.rate_options.filter(r=>r.selectable);
 box.innerHTML='<legend>Escolha a política de cancelamento</legend><p>Compare os dois preços completos. Nenhuma tarifa é escolhida automaticamente.</p>'+rates.map(r=>'<label class="checkout-rate-choice"><input type="radio" name="checkout-rate" value="'+esc(r.code)+'" '+(state.rateConfirmed&&r.code===state.rateCode?'checked':'')+'><span><strong>'+esc(r.name)+'</strong><small>Total para '+stayNights()+' noites</small></span><strong>'+brlC(r.total_amount_cents)+'</strong></label><details class="rate-policy"><summary>Condições · '+esc(r.name)+'</summary><p>'+esc(r.cancellation_policy?.body||'Condições indisponíveis.')+'</p></details>').join('');
 box.querySelectorAll('input').forEach(input=>input.onchange=()=>{
  if(state.fastUpdating)return;
  const rate=state.quote.rate_options.find(r=>r.code===input.value&&r.selectable);if(!rate)return;
  state.rate=rate;state.rateCode=rate.code;state.rateConfirmed=true;state.upsellHandled=false;
  renderReview();$('#step-next').disabled=false;setFlowError('Tarifa escolhida. Confira o total e continue para identificação.');
 });
}
function directCheckoutError(){
 $("#summary-content").innerHTML="";setCheckoutVisible(false);
 document.documentElement.classList.add('direct-checkout');
 $('#direct-checkout-status').hidden=false;
 $('#direct-checkout-status p').textContent='Esta oferta não está mais disponível nas condições escolhidas. Consulte outras opções para continuar.';
}
function renderReview(){renderSelectionSummary();renderCheckoutRates();renderExperienceStep();$('#step-next').disabled=!state.rateConfirmed;}
async function openFastCheckout(){
 state.stage='review';refreshStayOptions();
 document.documentElement.classList.toggle('direct-checkout',state.entrySource==='showcase');
 $('#direct-checkout-status').hidden=true;$('#direct-extras').before($('#summary-content'));$('#direct-extras').before($('#offer-choices'));
 $('#authenticated-finalization').hidden=true;$('#direct-extras').open=state.entrySource!=='showcase';showStep(2);renderReview();
}
async function updateFastQuote(){
 if(state.fastUpdating)return;
 state.fastUpdating=true;$('#step-next').disabled=true;
 const controls=$$('#direct-extras button, #offer-choices select, #checkout-rate-options input, #checkout-stay-mode, #trip-purpose-review');controls.forEach(b=>b.disabled=true);
 try{await refreshQuoteAfterExperiences();if(!state.rate)throw new Error('tariff_unavailable');if(state.stage==='review')renderReview();else renderSummary();setFlowError('Reserva atualizada. Confira o total e aceite os termos antes de pagar.')}
 catch(e){state.rate=null;setFlowError(window.VilleOffers.issues[e.message]||'Não foi possível confirmar esta escolha. Remova o adicional ou consulte outras opções.');}
 finally{state.fastUpdating=false;controls.forEach(b=>b.disabled=false);$('#step-next').disabled=!state.rate||!state.rateConfirmed;}
}
function redirectIdentity(mode){saveResume();location.href='auth.html?mode='+mode+'&return='+encodeURIComponent('reservar.html?resume=1'+(pagbankSandbox?'&pagbank=sandbox':''))}
async function payFastCheckout(){
 if(state.fastUpdating||!state.rate)return;
 if(!state.rateConfirmed){setFlowError('Escolha a tarifa reembolsável ou não reembolsável antes de continuar.');return}
 if(!validExperienceChoices()){setFlowError('Escolha as preferências dos itens do pacote antes de continuar.');return}
 if(!state.session){await openFinalization();return}
 if(!validateGuest())return;
 $('#step-next').disabled=true;
 try{
  const identity=await api('identity_status');
  if(!identity.complete){redirectIdentity('identify');return}
  if(!identity.payment_eligible){setFlowError(cpfPaymentMessage);return}
  if(Date.parse(state.quote.expires_at)<=Date.now()){
   const code=state.rateCode;await generateQuote(true);state.rate=state.quote.rate_options.find(r=>r.code===code&&r.selectable)||null;
   if(!state.rate){directCheckoutError();return}
   renderSummary();setFlowError('O prazo da cotação terminou. Confira o valor atualizado e aceite novamente os termos para pagar.');return;
  }
  await refreshQuoteAfterExperiences();if(!state.rate){directCheckoutError();return}
  const promotions=$('#guest-promotions').checked;
  if(promotions!==(state.session.user?.user_metadata?.marketing_opt_in===true)){const {data,error}=await sb.auth.updateUser({data:{marketing_opt_in:promotions,marketing_preference_at:new Date().toISOString()}});if(error){setFlowError('Não foi possível salvar sua preferência de ofertas. Tente novamente.');return}if(data?.user)state.session={...state.session,user:data.user}}
  state.upsellHandled=true;await maybeOfferUpsell();
 }catch(e){setFlowError(window.VilleOffers.issues[e.message]||'Não foi possível confirmar a reserva agora. Tente novamente.')}
 finally{$('#step-next').disabled=false}
}
function selectedOffer(){return (state.config?.stay_offers||[]).find(o=>o.id===state.offerId)||null}
function initStayModes(){
 let saved={};try{saved=JSON.parse(sessionStorage.getItem('ville-stay-selection')||'{}')}catch{}
 const q=new URLSearchParams(location.search),code=$('#book-chalet').value;
 const compatible=(state.config.stay_offers||[]).filter(o=>!code||o.property_ids.includes(Number((state.properties||[]).find(p=>p.code===code)?.id)));
 state.offerId=q.get("mode")==="stay"?null:q.get("stay_offer")||(Object.hasOwn(saved,"offerId")?saved.offerId:null)||null;
 if(!(state.config.stay_offers||[]).some(o=>o.id===state.offerId))state.offerId=null;
 state.preferences=saved.preferences||{};
 if(!q.has('stay_offer')&&!q.has('mode')){if(saved.check_in)$('#book-in').value=saved.check_in;if(saved.check_out)$('#book-out').value=saved.check_out;if(saved.guests)$('#book-guests').value=saved.guests}
 const options='<option value="">Somente hospedagem</option>'+(state.config.stay_offers||[]).map(o=>'<option value="'+esc(o.id)+'">Com experiência incluída · '+esc(o.name)+'</option>').join('');
 for(const id of ['#stay-mode','#checkout-stay-mode']){$(id).innerHTML=options;$(id).onchange=async e=>{
 if(state.fastUpdating)return;state.offerId=e.target.value||null;state.selectedByProduct={};state.preferences={};syncStayModes();persistSelection();
 if(!$('#checkout-modal').hidden){
  const code=state.rateCode,confirmed=state.rateConfirmed;state.fastUpdating=true;$('#step-next').disabled=true;$('#checkout-stay-mode').disabled=true;
  try{await generateQuote(false);state.rate=state.quote.rate_options.find(r=>r.code===code&&r.selectable)||state.quote.rate_options.find(r=>r.selectable)||null;state.rateCode=state.rate?.code;state.rateConfirmed=confirmed&&state.rateCode===code;if(!state.rate)throw Error('tariff_unavailable');renderReview()}
  catch(e){state.rate=null;$('#summary-content').textContent='';$('#checkout-rate-options').textContent='';setFlowError(window.VilleOffers.issues[e.message]||'Esta experiência não está disponível. Escolha outra opção.')}finally{state.fastUpdating=false;$('#checkout-stay-mode').disabled=false;$('#step-next').disabled=!state.rate||!state.rateConfirmed}
 }
 }}
 refreshStayOptions();syncStayModes();
}
function refreshStayOptions(){const code=$("#book-chalet").value,propertyId=Number((state.properties||[]).find(p=>p.code===code)?.id);const purpose=$('#trip-purpose-initial').value;const relevant=o=>o.product_ids.some(id=>(state.config.experience_products||[]).find(p=>p.id===id)?.travel_purposes?.includes(purpose));const compatible=(state.config.stay_offers||[]).filter(o=>!code||o.property_ids.map(Number).includes(propertyId)).filter(o=>!$('#book-in').value||!$('#book-out').value||(stayNights()>=Number(o.min_nights||1)&&(!o.max_nights||stayNights()<=Number(o.max_nights))&&(!o.start_date||$('#book-in').value>=o.start_date)&&(!o.end_date||$('#book-out').value<=o.end_date))).sort((a,b)=>Number(relevant(b))-Number(relevant(a)));if(state.offerId&&!compatible.some(o=>o.id===state.offerId))state.offerId=null;const options='<option value="">Somente hospedagem</option>'+compatible.map(o=>'<option value="'+esc(o.id)+'">Com experiência incluída · '+esc(o.name)+'</option>').join('');for(const id of ["#stay-mode","#checkout-stay-mode"])$(id).innerHTML=options;syncStayModes();}
function syncStayModes(){for(const id of ['#stay-mode','#checkout-stay-mode'])if($(id))$(id).value=state.offerId||'';$('#stay-selection-copy').textContent=selectedOffer()?selectedOffer().description+' O preço inclui hospedagem, limpeza e os pacotes desta oferta.':'Hospedagem e limpeza. Você pode acrescentar pacotes avulsos pelo preço cheio.';renderOfferContext()}
function persistSelection(){try{const url=new URL(location.href);url.searchParams.set('purpose',$('#trip-purpose-initial').value);if(state.offerId){url.searchParams.set('stay_offer',state.offerId);url.searchParams.delete('mode')}else{url.searchParams.set('mode','stay');url.searchParams.delete('stay_offer')}history.replaceState(null,'',url);sessionStorage.setItem('ville-stay-selection',JSON.stringify({offerId:state.offerId,preferences:state.preferences,check_in:$('#book-in').value,check_out:$('#book-out').value,guests:$('#book-guests').value,purpose:$('#trip-purpose-initial').value}))}catch{}}
function renderOfferContext(){const node=$('#checkout-offer-context');if(node)node.textContent=selectedOffer()?'Com experiência incluída · '+selectedOffer().name:'Somente hospedagem · adicionais avulsos pelo preço cheio'}
function renderOfferChoices(){
 let node=$('#offer-choices');if(!node){node=document.createElement('div');node.id='offer-choices';$('#experience-options').before(node)}
 const products=[...new Set([...(selectedOffer()?.product_ids||[]),...Object.keys(state.selectedByProduct)])].map(id=>(state.config.experience_products||[]).find(p=>p.id===id)).filter(Boolean);
 node.innerHTML=(!state.fastCheckout&&state.rate?window.VilleOffers.contractMarkup(state.rate.contract_snapshot):'')+'<div class="offer-choice-fields">'+products.flatMap(p=>window.VilleOffers.components(p).filter(c=>c.choices?.length).map((c,i)=>'<label>'+esc(c.name)+' · '+esc(p.name)+'<select data-product="'+p.id+'" data-component="'+esc(c.name)+'" required><option value="">Escolha uma opção</option>'+c.choices.map(choice=>'<option '+(state.preferences[p.id]?.[c.name]===choice?'selected':'')+'>'+esc(choice)+'</option>').join('')+'</select></label>')).join('')+'</div>';
 node.querySelectorAll('select').forEach(select=>select.onchange=()=>{state.preferences[select.dataset.product]??={};state.preferences[select.dataset.product][select.dataset.component]=select.value;persistSelection();if(state.fastCheckout)updateFastQuote()});
}
function validExperienceChoices(){const ids=[...(selectedOffer()?.product_ids||[]),...Object.keys(state.selectedByProduct)];return ids.every(id=>window.VilleOffers.components((state.config.experience_products||[]).find(p=>p.id===id)||{}).every(c=>!c.choices?.length||c.choices.includes(state.preferences[id]?.[c.name])))}
init();
})();
