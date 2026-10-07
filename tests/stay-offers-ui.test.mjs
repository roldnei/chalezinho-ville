import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../reservar.html',import.meta.url),'utf8'),js=await readFile(new URL('../booking.js',import.meta.url),'utf8'),offersJS=await readFile(new URL('../stay-offers.js',import.meta.url),'utf8');
const pid='d7c8da18-e089-46d1-962b-f90816135ef5',vid='10000000-0000-4000-8000-000000000002',oid='10000000-0000-4000-8000-000000000003';
const p={id:pid,name:'Chegada romântica',status:'active',package_type:'romantic',price_cents:10000,details:{components:[{name:'Bebida',quantity:1,frequency:'arrival',choices:['Vinho','Espumante']}]},experience_media:[{media_url:'assets/hero-signature.webp'}],experience_variants:[{id:vid,active:true,price_cents:10000}],experience_property_eligibility:[{property_id:1}]};
const offer={id:oid,name:'Chegada preparada',description:'Hospedagem e bebida',status:'active',min_nights:2,property_ids:[1],product_ids:[pid],discount_bps:500,discount_enabled:true};
const breakfast={...p,id:'breakfast',name:'Café da manhã',package_type:'breakfast',price_cents:5000,details:{components:[]},experience_variants:[{id:'breakfast-variant',active:true,price_cents:5000}]};
const property={id:1,code:'CH1',name:'Ville Signature',available:true,cover_image:'assets/hero-signature.webp',features:{},property_type:'chalet'};
async function setup(saved,url=null){
 const dom=new JSDOM(html,{url:url||'https://qa.example/reservar.html?chalet=CH1'+(saved?'&resume=1':''),runScripts:'outside-only'}),w=dom.window,calls=[],scrolls=[];
 w.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,...options})};w.scrollTo=options=>scrolls.push({...options});w.VilleImages={set(){}};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.example',supabaseKey:'fixture',bookingEngine:'https://qa.example/engine',environment:'development'};
 let signedIn=!!saved;w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:signedIn?{user:{email:"qa@example.test",user_metadata:{}}}:null}}),signInWithPassword:async()=>{signedIn=true;return {data:{session:{user:{email:"qa@example.test",user_metadata:{}}}},error:null}},getUser:async()=>({data:{user:{email:"qa@example.test",user_metadata:{}}}})}})};
 const quote=(body={})=>{const included=body.stay_offer_id===oid,c={offer_id:included?oid:null,offer_name:included?offer.name:null,gross_cents:included?130000:120000,discount_cents:included?6500:0,total_cents:included?123500:120000,lines:[],experiences:included?[{name:p.name,product_id:pid,included:true,components:[{...p.details.components[0],choice:body.experience_preferences?.[pid]?.Bebida||null}]}]:[]};return {ok:true,quote_id:'quote',expires_at:new Date(Date.now()+600000).toISOString(),rate_options:[{cancellation_policy:{title:'Não reembolsável',version:'1',body:'Sem reembolso'},code:'non_refundable',name:'Não reembolsável',selectable:true,quote_option_id:'option',stay_amount_cents:included?114000:120000,total_amount_cents:c.total_cents+(body.experience_variant_ids?.includes("breakfast-variant")?5000:0),experience_amount_cents:included?9500:0,contract_snapshot:c}].flatMap(r=>[r,{...r,code:'refundable',name:'Reembolsável',quote_option_id:'ref-option',total_amount_cents:r.total_amount_cents+15000,cancellation_policy:{id:'ref-policy',title:'Reembolsável',version:'2',body:'Reembolso conforme prazo'}}]),experiences:included?[{product_id:pid,product:p.name,price_cents:10000}]:[]}};
 w.fetch=async(url,options={})=>{const action=new URL(url).searchParams.get('action'),body=options.body?JSON.parse(options.body):{},q=new URL(url).searchParams;calls.push({action,body,params:Object.fromEntries(q)});
 let data=action==='config'?{ok:true,experience_products:[p,breakfast],stay_offers:[offer],purposes:[{code:"romantic",label:"Romântico"}],payment_settings:{pix_expiration_minutes:15,active_provider:"pagbank_sandbox",pix_enabled:true,card_enabled:false}}:action==='property_media'?{ok:true,properties:[property]}:action==='search'?{ok:true,listings:[{...property,from_stay_price:q.has('stay_offer_id')?1235:1200,offer_issues:[],quote:quote({stay_offer_id:q.get('stay_offer_id')})}]}:action==='quote'?quote(body):action==='identity_status'?{ok:true,complete:true,payment_eligible:true}:{ok:true};return {ok:true,json:async()=>data};};
 if(saved)w.sessionStorage.setItem('chalezinho_booking_resume',saved);
 w.eval(offersJS);w.eval(js);await wait(()=>w.document.querySelector('#stay-mode').options.length===2);return {dom,w,calls,quote,scrolls};
}
async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI condition not reached')}
const directURL='https://qa.example/reservar.html?chalet=CH1&stay_offer='+oid+'&check_in=2030-01-01&check_out=2030-01-03&guests=2&rate=non_refundable&from=showcase';
function choose(w,code='non_refundable'){const radio=w.document.querySelector('#checkout-rate-options input[value='+code+']');radio.checked=true;radio.dispatchEvent(new w.Event('change'))}
async function login(w){w.document.querySelector('#checkout-login-email').value='qa@example.test';w.document.querySelector('#checkout-login-password').value='fixture-password';w.document.querySelector('#checkout-login').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait(()=>!w.document.querySelector('#authenticated-finalization').hidden)}
test('experience entry includes the selected extra in the first tariff comparison',async()=>{
 const {dom,w,calls}=await setup(null,'https://qa.example/reservar.html?chalet=CH1&experience=breakfast');
 try{const $=s=>w.document.querySelector(s);
  $('#book-in').value='2030-01-01';$('#book-out').value='2030-01-03';$('#book-search').click();await wait(()=>$('.booking-select'));
  $('.booking-select').click();await wait(()=>$('#checkout-rate-options input'));
  assert.deepEqual(calls.find(c=>c.action==='quote').body.experience_variant_ids,['breakfast-variant']);
  assert.ok($('[data-remove="breakfast"]'));assert.equal($('#checkout-rate-options input:checked'),null);
  choose(w,'refundable');assert.match($('#summary-content').textContent,/1.400,00/);
  $('[data-remove="breakfast"]').click();await wait(()=>$('#summary-content').textContent.includes('1.350,00'));
 }finally{dom.window.close()}
});

