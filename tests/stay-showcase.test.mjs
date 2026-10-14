import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {showcaseSettings, weekdayWindows, weekdayShowcase, cachedWeekdayShowcase} from '../supabase/functions/_shared/stay-showcase.ts';

test('minimum storefront extends holidays, rechecks new nights and keeps one duration per arrival',async()=>{
 const offer={id:'stay-only',name:'Hospedagem',status:'active',product_ids:[],property_ids:[1,2,3],min_nights:2,max_nights:7,showcase:{enabled:true,nights:[2],horizon_days:21,celebrations:true,duration_mode:'minimum'}};
 const calls=[];
 const result=await weekdayShowcase({today:'2026-10-11',catalog:async()=>({offers:[offer],products:[]}),sources:async()=>({}),search:async(start,end)=>{
   calls.push([start,end]);const nights=(Date.parse(end)-Date.parse(start))/86400000;
   return [1,2,3].map(id=>({id,code:'CH'+id,name:'Ville',min_stay:start==='2026-10-12'?3:2,available:nights>=(start==='2026-10-12'?3:2)&&!(id===2&&start==='2026-10-12'),base_price:500}));
 },quote:async(body)=>({rate_options:[{selectable:true,code:'non_refundable',name:'Não reembolsável',total_amount_cents:125000,accommodation_amount_cents:110000,cleaning_fee_cents:15000,contract_snapshot:{gross_cents:125000,discount_cents:0}}],experiences:[]})});
 const holiday=result.cards.filter(c=>c.check_in==='2026-10-12');assert.ok(holiday.length);assert.ok(holiday.every(c=>c.nights===3&&c.check_out==='2026-10-15'&&c.holiday&&c.property_id!==2));
 assert.ok(result.cards.some(c=>c.nights===2));assert.ok(calls.some(([s,e])=>s==='2026-10-12'&&e==='2026-10-15'));
 assert.equal(new Set(result.cards.map(c=>c.property_id+':'+c.check_in)).size,result.cards.length);
 assert.ok(result.cards.every(c=>c.experiences.length===0&&c.discount_cents===0&&c.total_cents===c.accommodation_cents+c.cleaning_cents&&c.check_in>'2026-10-11'&&c.check_in<='2026-11-01'));
});

test('minimum duration respects offer ceiling, extended-stay rules and unavailable calendars',async()=>{
 const offer={id:'ceiling',status:'active',property_ids:[1],min_nights:2,max_nights:3,showcase:{enabled:true,nights:[2],horizon_days:21,celebrations:true,duration_mode:'minimum'}};
 let quoted=0;
 const result=await weekdayShowcase({today:'2026-10-11',catalog:async()=>({offers:[offer],products:[]}),sources:async()=>({}),search:async(start,end)=>[{id:1,min_stay:start==='2026-10-12'?4:3,available:false,unavailable_reason:end===start?'minimum_stay':'calendar_unavailable'}],quote:()=>{quoted++;throw Error('must not quote')}});
 assert.equal(result.cards.length,0);assert.equal(quoted,0);
});

