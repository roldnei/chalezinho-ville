(()=>{
const C=window.CHALEZINHO_CONFIG,ENGINE=C.bookingEngine,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const state={config:null,search:null,property:null,selectedVariants:[],quote:null,rate:null,session:null};
async function api(action,body=null){
 const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development"};if(state.session?.access_token)headers.Authorization="Bearer "+state.session.access_token;
 const url=ENGINE+"?action="+encodeURIComponent(action);
 const r=await fetch(url,{method:body?"POST":"GET",headers,body:body?JSON.stringify({action,...body}):undefined});
 const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||"request_failed"),{status:r.status,data:d});return d;
}
async function init(){
 const {data:{session}}=await sb.auth.getSession();state.session=session;
 state.config=await api("config");
 const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());const min=today.toISOString().slice(0,10);$("#book-in").min=min;$("#book-out").min=min;
 $("#book-in").addEventListener("change",()=>{$("#book-out").min=$("#book-in").value||min;if($("#book-out").value&&$("#book-out").value<=$("#book-in").value)$("#book-out").value=""});
 $("#book-search").addEventListener("click",search);
 $("#checkout-close").addEventListener("click",()=>$("#checkout-modal").hidden=true);
 $("#step-back").addEventListener("click",()=>showStep(Math.max(1,Number($("#checkout-panel").dataset.step||1)-1)));
 $("#step-next").addEventListener("click",next);
 renderDevBanner();
}
function renderDevBanner(){const b=document.createElement("div");b.className="dev-banner";b.textContent="AMBIENTE DE DESENVOLVIMENTO · nenhum pagamento real será realizado";document.body.prepend(b)}
async function search(){
 const bi=$("#book-in").value,bo=$("#book-out").value,guests=Number($("#book-guests").value);if(!bi||!bo||bo<=bi)return error("Escolha datas válidas.");
 error("Consultando disponibilidade e tarifas...");
 try{
  const q=new URLSearchParams({action:"search",start:bi,end:bo,guests:String(guests)});
  const r=await fetch(ENGINE+"?"+q,{headers:{"X-Chalezinho-Env":"development"}}),d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"search_failed");
  state.search=d.listings;renderResults(d.listings);error("");
 }catch(e){error("Não foi possível consultar agora. Tente novamente.");}
}
function error(t){$("#booking-error").textContent=t}
function renderResults(list){
 const box=$("#booking-list");box.innerHTML="";$("#booking-results").classList.remove("booking-results-hidden");
 const available=list.filter(x=>x.available).length;$("#availability-count").textContent=available+" opções disponíveis";
 $("#booking-period").textContent=$("#book-in").value.split("-").reverse().join("/")+" → "+$("#book-out").value.split("-").reverse().join("/");
 list.forEach(p=>{const a=document.createElement("article");a.className="booking-property"+(p.available?"":" is-unavailable");
  const feats=(p.features||[]).map(x=>"<span>"+x+"</span>").join("");
  let status=p.available?"Disponível":p.unavailable_reason==="minimum_stay"?"Mínimo de "+p.min_stay+" noites":p.unavailable_reason==="occupied"?"Indisponível":"Tarifa indisponível";
  const preview=p.base_price!=null?brl(Number(p.base_price)*1.10+Number(p.cleaning_fee)):"—";
  a.innerHTML='<div class="booking-gallery"><img src="'+p.cover_image+'" alt="'+p.name+'" loading="lazy"></div><div><small>'+String(p.property_type).toUpperCase()+'</small><h3>'+p.name+'</h3><p>'+p.summary+'</p><div class="booking-tags">'+feats+'</div></div><div class="booking-price"><span class="availability-status '+(p.available?"available":"unavailable")+'">● '+status+'</span><small>A PARTIR DE</small><strong>'+preview+'</strong><span class="price-note">valor final depende da tarifa escolhida</span><button class="booking-select" '+(p.available?"":"disabled")+' data-id="'+p.id+'">'+(p.available?"Escolher":"Indisponível")+'</button></div>';
  box.appendChild(a);
 });
 box.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>openFlow(Number(b.dataset.id))));
 $("#booking-results").scrollIntoView({behavior:"smooth"});
}
function openFlow(id){state.property=state.search.find(x=>Number(x.id)===id);state.selectedVariants=[];state.quote=null;state.rate=null;$("#checkout-modal").hidden=false;showStep(1);renderPropertyStep()}
function showStep(n){$("#checkout-panel").dataset.step=String(n);$$(".checkout-step").forEach(x=>x.hidden=Number(x.dataset.step)!==n);$$(".progress-dot").forEach(x=>x.classList.toggle("active",Number(x.dataset.dot)<=n));$("#step-back").hidden=n===1;$("#step-next").textContent=n===5?"Iniciar pagamento de teste":"Continuar"}
function renderPropertyStep(){
 $("#checkout-title").textContent=state.property.name;$("#checkout-summary").textContent=$("#book-in").value.split("-").reverse().join("/")+" a "+$("#book-out").value.split("-").reverse().join("/");
 const box=$("#experience-options");box.innerHTML="";
 const products=(state.config.experience_products||[]).filter(p=>(p.experience_property_eligibility||[]).some(e=>Number(e.property_id)===Number(state.property.id)));
 if(!products.length){box.innerHTML='<p class="empty-state">Nenhum adicional disponível para estas datas.</p>';return}
 products.forEach(p=>{const item=document.createElement("div");item.className="experience-option";let variants=(p.experience_variants||[]).filter(v=>v.active).sort((a,b)=>a.display_order-b.display_order);
  item.innerHTML='<div><small>'+p.status.toUpperCase()+'</small><strong>'+p.name+'</strong><p>'+p.description+'</p></div><div>'+variants.map(v=>'<button type="button" class="variant-btn" data-variant="'+v.id+'" data-price="'+v.price_cents+'">'+v.name+' · '+brlC(v.price_cents)+'</button>').join("")+'</div>';box.appendChild(item);
 });
 box.querySelectorAll("[data-variant]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.variant;state.selectedVariants=[id];box.querySelectorAll("[data-variant]").forEach(x=>x.classList.toggle("selected",x===b))}));
}
async function next(){
 const step=Number($("#checkout-panel").dataset.step||1);
 if(step===1){await makeQuote();return}
 if(step===2){if(!state.rate)return setFlowError("Escolha uma tarifa.");showStep(3);await renderLoginStep();return}
 if(step===3){if(!state.session){location.href="auth.html?mode=login&return="+encodeURIComponent("reservar.html?resume=1");return}showStep(4);renderGuestStep();return}
 if(step===4){if(!validateGuest())return;showStep(5);renderSummary();return}
 if(step===5){await startPayment()}
}
async function makeQuote(){setFlowError("Gerando cotação válida por 15 minutos...");
 try{state.quote=await api("quote",{property_id:state.property.id,check_in:$("#book-in").value,check_out:$("#book-out").value,guests:Number($("#book-guests").value),experience_variant_ids:state.selectedVariants});
  renderRates();showStep(2);startCountdown(state.quote.expires_at);setFlowError("");
 }catch(e){setFlowError(e.message==="minimum_stay"?"A estadia mínima mudou. Faça uma nova busca.":"Não foi possível gerar a cotação. Faça uma nova busca.")}
}
function renderRates(){const box=$("#rate-options");box.innerHTML="";const ref=state.quote.rate_options.find(x=>x.code==="reference");
 state.quote.rate_options.filter(x=>x.selectable).forEach(r=>{const d=document.createElement("button");d.type="button";d.className="rate-card";d.dataset.option=r.quote_option_id;
  d.innerHTML='<small>'+r.name.toUpperCase()+'</small><span class="strike">'+(ref?brlC(ref.total_amount_cents):"")+'</span><strong>'+brlC(r.total_amount_cents)+'</strong><span>Hospedagem '+brlC(r.accommodation_amount_cents)+' · limpeza '+brlC(r.cleaning_fee_cents)+(r.experience_amount_cents?" · adicionais "+brlC(r.experience_amount_cents):"")+'</span><p>'+((r.cancellation_policy?.body)||"Política informada antes do pagamento.")+'</p>';
  d.addEventListener("click",()=>{state.rate=r;box.querySelectorAll(".rate-card").forEach(x=>x.classList.toggle("selected",x===d))});box.appendChild(d);
 })}
async function renderLoginStep(){const {data:{session}}=await sb.auth.getSession();state.session=session;const box=$("#login-state");
 if(session){const {data:u}=await sb.auth.getUser();box.innerHTML='<div class="success-state">✓ Você está conectado como <strong>'+u.user.email+'</strong>.</div>'}
 else box.innerHTML='<p>Para proteger sua reserva e permitir acesso posterior, entre ou crie sua conta agora.</p><a class="primary-action inline" href="auth.html?mode=login&return='+encodeURIComponent("reservar.html?resume=1")+'">Entrar ou criar conta</a>';
}
function renderGuestStep(){const meta=state.session?.user?.user_metadata||{};$("#guest-name").value=$("#guest-name").value||meta.full_name||"";$("#guest-email").value=state.session?.user?.email||"";$("#guest-phone").value=$("#guest-phone").value||meta.phone||"";
 const s=$("#travel-purpose");s.innerHTML='<option value="">Selecione</option>'+(state.config.purposes||[]).map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join("");
}
function validateGuest(){if(!$("#guest-name").value.trim()||!$("#guest-email").value.trim()||!$("#guest-phone").value.trim())return setFlowError("Preencha seus dados."),false;return true}
function renderSummary(){
 $("#summary-content").innerHTML='<div class="summary-line"><span>'+state.property.name+'</span><strong>'+brlC(state.rate.total_amount_cents)+'</strong></div><div class="summary-line"><span>'+state.rate.name+'</span><span>'+$("#book-in").value.split("-").reverse().join("/")+' → '+$("#book-out").value.split("-").reverse().join("/")+'</span></div>';
 const pol=$("#policy-box");pol.innerHTML='<label class="accept-line"><input id="accept-cancel" type="checkbox"> <span>Li e aceito a política <strong>'+state.rate.cancellation_policy.title+'</strong>: '+state.rate.cancellation_policy.body+'</span></label><p class="dev-note">Termos de hospedagem, regras da propriedade e política de privacidade ainda estão em versão de desenvolvimento e precisam de aprovação antes do GO-LIVE.</p>';
 const pay=$("#payment-options"),max=Number(state.config.payment_settings.max_card_installments||1);pay.innerHTML='<label><input type="radio" name="pay-method" value="pix" checked> PIX · expira em '+state.config.payment_settings.pix_expiration_minutes+' min</label><label><input type="radio" name="pay-method" value="card"> Cartão</label><select id="installments">'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'x</option>').join("")+'</select><p class="dev-note">Ambiente de teste: nenhum PIX ou cartão real será criado.</p>';
}
async function startPayment(){if(!$("#accept-cancel")?.checked)return setFlowError("Aceite a política de cancelamento para continuar.");
 const method=document.querySelector('input[name="pay-method"]:checked')?.value||"mock";setFlowError("Criando proteção temporária das datas...");
 try{const d=await api("start_payment",{quote_id:state.quote.quote_id,quote_option_id:state.rate.quote_option_id,guest_name:$("#guest-name").value.trim(),guest_email:$("#guest-email").value.trim(),guest_phone:$("#guest-phone").value.trim(),guests:Number($("#book-guests").value),travel_purpose_code:$("#travel-purpose").value,accepted_document_ids:[state.rate.cancellation_policy?.id].filter(Boolean),method,installments:Number($("#installments")?.value||1)});
  renderMockPayment(d);showStep(6);setFlowError("");
 }catch(e){setFlowError(e.message==="quote_expired"?"A cotação expirou. Gere uma nova cotação.":e.message==="dates_unavailable"?"Essas datas acabaram de ficar indisponíveis.":"Não foi possível iniciar o pagamento de teste.")}
}
function renderMockPayment(d){const box=$("#mock-payment");box.innerHTML='<div class="success-state"><small>PRÉ-RESERVA CRIADA</small><h3>'+d.confirmation_code+'</h3><p>As datas estão protegidas temporariamente enquanto o pagamento é processado.</p></div><div class="mock-controls"><span>SIMULAR RESULTADO:</span><button data-outcome="paid">Aprovado</button><button data-outcome="under_review">Em análise</button><button data-outcome="refused">Recusado</button><button data-outcome="expired">Expirado</button></div><p id="mock-result"></p>';
 box.querySelectorAll("[data-outcome]").forEach(b=>b.addEventListener("click",async()=>{try{await api("mock_payment",{payment_id:d.payment.id,outcome:b.dataset.outcome});$("#mock-result").innerHTML=b.dataset.outcome==="paid"?'Reserva confirmada. <a href="conta.html">Ver em Minhas Reservas →</a>':"Estado atualizado: "+b.dataset.outcome;}catch(e){$("#mock-result").textContent="Falha ao simular estado."}}));
}
function startCountdown(exp){const el=$("#quote-countdown");clearInterval(window.__quoteTimer);const tick=()=>{const s=Math.max(0,Math.floor((Date.parse(exp)-Date.now())/1000));el.textContent="Cotação válida por "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0");if(!s)clearInterval(window.__quoteTimer)};tick();window.__quoteTimer=setInterval(tick,1000)}
function setFlowError(t){$("#checkout-error").textContent=t}
init();
})();