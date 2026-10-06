import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const id='4069a585-7cc6-48ad-9263-567358a45c0c';
const publication={id,type:'offer',title:'Escapada a dois',caption:'Fotos reais',cta:'offer',media:[{kind:'photo',url:'assets/signature.webp'}],cover_index:0};
const card={publication,publication_id:id,offer_id:id,property_id:1,property_code:'CH1',property_name:'Ville Signature',check_in:'2026-11-16',check_out:'2026-11-19',guests:2,nights:3,rate_code:'refundable',total_cents:123456,experiences:[]};
async function setup({mobile=false,reduced=false}={}){
 const d=new JSDOM('<header><nav></nav></header><main><div class="hero"></div></main>',{url:'https://dev.local/index.html',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window,timers=new Map();
 for(const file of ['styles.css','villegram.css']){const style=w.document.createElement('style');style.textContent=await readFile(new URL('../'+file,import.meta.url),'utf8');w.document.head.append(style)}
 w.matchMedia=q=>({matches:q.includes('reduced-motion')?reduced:mobile,addEventListener(){}});
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.supabase.co',bookingEngine:'https://dev/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
 w.setTimeout=(fn,ms)=>{timers.set(ms,fn);return ms};w.clearTimeout=ms=>timers.delete(ms);
 w.VilleOffers={label:i=>i.name};w.fetch=async()=>({ok:true,json:async()=>({ok:true,publications:[],properties:[],products:[],offers:[],max_offers:3,likes:0,comments:[]})});
 w.eval(await readFile(new URL('../villegram.js',import.meta.url),'utf8'));
 w.eval(await readFile(new URL('../villegram-content.js',import.meta.url),'utf8'));
 await new Promise(r=>setTimeout(r,10));
 w.Villegram.configurePublications([card,{...card,publication_id:'other',publication:{...publication,id:'other'}}],[],[]);
 w.Villegram.openHome(card);return {d,w,timers};
}
test('feed and conventional home use the same named icons and reset inherited navigation formatting',async()=>{
 const {d,w}=await setup();const expected=['Villegram','Chalés','Escolher datas','Minha conta'];
 for(const selector of ['.vg-bottom-nav','.villegram-mobile-nav']){
  const items=[...w.document.querySelector(selector).children];assert.deepEqual(items.map(e=>e.textContent),expected);
  for(const e of items){assert.equal(e.querySelectorAll('svg').length,1);assert.equal(e.querySelector('svg').getAttribute('aria-hidden'),'true');const style=w.getComputedStyle(e);assert.equal(style.textTransform,'none');assert.equal(style.letterSpacing,'0');assert.equal(style.fontFamily,'"DM Sans", sans-serif')}
 }
 d.window.close();
});
test('offer CTA keeps its full booking link and has an explicit accessible button format',async()=>{
 const {d,w}=await setup(),button=w.document.querySelector('.vg-primary'),style=w.getComputedStyle(button),q=new URL(button.href).searchParams;
 assert.equal(button.textContent,'Quero estes dias');assert.ok(button.querySelector('svg'));assert.equal(q.get('stay_offer'),id);assert.equal(q.get('check_in'),'2026-11-16');assert.equal(q.get('check_out'),'2026-11-19');
 assert.equal(style.display,'flex');assert.equal(style.width,'100%');assert.equal(style.minHeight,'54px');assert.equal(style.textTransform,'none');assert.equal(style.color,'rgb(33, 25, 14)');assert.equal(style.backgroundColor,'rgb(209, 182, 120)');d.window.close();
});
test('mobile teaching gesture expires without advancing, appears once, and disappears when reading',async()=>{
 const {d,w,timers}=await setup({mobile:true});assert.ok(w.document.querySelector('.vg-swipe-hint'));assert.ok(w.document.querySelector('.vg-swipe-demo'));assert.equal(w.document.querySelector('.vg-progress>span').textContent,'1 de 2');
 timers.get(4200)();assert.equal(w.document.querySelector('.vg-swipe-hint'),null);assert.equal(w.document.querySelector('.vg-progress>span').textContent,'1 de 2');
 w.document.querySelector('[data-action=next]').click();assert.equal(w.document.querySelector('.vg-swipe-hint'),null);w.Villegram.close();w.sessionStorage.removeItem('villegram-gesture-hint-seen');d.window.close();
 const second=await setup({mobile:true});second.w.document.querySelector('[data-action=caption]').click();assert.equal(second.w.document.querySelector('.vg-swipe-hint'),null);assert.equal(second.w.document.querySelector('.vg-swipe-demo'),null);assert.equal(second.w.document.querySelector('.vg-sheet').hidden,false);second.d.window.close();
});
test('desktop navigation is labelled and enlarged; reduced motion receives a static mobile hint',async()=>{
 const {d,w}=await setup();assert.equal(w.document.querySelector('.vg-swipe-hint'),null);const next=w.document.querySelector('[data-action=next]');assert.equal(next.getAttribute('aria-label'),'Próximo reel');assert.equal(next.querySelector('.vg-step-label').textContent,'Próximo reel');assert.equal(w.getComputedStyle(next).minHeight,'56px');assert.equal(w.getComputedStyle(next).minWidth,'156px');d.window.close();
 const reduced=await setup({mobile:true,reduced:true});assert.ok(reduced.w.document.querySelector('.vg-swipe-hint'));assert.equal(reduced.w.document.querySelector('.vg-swipe-demo'),null);reduced.d.window.close();
});