test('weekday storefront obeys offer durations, periods and excludes every weekend night',()=>{
 const settings=showcaseSettings({enabled:true,nights:[2,3],horizon_days:30});
 const rows=weekdayWindows('2026-10-05',settings,{min_nights:2,max_nights:2,start_date:'2026-10-12',end_date:'2026-10-24'});
 assert.ok(rows.length);assert.ok(rows.every(r=>r.nights===2&&r.check_in>='2026-10-12'&&r.check_out<='2026-10-24'));
 for(const r of rows)for(let i=0;i<r.nights;i++){const day=new Date(Date.parse(r.check_in+'T12:00:00Z')+i*86400000).getUTCDay();assert.ok(day>=1&&day<=4)}
 assert.throws(()=>showcaseSettings({nights:[2,99]}),/invalid_showcase/);assert.throws(()=>showcaseSettings({horizon_days:500}),/invalid_showcase/);
});
test('storefront checks service feasibility, keeps both durations, and uses final server quote',async()=>{
 const offer={id:'offer',name:'Escapada',status:'active',min_nights:1,property_ids:[1],showcase:{enabled:true,nights:[2,3],horizon_days:14}};
 const catalog={offers:[offer,{...offer,id:'paused',status:'paused'}],products:[]};let sourceCalls=0;const attempts=[];
 const result=await weekdayShowcase({today:'2026-10-05',catalog:async()=>catalog,sources:async()=>{sourceCalls++;return{}},search:async(start)=>[{id:1,code:'CH1',name:'Ville',available:true,base_price:start==='2026-10-06'?1:200,cover_image:'cover.webp'},{id:2,available:true,base_price:1}],quote:async(body)=>{
  attempts.push(body);if(body.check_in==='2026-10-06')throw Error('experience_capacity');
  return {rate_options:[{selectable:false,total_amount_cents:1},{selectable:true,code:'non_refundable',name:'Não reembolsável',total_amount_cents:123456,contract_snapshot:{gross_cents:129954,discount_cents:6498}}],experiences:[{composition:{components:[{name:'Ambientação',quantity:1}]}}]};
 }});
 assert.equal(sourceCalls,1);assert.ok(result.cards.length);assert.deepEqual(new Set(result.cards.map(c=>c.nights)),new Set([2,3]));
 assert.ok(result.cards.every(c=>c.offer_id==='offer'&&c.property_id===1&&c.total_cents===123456&&c.check_in!=='2026-10-06'));assert.ok(attempts.every(b=>b.stay_offer_id==='offer'));
});
test('paused or unpromoted offers do not trigger external rate queries',async()=>{
 const result=await weekdayShowcase({today:'2026-10-05',catalog:async()=>({offers:[{status:'paused',showcase:{enabled:true}},{status:'active',showcase:{enabled:false}}]}),sources:()=>{throw Error('unexpected')}});
 assert.deepEqual(result.cards,[]);
});

test('minimum showcase completes each chosen period with available peers instead of hiding a more expensive chalet',async()=>{
 const offer={id:'compare',name:'Hospedagem',status:'active',product_ids:[],property_ids:[1,2,3],min_nights:2,max_nights:7,showcase:{enabled:true,nights:[2],horizon_days:21,celebrations:true,duration_mode:'minimum'}};
 const result=await weekdayShowcase({today:'2026-10-11',catalog:async()=>({offers:[offer],products:[]}),sources:async()=>({}),search:async(start)=>[1,2,3].map(id=>({id,code:'CH'+id,available:!(id===2&&start==='2026-10-12'),min_stay:2,base_price:(Number(start.slice(-2))+id)%5*100})),quote:async(body)=>({rate_options:[{selectable:true,code:'non_refundable',name:'Não reembolsável',total_amount_cents:10000+body.property_id,contract_snapshot:{gross_cents:10000+body.property_id,discount_cents:0}}],experiences:[]})});
 for(const c of result.cards)assert.deepEqual(result.cards.filter(p=>p.check_in===c.check_in&&p.check_out===c.check_out).map(p=>p.property_id).sort(),c.check_in==='2026-10-12'?[1,3]:[1,2,3]);
 assert.ok(result.period_status.some(s=>s.property_id===2&&s.check_in==='2026-10-12'&&s.reason==='unavailable'));
});

