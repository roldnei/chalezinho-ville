import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
async function fixture(lodging=false,discount=0){
 const w=new JSDOM(readFileSync('reservar.html','utf8'),{url:'https://qa.example/reservar.html?mode=stay',runScripts:'outside-only'}).window,calls=[];let failure=false,changed=false;
 const property={id:1,code:'CH1',name:'Ville Signature',available:true,features:{},cover_image:'assets/signature.webp',gallery:[],max_guests:2,from_stay_price:1250};
 function quote(input={}){const total=changed?135000:125000;return {ok:true,...(lodging?{consultation_pricing:{profile:'lodging-airbnb-base-v1',markup_bps:0,cleaning_cents:29000}}:{}),quote_id:null,consulted_at:new Date().toISOString(),expires_at:new Date(Date.now()+900000).toISOString(),property,experiences:[],rate_options:(lodging?['non_refundable']:['refundable','non_refundable']).map(code=>({code,name:lodging?'Escapada':code==='refundable'?'Reembolsável':'Não reembolsável',selectable:true,total_amount_cents:total,accommodation_amount_cents:110000,cleaning_fee_cents:15000,stay_amount_cents:total,cancellation_policy:{body:'Política da tarifa de teste'},contract_snapshot:{property_name:property.name,check_in:input.check_in||'2026-12-01',check_out:input.check_out||'2026-12-03',guests:input.guests||2,lines:[{key:'accommodation',gross_cents:110000},{key:'cleaning',gross_cents:15000}],discount_cents:discount}}))};}
 property.quote=quote();
 w.CHALEZINHO_CONFIG={releaseProfile:'whatsapp',bookingEngine:'https://qa.example/public-consultation',supabaseUrl:'https://qa.example',supabaseKey:'fixture',whatsappNumber:'5593991592266',environment:'development'};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};w.VilleImages={set:(image,url)=>image.src=url};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{},action=new URL(url).searchParams.get('action')||body.action;calls.push(action);if(failure&&['quote','search'].includes(action))return {ok:false,status:503,json:async()=>({ok:false,error:'unavailable'})};const data=action==='config'?{ok:true,purposes:[],experience_products:[],stay_offers:[]}:action==='property_media'?{ok:true,properties:[property]}:action==='search'?{ok:true,listings:[{...property,quote:quote()}]}:quote(body);return {ok:true,status:200,json:async()=>data};};
 w.eval(readFileSync('stay-offers.js','utf8'));w.eval(readFileSync('consultation-summary.js','utf8'));
 let source=readFileSync('booking.js','utf8');const i=source.lastIndexOf('init();');source=source.slice(0,i)+"window.VilleTest={init,search,openFlow,continueWhatsApp,state,saveConsultation,restoreConsultation,copyWhatsAppSummary,renderExperienceList,renderOfferChoices,refreshStayOptions,syncStayModes};"+source.slice(i+7);w.eval(source);await w.VilleTest.init();
 w.document.querySelector('#book-in').value='2026-12-01';w.document.querySelector('#book-out').value='2026-12-03';await w.VilleTest.search();await w.VilleTest.openFlow(1);
 return {w,calls,fail:()=>failure=true,change:()=>changed=true,choose:()=>{const radio=w.document.querySelector('input[name=checkout-rate]');radio.checked=true;radio.dispatchEvent(new w.Event('change'));}};
}
test('visitor explicitly chooses a rate; message equals displayed summary; no login/payment calls',async()=>{const f=await fixture();try{const {w}=f;assert.equal(w.document.querySelector('input[name=checkout-rate]').checked,false);assert.equal(w.document.querySelector('#step-next').disabled,true);f.choose();await w.VilleTest.continueWhatsApp();const link=new URL(w.document.querySelector('#whatsapp-open').href),summary=w.document.querySelector('.consultation-summary').textContent;assert.equal(link.pathname,'/5593991592266');assert.equal(link.searchParams.get('text'),'Olá! Gostaria de finalizar esta hospedagem pelo atendimento.\n\n'+summary);assert.ok(f.calls.every(a=>['config','property_media','search','quote'].includes(a)));assert.equal(w.document.querySelector('#authenticated-finalization').hidden,true);await w.VilleTest.continueWhatsApp();assert.equal(w.VilleTest.state.quote.quote_id,null);}finally{f.w.close()}});
test('changed quote requires review and removes WhatsApp link; failed quote discards previous price',async()=>{for(const scenario of ['change','fail']){const f=await fixture();try{f.choose();await f.w.VilleTest.continueWhatsApp();f[scenario]();await f.w.VilleTest.continueWhatsApp();assert.equal(f.w.document.querySelector('#whatsapp-actions').hidden,true);assert.equal(f.w.document.querySelector('#whatsapp-open').hasAttribute('href'),false);assert.equal(f.w.document.querySelector('#step-next').disabled,true);if(scenario==='fail'){assert.equal(f.w.VilleTest.state.quote,null);assert.equal(f.w.document.querySelector('.consultation-summary'),null);}else assert.equal(f.w.VilleTest.state.rateConfirmed,false);}finally{f.w.close()}}});
test('reload stores only choices and refreshes the quote before restoring summary',async()=>{const f=await fixture();try{f.choose();f.w.VilleTest.saveConsultation();const saved=JSON.parse(f.w.sessionStorage.getItem('ville-consultation-selection'));assert.equal(saved.quote,undefined);assert.equal(saved.rateCode,'refundable');const oldCalls=f.calls.length;await f.w.VilleTest.restoreConsultation(false);assert.ok(f.calls.slice(oldCalls).includes('quote'));assert.equal(f.w.document.querySelector('#whatsapp-actions').hidden,true);}finally{f.w.close()}});