test('manual journey asks purpose with dates and combines package, tariff and extras before common login',async()=>{
 const {dom,w,calls}=await setup();try{const $=s=>w.document.querySelector(s);
 assert.equal($('#stay-mode').value,'');assert.ok($('#trip-purpose-initial').closest('.booking-search'));
 $('#trip-purpose-initial').value='romantic';$('#book-in').value='2030-01-01';$('#book-out').value='2030-01-03';$('#book-search').click();await wait(()=>$('.booking-select'));assert.equal(w.document.body.classList.contains('booking-results-screen'),true);
 $('.booking-select').click();await wait(()=>$('#checkout-rate-options input'));assert.equal($('#checkout-panel').dataset.step,'2');assert.equal($('#payment-options').innerHTML,'');assert.equal($('#trip-purpose-initial').value,'romantic');assert.equal($('#trip-purpose-review').value,'romantic');assert.equal($('#direct-extras').open,true);const quoteCalls=calls.filter(c=>c.action==='quote').length;$('#trip-purpose-review').value='';$('#trip-purpose-review').dispatchEvent(new w.Event('change'));assert.equal($('#trip-purpose-initial').value,'');assert.equal(calls.filter(c=>c.action==='quote').length,quoteCalls);$('#trip-purpose-review').value='romantic';$('#trip-purpose-review').dispatchEvent(new w.Event('change'));
 $('#checkout-stay-mode').value=oid;$('#checkout-stay-mode').dispatchEvent(new w.Event('change'));await wait(()=>calls.filter(c=>c.action==='quote').at(-1).body.stay_offer_id===oid);await wait(()=>$('[data-component="Bebida"]'));
 choose(w);$('#step-next').click();assert.match($('#checkout-error').textContent,/preferências/);
 const choice=$('[data-component="Bebida"]');choice.value='Vinho';choice.dispatchEvent(new w.Event('change'));await wait(()=>!$('#step-next').disabled);$('#step-next').click();await wait(()=>$('#checkout-login'));
 assert.equal($('#checkout-panel').dataset.step,'5');assert.equal($('#authenticated-finalization').hidden,true);assert.equal($('#payment-options').innerHTML,'');assert.equal($('#policy-box').innerHTML,'');
 await login(w);assert.match($('#summary-content').textContent,/Chegada preparada/);assert.ok($('#accept-all'));assert.equal($('#guest-promotions').checked,false);assert.equal($('#authenticated-finalization').hidden,false);
 $('#step-back').click();await wait(()=>$('#checkout-panel').dataset.step==='2');assert.equal($('#checkout-rate-options input:checked').value,'non_refundable');assert.equal($('[data-component="Bebida"]').value,'Vinho');
 $('#checkout-stay-mode').value='';$('#checkout-stay-mode').dispatchEvent(new w.Event('change'));await wait(()=>$('#summary-content').textContent.includes('1.200'));assert.equal(new URL(w.location.href).searchParams.get('mode'),'stay');
 }finally{dom.window.close()}
});
test('storefront uses review then the same mandatory login without exposing payment or terms',async()=>{
 const {dom,w,calls,scrolls}=await setup(null,directURL);try{const $=s=>w.document.querySelector(s);await wait(()=>$('#checkout-rate-options input'));
 assert.equal($('#checkout-panel').dataset.step,'2');assert.deepEqual(scrolls,[]);assert.equal($('#checkout-rate-options input:checked'),null);assert.equal($('#step-next').disabled,true);assert.equal($('#payment-options').innerHTML,'');
 choose(w,'refundable');assert.match($('#summary-content').textContent,/1.385,00/);const choice=$('[data-component="Bebida"]');choice.value='Espumante';choice.dispatchEvent(new w.Event('change'));await wait(()=>!$('#step-next').disabled);
 $('#experience-options [data-package="breakfast"]').click();await wait(()=>!$('#step-next').disabled);assert.match($('#summary-content').textContent,/1.435,00/);assert.equal($('#experience-options [data-package="'+pid+'"]'),null);
 $('#step-next').click();await wait(()=>$('#checkout-login'));assert.equal($('#authenticated-finalization').hidden,true);assert.equal($('#payment-options').innerHTML,'');w.dispatchEvent(new w.Event('beforeunload'));const saved=w.sessionStorage.getItem('chalezinho_booking_resume');assert.equal(JSON.parse(saved).stage,'finalize');assert.equal(JSON.parse(saved).rateCode,'refundable');
 const b=await setup(saved);try{const q=s=>b.w.document.querySelector(s);await wait(()=>!q('#authenticated-finalization').hidden);assert.equal(q('#checkout-panel').dataset.step,'5');assert.equal(b.calls.filter(c=>c.action==='quote').length,0);assert.match(q('#summary-content').textContent,/1.435,00/);assert.equal(q('#accept-all').checked,false);assert.equal(q('#login-state').textContent.includes('qa@example.test'),true);q('#step-back').click();assert.equal(q('[data-component="Bebida"]').value,'Espumante');assert.equal(q('#checkout-rate-options input:checked').value,'refundable')}finally{b.dom.window.close()}
 }finally{dom.window.close()}
});
test('authenticated guest goes from selection to data, terms and payment without repeating login',async()=>{
 const a=await setup(null,directURL);let saved;try{await wait(()=>a.w.document.querySelector('#checkout-rate-options input'));choose(a.w);const c=a.w.document.querySelector('[data-component="Bebida"]');c.value='Vinho';c.dispatchEvent(new a.w.Event('change'));await wait(()=>!a.w.document.querySelector('#step-next').disabled);a.w.dispatchEvent(new a.w.Event('beforeunload'));saved=a.w.sessionStorage.getItem('chalezinho_booking_resume')}finally{a.dom.window.close()}
 const b=await setup(saved);try{await wait(()=>b.w.document.querySelector('#checkout-rate-options input'));b.w.document.querySelector('#step-next').click();await wait(()=>!b.w.document.querySelector('#authenticated-finalization').hidden);assert.equal(b.w.document.querySelector('#checkout-login'),null);assert.ok(b.w.document.querySelector('#accept-all'));assert.equal(b.w.document.querySelector('#accept-all').checked,false)}finally{b.dom.window.close()}
});
test('direct checkout never substitutes an unavailable advertised tariff',async()=>{
 const {dom,w}=await setup(null,directURL.replace('rate=non_refundable','rate=unavailable'));try{await wait(()=>w.document.querySelector('#direct-checkout-status p').textContent.includes('não está mais disponível'));assert.equal(w.document.querySelector('#checkout-modal').hidden,true);assert.equal(w.document.querySelector('#summary-content').textContent,'')}finally{dom.window.close()}
});