test('period columns keep chalet order, unique dates, accurate links and facility photos; unavailable chalets are omitted and remaining rows fill the column',async()=>{
 const dom=new JSDOM('<main><section class="hero"></section></main>',{url:'https://qa.example/',runScripts:'outside-only'}),w=dom.window;
 try{
  const properties=[1,2,3].map(id=>({id,code:'CH'+id,name:['Ville Signature','Ville Essenza','Ville Amore'][id-1]}));
  const make=(id,start,end,nights)=>({property_id:id,property_code:'CH'+id,property_name:properties[id-1].name,offer_id:'stay',offer_name:'Hospedagem e limpeza',check_in:start,check_out:end,nights,guests:2,rate_code:'non_refundable',rate_name:'Não reembolsável',total_cents:100000+id,experiences:[]});
  const cards=[make(3,'2026-10-17','2026-10-19',2),make(1,'2026-10-17','2026-10-19',2),make(2,'2026-10-17','2026-10-19',2),make(3,'2026-10-18','2026-10-21',3)];
  let opened;w.Villegram={configure:()=>{},open:c=>opened=c};w.VilleOffers={esc:s=>String(s??''),label:c=>c.name};w.CHALEZINHO_CONFIG={bookingEngine:'https://qa.example/engine',environment:'development'};w.HTMLElement.prototype.scrollTo=()=>{};
  w.fetch=async()=>({ok:true,json:async()=>({ok:true,cards,properties,offers:[],checked_at:new Date().toISOString(),period_status:[{property_code:'CH1',check_in:'2026-10-18',check_out:'2026-10-21',reason:'minimum_stay',min_stay:4}]})});
  w.eval(await readFile(new URL('../stay-showcase.js',import.meta.url),'utf8'));await w.VilleShowcase.load([]);
  const doc=w.document,columns=[...doc.querySelectorAll('.showcase-period')];assert.equal(columns.length,2);
  assert.deepEqual([...columns[0].querySelectorAll('[data-property]')].map(e=>e.dataset.property),['CH1','CH2','CH3']);
  for(const row of columns[0].querySelectorAll('.showcase-card')){const query=new URL(row.querySelector('a').href).searchParams;assert.equal(query.get('chalet'),row.dataset.property);assert.equal(query.get('check_in'),'2026-10-17');assert.equal(query.get('check_out'),'2026-10-19');row.querySelector('[data-villegram]').click();assert.equal(opened.property_code,row.dataset.property);assert.equal(opened.check_in,'2026-10-17');assert.equal(opened.showcase_image,new URL(row.querySelector('img').src).pathname.slice(1))}
  assert.equal(doc.querySelectorAll('.showcase-unavailable').length,0);assert.deepEqual([...columns[1].querySelectorAll('[data-property]')].map(e=>e.dataset.property),['CH3']);assert.equal(columns[1].querySelector('.showcase-period-rows').dataset.rowCount,'1');assert.equal(columns[0].querySelector('.showcase-period-rows').dataset.rowCount,'3');assert.notEqual(columns[0].querySelector('[data-property=CH3] img').src,columns[1].querySelector('img').src);
  doc.querySelector('[data-nights="2"]').click();assert.equal(columns[1].hidden,true);assert.equal(columns[0].hidden,false);
 }finally{w.close()}
});
test('concurrent home queries share a short cache and catalog edits invalidate it',async()=>{
 let calls=0,version=1;
 const deps={today:'2031-04-01',catalog:async()=>({offers:[{id:'cached-offer',updated_at:version,status:'active',min_nights:1,property_ids:[1],showcase:{enabled:true,nights:[2],horizon_days:14}}],products:[]}),sources:async()=>{calls++;return{}},search:async()=>[],quote:async()=>{throw Error('unexpected')}};
 await Promise.all([cachedWeekdayShowcase(deps),cachedWeekdayShowcase(deps)]);assert.equal(calls,1);
 version++;await cachedWeekdayShowcase(deps);assert.equal(calls,2);
});
test('home renders dated price cards and duration filters; links carry explicit offer and dates',async()=>{
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10),checkIn=day(2);
 const dom=new JSDOM('<main><section class="hero"></section><section class="trust-strip">4,95</section></main>',{url:'https://qa.example/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.VilleOffers={esc:s=>String(s??''),label:c=>c.name};w.CHALEZINHO_CONFIG={bookingEngine:'https://qa.example/engine',environment:'development'};w.HTMLElement.prototype.scrollTo=()=>{};w.Villegram={configure:()=>new Promise(()=>{})};
  w.fetch=async()=>({ok:true,json:async()=>({ok:true,checked_at:'2026-10-05T20:00:00Z',offers:[{id:'offer',name:'Escapada'}],properties:[{id:1,gallery:['cover.webp']}],cards:[2,3].map(n=>({nights:n,offer_id:'offer',offer_name:'Escapada',property_code:'CH1',property_name:'Ville',check_in:checkIn,check_out:day(2+n),guests:2,rate_code:'non_refundable',rate_name:'Não reembolsável',total_cents:123456,gross_cents:129954,discount_cents:6498,experiences:[{components:[{name:'Ambientação'}]}]}))})});
  w.eval(await readFile(new URL('../stay-showcase.js',import.meta.url),'utf8'));await w.VilleShowcase.load([{id:'offer',name:'Escapada'}]);
  const doc=w.document;assert.equal(doc.querySelector('.trust-strip').nextElementSibling.id,'estadias-completas');assert.equal(doc.querySelectorAll('.showcase-card').length,2);assert.equal(doc.querySelector('[name=guests]').value,'2');assert.ok(doc.querySelector('[name=purpose]'));assert.equal(doc.querySelector('[name=stay_offer]'),null);
  const q=new URL(doc.querySelector('.showcase-card a').href).searchParams;assert.equal(q.get('stay_offer'),'offer');assert.equal(q.get('check_in'),checkIn);assert.equal(q.get('rate'),'non_refundable');assert.match(doc.querySelector('.showcase-price').textContent,/1.234,56/);
  doc.querySelector('.showcase-filters [data-nights="2"]').click();assert.equal(doc.querySelector('.showcase-card[data-nights="3"]').hidden,true);
  assert.match(doc.querySelector('.showcase-price-note').textContent,/Valores consultados no catálogo/);
 }finally{dom.window.close()}
});
test('storefront preview never persists quote rows or enables payments',async()=>{
 const engine=await readFile(new URL('../supabase/functions/booking-engine/index.ts',import.meta.url),'utf8');
 assert.match(engine,/createQuote\(body,development,null,null,list,false,catalog,await context,consultation\)/);
 assert.match(engine,/if\(persist&&expSnapshots.length\)/);assert.match(engine,/if\(persist&&inserted.length\)/);
});