test('clipboard failure provides the exact prepared message for manual copying',async()=>{const f=await fixture();try{f.choose();await f.w.VilleTest.continueWhatsApp();await f.w.VilleTest.copyWhatsAppSummary();const text=f.w.document.querySelector('#whatsapp-manual-copy');assert.ok(text);assert.equal(text.readOnly,true);assert.equal(text.value,new URL(f.w.document.querySelector('#whatsapp-open').href).searchParams.get('text'));assert.doesNotMatch(text.value,/Invalid Date/);assert.match(f.w.document.querySelector('#whatsapp-status').textContent,/Selecione e copie/);}finally{f.w.close()}});

test('pending clipboard permission immediately exposes manual copy and cannot leave stale status after a new quote',async()=>{
 const f=await fixture();try{f.choose();await f.w.VilleTest.continueWhatsApp();Object.defineProperty(f.w.navigator,'clipboard',{value:{writeText:()=>new Promise(()=>{}),readText:()=>new Promise(()=>{})}});const copying=f.w.VilleTest.copyWhatsAppSummary();assert.ok(f.w.document.querySelector('#whatsapp-manual-copy'));await f.w.VilleTest.continueWhatsApp();assert.equal(f.w.document.querySelector('#whatsapp-manual-copy'),null);await copying;assert.match(f.w.document.querySelector('#whatsapp-status').textContent,/Resumo atualizado/);}finally{f.w.close()}
});

test('commercial experience requires an explicit condition and clears a prior quote when deselected',async()=>{
 const f=await fixture();try{const {w}=f;const p={id:'romance',name:'Noite Romântica',status:'active',package_type:'romantic',price_cents:49900,description:'Clima e conexão',details:{commercial_pricing:{cash_cents:49900,card_cents:54900,max_installments:4}},experience_variants:[{id:'romance-variant',active:true,price_cents:49900}],experience_media:[{media_url:'assets/experiencia-romance.webp'}],experience_property_eligibility:[{property_id:1}]};
 w.VilleTest.state.config.experience_products=[p];w.VilleTest.renderExperienceList('romantic');
 const select=w.document.querySelector('[data-commercial]');assert.equal(select.value,'');assert.equal(w.document.querySelector('[data-package]').disabled,true);
 select.value='card';select.dispatchEvent(new w.Event('change'));assert.match(w.document.querySelector('[data-package]').textContent,/549/);assert.equal(w.document.querySelector('[data-package]').disabled,false);
 w.document.querySelector('[data-package]').click();await new Promise(r=>setTimeout(r,10));assert.equal(w.VilleTest.state.preferences.romance._commercial_condition,'card');
 f.choose();await w.VilleTest.continueWhatsApp();assert.equal(w.document.querySelector('#whatsapp-actions').hidden,false);
 const chosen=w.document.querySelector('[data-commercial]');chosen.value='';chosen.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelector('#whatsapp-actions').hidden,true);assert.equal(w.VilleTest.state.selectedByProduct.romance,undefined);await new Promise(r=>setTimeout(r,10));
 }finally{f.w.close()}
});

