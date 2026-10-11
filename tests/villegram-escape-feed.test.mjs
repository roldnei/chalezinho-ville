import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const renderer=await readFile(new URL('../villegram.js',import.meta.url),'utf8');
const content=await readFile(new URL('../villegram-content.js',import.meta.url),'utf8');
const post=i=>({id:'property-'+i,type:'property',property_id:i,title:'Chalé '+i,caption:'Fotos reais',media:[{kind:'photo',url:'assets/photo.webp'}],cta:'property'});
const escape=(i=0)=>({offer_id:i%2?'card':'cash',offer_name:'Escapada Ultra Premium · '+(i%2?'cartão':'à vista'),property_id:i%3+1,property_code:'CH'+(i%3+1),property_name:'Ville '+i,check_in:'2040-11-16',check_out:i<12?'2040-11-18':'2040-11-19',nights:i<12?2:3,guests:2,rate_code:'non_refundable',rate_name:'Não reembolsável',image:'assets/photo.webp',total_cents:150000+i,gross_cents:160000+i,discount_cents:10000,experiences:[{components:[{name:'Ambientação romântica'}]}],commercial_condition:{label:i%2?'Cartão · até 4x sem juros':'À vista',price_cents:i%2?56900:53900}});
// 24 distinct live selections: two conditions, three chalets, two durations and two arrivals.
const escapes=Array.from({length:24},(_,i)=>({...escape(i),check_in:i%12<6?'2040-11-16':'2040-11-23',check_out:(i%12<6?'2040-11-':'2040-11-')+(i%12<6?(i<12?'18':'19'):(i<12?'25':'26'))}));
async function setup(t,{deferred=false,following=false}={}){
 const d=new JSDOM('<header><nav></nav></header><main><div class="hero"></div></main>',{url:'https://dev.local/index.html'+(following?'?feed=following':''),runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;t.after(()=>{w.Villegram?.close();w.close()});
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.local',bookingEngine:'https://dev.local/api',releaseProfile:'whatsapp',features:{social:false}};
 w.matchMedia=q=>({matches:q.includes('max-width'),addEventListener(){}});w.IntersectionObserver=class{observe(){}disconnect(){}};w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLMediaElement.prototype.pause=()=>{};w.VilleOffers={label:i=>i.name};w.AbortSignal.timeout=()=>undefined;
 let resolve;const ready=new Promise(r=>resolve=r),feed={ok:true,publications:[1,2,3,4].map(post),properties:[1,2,3,4].map(i=>({id:i,code:'CH'+i,name:'Ville '+i})),products:[],offers:[],max_offers:3};
 w.fetch=async()=>({ok:true,json:async()=>{if(deferred)await ready;return feed}});
 w.eval(renderer);w.eval(content);return {w,resolve,settle:()=>new Promise(r=>setTimeout(r,20))};
}
for(const order of ['offers-first','publications-first'])test('every showcase escape joins the initial feed without a click: '+order,async t=>{
 const {w,resolve,settle}=await setup(t,{deferred:order==='offers-first'});if(order==='publications-first')await settle();
 const old=w.document.querySelector('.vg-reel');w.Villegram.configure([...escapes,escapes[0],{...escape(),check_in:'2000-01-01'}],[],[]);resolve();await settle();
 assert.match(w.document.querySelector('.vg-progress>span').textContent,/de 28$/);
 if(old)assert.equal(w.document.querySelector('.vg-reel'),old,'delayed quotes must preserve playback');
 const seen=new Set();for(let i=0;i<28;i++){const cta=w.document.querySelector('.vg-primary');if(w.document.querySelector('.vg-escape'))seen.add(cta.getAttribute('href'));w.document.querySelector('[data-action=next]').click();}
 assert.equal(seen.size,24);assert.equal(w.document.querySelector('[data-action=next]').disabled,true);
});
test('same arrival preserves the clicked departure, condition and total, without duplicates on repeated refresh',async t=>{
 const {w,settle}=await setup(t);await settle();const two=escape(),three={...two,check_out:'2040-11-19',nights:3,total_cents:170000};w.Villegram.configure([two,three],[],[]);w.Villegram.open(three);
 const reel=w.document.querySelector('.vg-reel'),href=w.document.querySelector('.vg-primary').href;assert.equal(new URL(href).searchParams.get('check_out'),three.check_out);assert.equal(new URL(href).searchParams.get('expected_total'),'170000');
 w.Villegram.configure([two,three],[],[]);assert.equal(w.document.querySelector('.vg-reel'),reel);assert.equal(w.document.querySelector('.vg-primary').href,href);assert.match(w.document.querySelector('.vg-progress>span').textContent,/de 6$/);
 assert.equal(w.document.querySelector('details').open,false);assert.match(w.document.querySelector('details').textContent,/Desconto.*100,00/);assert.equal(w.document.querySelector('h2').textContent,'Escapada Ultra Premium');assert.equal(w.document.querySelector('h3').textContent,'16 → 19 nov. · 2040');assert.equal(w.document.querySelector('.vg-bottom-nav').children.length,4);
 w.Villegram.openHome(three);w.Villegram.remember();assert.ok(w.history.state.villegramPosition.id.includes(three.check_out));
 w.Villegram.close();w.VillegramContent.enter();assert.equal(w.document.querySelector('.vg-primary').href,href,'return must restore the exact escape');
});
test('following feed remains limited to followed publications',async t=>{const {w,settle}=await setup(t,{following:true});await settle();w.Villegram.configure(escapes,[],[]);assert.match(w.document.querySelector('.vg-progress>span').textContent,/de 4$/)});

test('private composer previews retain the saved immersive headline',async t=>{const {w,settle}=await setup(t);await settle();const preview={...escape(),preview:true};w.Villegram.configure([preview],[{id:preview.offer_id,villegram:{title:'Título imersivo salvo no editor'}}],[]);w.Villegram.open(preview);assert.equal(w.document.querySelector('h2').textContent,'Título imersivo salvo no editor');assert.equal(w.document.querySelector('.vg-price').textContent,'Consulte as datas para saber o total')});