test('first visit reserves storefront space and consumes the early request without a second fetch',async()=>{
 const dom=new JSDOM('<main><section class="hero"></section></main>',{url:'https://qa.example/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.VilleOffers={esc:s=>String(s),label:c=>c.name};w.CHALEZINHO_CONFIG={bookingEngine:'https://api',environment:'development'};
  let finish;w.VilleShowcasePrefetch=new Promise(resolve=>finish=resolve);w.fetch=()=>{throw Error('duplicate request')};
  w.eval(await readFile(new URL('../stay-showcase.js',import.meta.url),'utf8'));const loading=w.VilleShowcase.load([]);
  assert.equal(w.document.querySelector('.showcase-track').getAttribute('aria-busy'),'true');assert.equal(w.document.querySelectorAll('.showcase-placeholder').length,3);
  finish({ok:true,json:async()=>({ok:true,cards:[],offers:[],checked_at:new Date().toISOString()})});await loading;
  assert.equal(w.document.querySelector('.showcase-track').getAttribute('aria-busy'),'false');assert.equal(w.document.querySelectorAll('.showcase-placeholder').length,0);
 }finally{w.close()}
});

test('weekend suggestions prioritize Friday or Saturday arrivals over cheap Sunday spillovers',async()=>{
 const offer={id:'weekend',name:'Escapada',status:'active',min_nights:2,property_ids:[1],showcase:{enabled:true,nights:[2,3],horizon_days:21,celebrations:true}};
 const result=await weekdayShowcase({today:'2026-10-11',catalog:async()=>({offers:[offer],products:[]}),sources:async()=>({}),search:async(start)=>[{id:1,code:'CH1',available:true,base_price:new Date(start+'T12:00:00Z').getUTCDay()===0?1:200}],quote:async()=>({rate_options:[{selectable:true,code:'non_refundable',name:'Não reembolsável',total_amount_cents:123456,contract_snapshot:{gross_cents:123456,discount_cents:0}}],experiences:[]})});
 const weekends=result.cards.filter(c=>c.category==='celebration');assert.ok(weekends.length);
 assert.ok(weekends.every(c=>[5,6].includes(new Date(c.check_in+'T12:00:00Z').getUTCDay())));
 assert.deepEqual(new Set(weekends.map(c=>c.nights)),new Set([2,3]));
});
