import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../reservar.html',import.meta.url),'utf8'),js=await readFile(new URL('../booking.js',import.meta.url),'utf8'),offersJS=await readFile(new URL('../stay-offers.js',import.meta.url),'utf8');
const pid='d7c8da18-e089-46d1-962b-f90816135ef5',vid='10000000-0000-4000-8000-000000000002',oid='10000000-0000-4000-8000-000000000003';
const p={id:pid,name:'Chegada romântica',status:'active',package_type:'romantic',price_cents:10000,details:{components:[{name:'Bebida',quantity:1,frequency:'arrival',choices:['Vinho','Espumante']}]},experience_media:[{media_url:'assets/hero-signature.webp'}],experience_variants:[{id:vid,active:true,price_cents:10000}],experience_property_eligibility:[{property_id:1}]};
const offer={id:oid,name:'Chegada preparada',description:'Hospedagem e bebida',status:'active',property_ids:[1],product_ids:[pid],discount_bps:500,discount_enabled:true};
const property={id:1,code:'CH1',name:'Ville Signature',available:true,cover_image:'assets/hero-signature.webp',features:{},property_type:'chalet'};
async function setup(saved,url=null){
 const dom=new JSDOM(html,{url:url||'https://qa.example/reservar.html?chalet=CH1'+(saved?'&resume=1':''),runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.VilleImages={set(){}};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.example',supabaseKey:'fixture',bookingEngine:'https://qa.example/engine',environment:'development'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:saved?{user:{email:"qa@example.test",user_metadata:{}}}:null}})}})};
 const quote=(body={})=>{const included=body.stay_offer_id===oid,c={offer_id:included?oid:null,offer_name:included?offer.name:null,gross_cents:included?130000:120000,discount_cents:included?6500:0,total_cents:included?123500:120000,lines:[],experiences:included?[{name:p.name,product_id:pid,included:true,components:[{...p.details.components[0],choice:body.experience_preferences?.[pid]?.Bebida||null}]}]:[]};return {ok:true,quote_id:'quote',expires_at:new Date(Date.now()+600000).toISOString(),rate_options:[{code:'non_refundable',name:'Não reembolsável',selectable:true,quote_option_id:'option',stay_amount_cents:included?114000:120000,total_amount_cents:c.total_cents,experience_amount_cents:included?9500:0,contract_snapshot:c}],experiences:included?[{product_id:pid,product:p.name,price_cents:10000}]:[]}};
 w.fetch=async(url,options={})=>{const action=new URL(url).searchParams.get('action'),body=options.body?JSON.parse(options.body):{},q=new URL(url).searchParams;calls.push({action,body,params:Object.fromEntries(q)});
 let data=action==='config'?{ok:true,experience_products:[p],stay_offers:[offer],purposes:[]}:action==='property_media'?{ok:true,properties:[property]}:action==='search'?{ok:true,listings:[{...property,from_stay_price:q.has('stay_offer_id')?1235:1200,offer_issues:[],quote:quote({stay_offer_id:q.get('stay_offer_id')})}]}:action==='quote'?quote(body):{ok:true};return {ok:true,json:async()=>data};};
 if(saved)w.sessionStorage.setItem('chalezinho_booking_resume',saved);
 w.eval(offersJS);w.eval(js);await wait(()=>w.document.querySelector('#stay-mode').options.length===2);return {dom,w,calls,quote};
}
async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI condition not reached')}
test('direct property journey keeps complete offer visible; switching requotes lodging without inclusions',async()=>{
 const {dom,w,calls}=await setup();try{
 const $=s=>w.document.querySelector(s);assert.equal($('#stay-mode').value,oid);$('#book-in').value='2030-01-01';$('#book-out').value='2030-01-03';$('#book-search').click();await wait(()=>$('.booking-select'));
 assert.ok(calls.find(x=>x.action==='search').params.stay_offer_id===oid);assert.match($('#booking-list').textContent,/Chegada preparada/);$('.booking-select').click();await wait(()=>$('.rate-card'));$('.rate-card').click();$('#step-next').click();
 assert.match($('#offer-choices').textContent,/Bebida/);assert.equal($('#experience-options').querySelectorAll('[data-package]').length,0,'included package is not an additional');$('#step-next').click();assert.match($('#checkout-error').textContent,/preferências/);
 const choice=$('[data-component="Bebida"]');choice.value='Vinho';choice.dispatchEvent(new w.Event('change'));$('#step-next').click();await wait(()=>$('#checkout-panel').dataset.step==='3');
 const q=calls.filter(x=>x.action==='quote').at(-1);assert.equal(q.body.experience_preferences[pid].Bebida,'Vinho');assert.equal(q.body.stay_offer_id,oid);
 $('#checkout-stay-mode').value='';$('#checkout-stay-mode').dispatchEvent(new w.Event('change'));assert.equal($('.rate-card'),null,'old discounted prices are removed while recalculating');assert.equal($('#checkout-stay-mode').disabled,true,'repeated changes are blocked until the new quote arrives');await wait(()=>calls.filter(x=>x.action==='quote').at(-1).body.stay_offer_id===undefined);await wait(()=>$('#checkout-panel').dataset.step==='1');await wait(()=>$('.rate-card strong')?.textContent.includes('1.200'));assert.match($('#checkout-offer-context').textContent,/Somente hospedagem/);
 assert.equal(calls.filter(x=>x.action==='quote').at(-1).body.experience_variant_ids.length,0);assert.equal(new URL(w.location.href).searchParams.get('mode'),'stay','reload retains lodging choice in the URL');assert.equal(new URL(w.location.href).searchParams.has('stay_offer'),false);
 }finally{dom.window.close()}
});
test('login resume and reload preserve complete offer and chosen preference',async()=>{
 const a=await setup();let saved;try{
 const $=s=>a.w.document.querySelector(s);$('#book-in').value='2030-01-01';$('#book-out').value='2030-01-03';$('#book-search').click();await wait(()=>$('.booking-select'));$('.booking-select').click();await wait(()=>$('.rate-card'));$('.rate-card').click();$('#step-next').click();const choice=$('[data-component="Bebida"]');choice.value='Espumante';choice.dispatchEvent(new a.w.Event('change'));$('#step-next').click();await wait(()=>$('#checkout-panel').dataset.step==='3');a.w.dispatchEvent(new a.w.Event('beforeunload'));saved=a.w.sessionStorage.getItem('chalezinho_booking_resume');assert.equal(JSON.parse(saved).offerId,oid);
 }finally{a.dom.window.close()}
 const b=await setup(saved);try{await wait(()=>b.w.document.querySelector('#checkout-panel').dataset.step==='4');assert.equal(b.w.document.querySelector('#checkout-stay-mode').value,oid);assert.match(b.w.document.querySelector('#checkout-offer-context').textContent,/Chegada preparada/);assert.equal(JSON.parse(saved).preferences[pid].Bebida,'Espumante');assert.equal(b.calls.filter(x=>x.action==='quote').length,0,'retains valid quote, does not change price on login return')}finally{b.dom.window.close()}
});

test('dated storefront selection rechecks prices, opens chosen property and selects advertised tariff',async()=>{
 const {dom,w,calls}=await setup(null,'https://qa.example/reservar.html?chalet=CH1&stay_offer='+oid+'&check_in=2030-01-01&check_out=2030-01-03&guests=2&rate=non_refundable&from=showcase');
 try{await wait(()=>w.document.querySelector('.rate-card')?.classList.contains('selected'));assert.match(w.document.querySelector('.rate-card.selected .strike').textContent,/1.300,00/);assert.equal(w.document.querySelector('#book-in').value,'2030-01-01');assert.equal(w.document.querySelector('#checkout-stay-mode').value,oid);assert.equal(w.document.querySelector('#checkout-modal').hidden,false);assert.equal(calls.filter(c=>c.action==='quote').at(-1).body.stay_offer_id,oid);assert.equal(calls.find(c=>c.action==='search').params.start,'2030-01-01')}finally{dom.window.close()}
});
