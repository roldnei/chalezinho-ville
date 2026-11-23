import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const code=await readFile(new URL('../black-friday.js',import.meta.url),'utf8');
const scope={};vm.runInNewContext(code,scope);const campaign=scope.VilleBlackFriday;

test('the countdown ends at midnight after 27 November in Brasilia, without restarting on reload',()=>{
 const end=Date.parse('2026-11-28T03:00:00Z');
 assert.equal(Date.parse(campaign.terms.endsAt),end);
 assert.equal(campaign.active(end-1),true);assert.equal(campaign.active(end),false);
 assert.deepEqual({...campaign.remaining(end-90061000)},{days:1,hours:1,minutes:1,seconds:1});
 assert.deepEqual({...campaign.remaining(end+1000)},{days:0,hours:0,minutes:0,seconds:0});
 const fresh={};vm.runInNewContext(code,fresh);assert.equal(fresh.VilleBlackFriday.active(end+1),false);
});

test('the gift requires two nights and timely booking, without restricting future stay dates or property types',()=>{
 const now=Date.parse('2026-11-27T23:59:59-03:00');
 assert.equal(campaign.eligible(1,now),false);assert.equal(campaign.eligible(2,now),true);assert.equal(campaign.eligible(30,now),true);
 for(const nights of [NaN,-1,1.5,'2'])assert.equal(campaign.eligible(nights,now),false);
 assert.match(campaign.message(2,now),/experiência romântica exclusiva/);assert.match(campaign.message(2,now),/confirmadas até 27\/11\/2026/);
 assert.equal(campaign.message(2,Date.parse(campaign.terms.endsAt)), '');
});

test('expired banners remove the discount and gift and expose an ended message',()=>{
 const dom=new JSDOM('<body><a data-bf-countdown><span data-bf-active>BLACK FRIDAY -15%</span><span data-bf-active>Presente</span><span data-bf-digit="seconds">10</span><span data-bf-ended hidden>Black Friday encerrada</span></a></body>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.Date.now=()=>Date.parse('2026-11-28T00:00:00-03:00');w.eval(code);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(w.document.querySelector('[data-bf-countdown]').dataset.bfState,'ended');
  assert.ok([...w.document.querySelectorAll('[data-bf-active]')].every(node=>node.hidden));
  assert.equal(w.document.querySelector('[data-bf-ended]').hidden,false);assert.equal(w.document.querySelector('[data-bf-digit]').textContent,'00');assert.ok(w.document.body.classList.contains('bf-ended'));
 }finally{w.close();}
});

test('the current WhatsApp flow carries gift terms while active and leaves the confirmed quote unchanged',async()=>{
 const dom=new JSDOM(await readFile(new URL('../reservar.html',import.meta.url),'utf8'),{url:'https://qa.example/reservar.html?mode=stay',runScripts:'outside-only'}),w=dom.window;
 try{
  let clock=Date.parse('2026-11-24T12:00:00-03:00');w.Date.now=()=>clock;
  w.CHALEZINHO_CONFIG={releaseProfile:'whatsapp',bookingEngine:'https://qa.example/engine',supabaseUrl:'https://qa.example',supabaseKey:'fixture',whatsappNumber:'5593991592266',environment:'development'};
  w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};w.VilleImages={set:(img,url)=>img.src=url};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  const property={id:1,code:'CH1',property_type:'chalet',name:'Ville Signature',available:true,features:{},cover_image:'assets/ch1-capa-casal-spa.webp',gallery:[],max_guests:2,from_stay_price:1250},calls=[];
  const terms=[{property_id:1,credit_fee_bps:700,installments_count:10,cash_price_source:'quote'}];
  w.fetch=async(url,options={})=>{
   if(String(url).includes('/rest/v1/'))return {ok:true,json:async()=>terms};
   const input=options.body?JSON.parse(options.body):{},action=new URL(url).searchParams.get('action')||input.action;calls.push(action);
   const quote={ok:true,consultation_pricing:{profile:'lodging-airbnb-base-v1'},consulted_at:new Date().toISOString(),property,experiences:[],rate_options:[{code:'non_refundable',name:'Escapada',selectable:true,total_amount_cents:125000,contract_snapshot:{property_id:1,property_name:property.name,check_in:input.check_in||'2026-12-01',check_out:input.check_out||'2026-12-03',guests:2}}]};
   const data=action==='config'?{ok:true,purposes:[],experience_products:[],stay_offers:[]}:action==='property_media'?{ok:true,properties:[property]}:action==='search'?{ok:true,listings:[{...property,quote}]}:quote;
   return {ok:true,status:200,json:async()=>data};
  };
  for(const name of ['site-prices.js','black-friday.js','stay-offers.js','consultation-summary.js'])w.eval(await readFile(new URL('../'+name,import.meta.url),'utf8'));
  w.VillePrices.configure(terms);
  const source=await readFile(new URL('../booking.js',import.meta.url),'utf8'),at=source.lastIndexOf('init();');w.eval(source.slice(0,at)+'window.BfTest={init,search,openFlow,continueWhatsApp,state};'+source.slice(at+7));
  await w.BfTest.init();w.document.querySelector('#book-in').value='2026-12-01';w.document.querySelector('#book-out').value='2026-12-03';await w.BfTest.search();await w.BfTest.openFlow(1);await w.BfTest.continueWhatsApp();
  const message=()=>new URL(w.document.querySelector('#whatsapp-open').href).searchParams.get('text');
  assert.match(message(),/Black Friday: experiência romântica exclusiva/);assert.match(message(),/01\/12\/2026/);assert.equal(w.BfTest.state.rate.total_amount_cents,125000);
  clock=Date.parse(campaign.terms.endsAt);await w.BfTest.continueWhatsApp();assert.doesNotMatch(message(),/Black Friday:/);assert.equal(w.BfTest.state.rate.total_amount_cents,125000);
  assert.ok(calls.every(action=>['config','property_media','search','quote'].includes(action)));
 }finally{w.close();}
});