test('reload of the same offer preserves extras, explicit tariff and preferences; another offer link does not',async()=>{
 const a=await setup(null,directURL);let saved,url;
 try{const $=s=>a.w.document.querySelector(s);await wait(()=>$('#checkout-rate-options input'));choose(a.w,'refundable');
  const choice=$('[data-component="Bebida"]');choice.value='Espumante';choice.dispatchEvent(new a.w.Event('change'));await wait(()=>!$('#step-next').disabled);
  $('#experience-options [data-package="breakfast"]').click();await wait(()=>!$('#step-next').disabled);
  a.w.dispatchEvent(new a.w.Event('beforeunload'));saved=a.w.sessionStorage.getItem('chalezinho_booking_resume');url=a.w.location.href;
 }finally{a.dom.window.close()}
 const b=await setup(saved,url);
 try{const $=s=>b.w.document.querySelector(s);await wait(()=>$('#checkout-rate-options input'));
  assert.equal($('#checkout-rate-options input:checked').value,'refundable');assert.equal($('[data-component="Bebida"]').value,'Espumante');
  assert.ok($('#experience-options [data-remove="breakfast"]'));assert.match($('#summary-content').textContent,/1.435,00/);
  assert.equal(b.calls.filter(c=>c.action==='quote').length,0);
 }finally{b.dom.window.close()}
 const c=await setup(saved,url.replace('check_in=2030-01-01','check_in=2030-02-01').replace('check_out=2030-01-03','check_out=2030-02-03'));
 try{const $=s=>c.w.document.querySelector(s);await wait(()=>$('#checkout-rate-options input'));
  assert.equal($('#checkout-rate-options input:checked'),null);assert.equal($('#experience-options [data-remove="breakfast"]'),null);
  assert.equal($('#book-in').value,'2030-02-01');assert.match($('#summary-content').textContent,/1.235,00/);
 }finally{c.dom.window.close()}
});

