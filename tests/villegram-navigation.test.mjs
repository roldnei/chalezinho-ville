import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const id='4069a585-7cc6-48ad-9263-567358a45c0c';
const publication={id,type:'offer',title:'Escapada a dois',caption:'Fotos reais',cta:'offer',media:[{kind:'photo',url:'assets/signature.webp'}],cover_index:0};
const card={publication,publication_id:id,offer_id:id,property_id:1,property_code:'CH1',property_name:'Ville Signature',check_in:'2026-11-16',check_out:'2026-11-19',guests:2,nights:3,rate_code:'refundable',total_cents:123456,experiences:[]};
async function setup({mobile=false,reduced=false,media=null}={}){
 const d=new JSDOM('<header><nav></nav></header><main><div class="hero"></div></main>',{url:'https://dev.local/index.html',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window,timers=new Map();
 for(const file of ['styles.css','villegram.css']){const style=w.document.createElement('style');style.textContent=await readFile(new URL('../'+file,import.meta.url),'utf8');w.document.head.append(style)}
 let now=0;const intervals=new Map();Object.defineProperty(w.performance,'now',{value:()=>now});w.setInterval=(fn,ms)=>{intervals.set(ms,fn);return ms};w.clearInterval=ms=>intervals.delete(ms);
 w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLMediaElement.prototype.pause=()=>{};
 w.matchMedia=q=>({matches:q.includes('reduced-motion')?reduced:mobile,addEventListener(){}});
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.supabase.co',bookingEngine:'https://dev/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
 w.setTimeout=(fn,ms)=>{timers.set(ms,fn);return ms};w.clearTimeout=ms=>timers.delete(ms);
 w.VilleOffers={label:i=>i.name};w.fetch=async()=>({ok:true,json:async()=>({ok:true,publications:[],properties:[],products:[],offers:[],max_offers:3,likes:0,comments:[]})});
 w.eval(await readFile(new URL('../villegram.js',import.meta.url),'utf8'));
 w.eval(await readFile(new URL('../villegram-content.js',import.meta.url),'utf8'));
 await new Promise(r=>setTimeout(r,10));
 const current=media?{...card,publication:{...publication,media}}:card;w.Villegram.configurePublications([current,{...card,publication_id:'other',publication:{...publication,id:'other'}}],[],[]);
 w.Villegram.openHome(current);return {d,w,timers,advance(ms){now+=ms;intervals.get(100)?.()}};
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

test('primary action uses equal reel gutters and social actions remain icon-only with accessible names',async()=>{
 const {d,w}=await setup();await new Promise(r=>setTimeout(r,0));const purchase=w.document.querySelector('.vg-purchase'),style=w.getComputedStyle(purchase);
 assert.equal(style.paddingLeft,style.paddingRight);assert.equal(w.getComputedStyle(purchase.querySelector('.vg-story')).paddingRight,'56px');assert.equal(w.getComputedStyle(purchase.querySelector('.vg-primary')).justifyContent,'center');
 for(const action of ['like','comments','share']){const b=w.document.querySelector('[data-action='+action+']');assert.equal(b.textContent,'');assert.equal(b.querySelectorAll('svg').length,1);assert.ok(b.getAttribute('aria-label'));assert.equal(w.getComputedStyle(b).minHeight,'48px')}
 w.document.querySelector('[data-action=comments]').click();assert.equal(w.document.querySelector('.vg-sheet').hidden,false);d.window.close();
});
test('oval countdown tracks a whole photo cycle and freezes during pause, hidden tabs and reading',async()=>{
 const {d,w,advance}=await setup({media:[{kind:'photo',url:'a.webp'},{kind:'photo',url:'b.webp'}]});const remaining=()=>Number(w.document.querySelector('.vg-time-remaining').style.strokeDashoffset);
 advance(3250);assert.equal(remaining(),25);w.document.querySelector('[data-action=pause]').click();assert.ok(w.document.querySelector('.vg-time-ring'));advance(20000);assert.equal(remaining(),25);
 w.document.querySelector('[data-action=pause]').click();advance(3250);assert.equal(remaining(),50);assert.equal(w.document.querySelectorAll('.vg-scene')[1].classList.contains('is-visible'),true);
 let hidden=true;Object.defineProperty(w.document,'hidden',{get:()=>hidden,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));advance(50000);assert.equal(remaining(),50);hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));
 w.document.querySelector('[data-action=caption]').click();advance(30000);assert.equal(remaining(),50);w.document.querySelector('[data-sheet-close]').click();advance(6500);assert.equal(remaining(),0);assert.equal(w.document.querySelector('.vg-progress>span').textContent,'1 de 2');
 w.document.querySelector('[data-action=next]').click();assert.equal(remaining(),0);d.window.close();
});
test('video countdown follows actual playback metadata and keeps its ring when toggling pause',async()=>{
 const {d,w,advance}=await setup({media:[{kind:'video',url:'clip.mp4',duration_seconds:20,poster:'cover.webp'}]}),video=w.document.querySelector('video');assert.equal(w.document.querySelector('.vg-time-ring').hasAttribute('hidden'),true);Object.defineProperty(video,'duration',{value:20});video.currentTime=5;video.dispatchEvent(new w.Event('loadedmetadata'));
 assert.equal(w.document.querySelector('.vg-time-ring').hasAttribute('hidden'),false);assert.equal(w.document.querySelector('.vg-time-remaining').style.strokeDashoffset,'25');assert.equal(w.document.querySelector('.vg-pause').title,'15 s restantes nesta apresentação');advance(90000);assert.equal(w.document.querySelector('.vg-time-remaining').style.strokeDashoffset,'25');
 w.document.querySelector('[data-action=pause]').click();assert.equal(w.document.querySelector('.vg-pause-symbol').textContent,'▶');assert.ok(w.document.querySelector('.vg-time-ring'));d.window.close();
});
test('booking header and steps occupy normal document rows with a bounded three-column layout',async()=>{
 const html=await readFile(new URL('../reservar.html',import.meta.url),'utf8'),d=new JSDOM(html);for(const file of ['styles.css','booking-layout.css']){const style=d.window.document.createElement('style');style.textContent=await readFile(new URL('../'+file,import.meta.url),'utf8');d.window.document.head.append(style)}
 const w=d.window;assert.ok(w.document.querySelector('link[href^="booking-layout.css"]'));assert.equal(w.getComputedStyle(w.document.querySelector('.detail-header')).position,'relative');
 for(const steps of w.document.querySelectorAll('.reservation-steps')){const style=w.getComputedStyle(steps);assert.equal(style.position,'static');assert.equal(style.display,'grid');assert.equal(style.gridTemplateColumns,'repeat(3,minmax(0,1fr))');assert.equal(style.textTransform,'none');assert.equal(style.letterSpacing,'0')}
 d.window.close();
});

test('feed preserves the exact top alignment selected in the composer for photos and videos',async()=>{
 for(const kind of ['photo','video']){const {d,w}=await setup({media:[{kind,url:'assets/media.'+(kind==='photo'?'webp':'mp4'),position:0,fit:'cover',duration:9}]});const scene=w.document.querySelector('.vg-visual '+(kind==='photo'?'img':'video'));assert.equal(scene.style.objectPosition,'50% 0%');assert.equal(scene.style.objectFit,'cover');d.window.close()}
});