test('lodging-only escape keeps offer context without promising an included experience',async()=>{
 const f=await fixture();try{const {w}=f,state=w.VilleTest.state;
 state.config.stay_offers=[{id:'stay-only',name:'Escapada sem experiência',description:'Hospedagem e limpeza',property_ids:[1],product_ids:[],min_nights:2,discount_enabled:false}];state.offerId='stay-only';
 w.VilleTest.refreshStayOptions();
 assert.equal(w.document.querySelector('#checkout-stay-mode').textContent,'Escapada');
 assert.doesNotMatch(w.document.querySelector('#checkout-offer-context').textContent,/Com experiência/);
 assert.doesNotMatch(w.document.querySelector('#stay-selection-copy').textContent,/pacotes desta oferta/);
 f.choose();await w.VilleTest.continueWhatsApp();
 assert.ok(f.calls.every(a=>['config','property_media','search','quote'].includes(a)));
 }finally{f.w.close()}
});


test('first launch shows one Escapada and only the total; no tariff or experience selection',async()=>{
 const f=await fixture(true);try{const {w}=f;
 assert.equal(w.document.querySelector('#checkout-rate-options').hidden,true);
 assert.equal(w.document.querySelector('#direct-extras').hidden,true);
 assert.equal(w.document.querySelector('#checkout-stay-mode').textContent,'Escapada');
 assert.equal(w.document.querySelector('#step-next').disabled,false);
 await w.VilleTest.continueWhatsApp();
 const summary=w.document.querySelector('.consultation-summary').textContent,message=new URL(w.document.querySelector('#whatsapp-open').href).searchParams.get('text');
 assert.equal(message,'Olá! Gostaria de finalizar esta hospedagem pelo atendimento.\n\n'+summary);
 assert.match(summary,/Seleção: Escapada\nTotal consultado:/);
 assert.doesNotMatch(summary,/Limpeza:|Hospedagem:|Desconto:|Tarifa:|Experiência:|Condições:/);
 assert.ok(f.calls.every(a=>['config','property_media','search','quote'].includes(a)));
 }finally{f.w.close()}
});
test('first-launch price change requires a second explicit review and failure clears the total',async()=>{
 for(const scenario of ['change','fail']){const f=await fixture(true);try{
 await f.w.VilleTest.continueWhatsApp();f[scenario]();await f.w.VilleTest.continueWhatsApp();
 assert.equal(f.w.document.querySelector('#whatsapp-open').hasAttribute('href'),false);
 if(scenario==='change'){assert.match(f.w.document.querySelector('#step-next').textContent,/Conferi o novo total/);await f.w.VilleTest.continueWhatsApp();assert.equal(f.w.document.querySelector('#whatsapp-actions').hidden,false)}
 else{assert.equal(f.w.VilleTest.state.rate,null);assert.equal(f.w.document.querySelector('.consultation-summary'),null)}
 }finally{f.w.close()}}
});

test('discounted listing shows the original total above the payable total without an extra discount card',async()=>{
 const f=await fixture(false,6340);try{const card=f.w.document.querySelector('.booking-property'),before=card.querySelector('.price-before');assert.ok(before);assert.match(before.textContent,/1[.]313,40/);assert.match(card.querySelector('.booking-price').textContent,/1[.]250,00/);assert.equal(card.querySelector('.contract-inclusions'),null);assert.doesNotMatch(card.textContent,/Desconto da estadia completa/)}finally{f.w.close()}
});