test('dates submitted on home skip repeated date screen and preserve purpose until an explicit choice',async()=>{const {dom,w,calls}=await setup(null,'https://qa.example/reservar.html?check_in=2030-01-01&check_out=2030-01-03&guests=1&purpose=romantic&from=dates&mode=stay');try{const $=s=>w.document.querySelector(s);await wait(()=>$('.booking-select'));assert.equal(w.document.body.classList.contains('booking-results-screen'),true);assert.equal($('#trip-purpose-initial').value,'romantic');assert.equal($('#book-guests').value,'1');assert.equal($('#checkout-modal').hidden,true);$('#change-dates').click();const searches=calls.filter(c=>c.action==='search').length;$('#trip-purpose-initial').value='';$('#trip-purpose-initial').dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,20));assert.equal(w.document.body.classList.contains('booking-results-screen'),false);assert.equal(calls.filter(c=>c.action==='search').length,searches);assert.equal($('#checkout-modal').hidden,true)}finally{dom.window.close()}});

test('one-night search does not offer a two-night package and purpose changes survive reload URL',async()=>{const {dom,w}=await setup(null,'https://qa.example/reservar.html?check_in=2030-01-01&check_out=2030-01-02&purpose=romantic&from=dates&mode=stay');try{const $=s=>w.document.querySelector(s);await wait(()=>$('.booking-select'));$('.booking-select').click();await wait(()=>$('#checkout-rate-options input'));assert.equal($('#checkout-stay-mode').options.length,1);$('#trip-purpose-review').value='';$('#trip-purpose-review').dispatchEvent(new w.Event('change'));assert.equal(new URL(w.location.href).searchParams.get('purpose'),'');assert.equal($('#checkout-panel').dataset.step,'2');assert.equal($('#checkout-modal').hidden,false)}finally{dom.window.close()}});
