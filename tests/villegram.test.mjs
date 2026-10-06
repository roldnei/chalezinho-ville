import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {validateVillegram,commentText,villegramService} from '../supabase/functions/_shared/villegram.ts';
import {isCelebration,showcaseSettings,weekdayWindows,weekdayShowcase} from '../supabase/functions/_shared/stay-showcase.ts';
test('media configuration requires property identity and commercial audio provenance',()=>{
 assert.deepEqual(validateVillegram().photos,[]);assert.throws(()=>validateVillegram({photos:[{url:'x',property_id:0}]}));assert.throws(()=>validateVillegram({audio:{url:'x'}}),/audio_license/);assert.equal(validateVillegram({audio:{url:'x',origin:'Author',license:'Own commercial recording'}}).audio.origin,'Author');assert.throws(()=>commentText('x'.repeat(501)));assert.throws(()=>commentText('\u0000'));assert.equal(commentText('<script>hello</script>'),'<script>hello</script>');
});
test('holiday rules are explicit and celebrations do not masquerade as low demand',()=>{
 const s=showcaseSettings({enabled:true,celebrations:true,holidays:['2026-10-12'],nights:[2],horizon_days:14});assert.equal(isCelebration('2026-10-12','2026-10-14',s),true);assert.equal(s.celebration_discount,false);assert.equal(isCelebration('2026-11-02','2026-11-04',{}),true);const rows=weekdayWindows('2026-10-05',s,{min_nights:2});assert.ok(rows.some(r=>r.category==='celebration'));assert.ok(rows.some(r=>!r.category));
});
test('interaction writes require validated authentication and never change finance',async()=>{
 const handler=villegramService({admin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'a',status:'active'}})})})})},currentUser:async()=>null,userIsAdmin:async()=>false,json:(body,status=200)=>({body,status})});const r=await handler(new Request('https://test'),{offer_id:'a8116a6a-66e2-471f-8a6a-d35daa690887',operation:'like',liked:true},true);assert.equal(r.status,401);assert.equal((await handler(new Request('https://test'),{},false)).status,403);
});
test('reel keeps contract links, escapes comments and cleans lifecycle on close',async()=>{
 const dom=new JSDOM('<button id="watch">Watch</button>',{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLElement.prototype.focus=function(){};w.VilleOffers={label:i=>i.name};w.CHALEZINHO_CONFIG={bookingEngine:'https://api'};w.fetch=async url=>({ok:true,json:async()=>String(url).includes('property_media')?{properties:[{id:1,gallery:['photo.webp']}]}:{ok:true,likes:2,liked:false,comments:[{id:'c',display_name:'<img>',body:'<script>alert(1)</script>'}]}});w.eval(await readFile(new URL('../villegram.js',import.meta.url),'utf8'));const c={offer_id:'offer',property_id:1,property_code:'CH1',property_name:'Ville',check_in:'2026-10-13',check_out:'2026-10-15',nights:2,guests:2,rate_code:'non_refundable',rate_name:'Tarifa',total_cents:123456,gross_cents:129954,discount_cents:6498,experiences:[]};await w.Villegram.configure([c,{...c,property_id:2,property_code:'CH2'}],[{id:'offer',name:'Escapada'}]);w.Villegram.open(c);assert.match(w.document.querySelector('.vg-price').textContent,/1.234,56/);const q=new URL(w.document.querySelector('.vg-primary').href).searchParams;assert.equal(q.get('stay_offer'),'offer');assert.equal(q.get('check_in'),'2026-10-13');assert.equal(q.get('rate'),'non_refundable');w.document.querySelector('[data-action=comments]').click();await new Promise(r=>setTimeout(r,10));assert.equal(w.document.querySelector('.vg-sheet script'),null);assert.match(w.document.querySelector('.vg-sheet').textContent,/<script>/);w.document.querySelector('[data-sheet-close]').click();
 const swipe=(selector,from,to)=>{const el=w.document.querySelector(selector);for(const [type,y] of [['pointerdown',from],['pointermove',to],['pointerup',to]])el.dispatchEvent(new w.MouseEvent(type,{bubbles:true,clientX:100,clientY:y}))};
 swipe('.vg-primary',300,100);assert.match(w.document.querySelector('footer').textContent,/1 de 2/,'reserve button must not swipe');
 swipe('.vg-purchase',500,250);assert.match(w.document.querySelector('footer').textContent,/2 de 2/,'swipe across overlay advances');
 swipe('.vg-content',250,500);assert.match(w.document.querySelector('footer').textContent,/1 de 2/,'swipe down returns');
 const touch=(selector,from,to)=>{const el=w.document.querySelector(selector);for(const [type,y] of [['touchstart',from],['touchend',to]]){const e=new w.Event(type,{bubbles:true});Object.defineProperty(e,type==='touchstart'?'touches':'changedTouches',{value:[{clientX:100,clientY:y}]});el.dispatchEvent(e)}};
 touch('summary',500,200);assert.match(w.document.querySelector('footer').textContent,/1 de 2/,'reading controls must not change reel');
 touch('.vg-content',500,200);assert.match(w.document.querySelector('footer').textContent,/2 de 2/,'touch scroll gesture advances without pointer capture');
 touch('.vg-content',200,500);assert.match(w.document.querySelector('footer').textContent,/1 de 2/);
 w.document.querySelector('.vg-content').dispatchEvent(new w.WheelEvent('wheel',{deltaY:150,bubbles:true,cancelable:true}));assert.match(w.document.querySelector('footer').textContent,/2 de 2/);
 w.Villegram.close();assert.equal(w.document.querySelector('#villegram'),null);assert.equal(w.document.documentElement.style.overflow,'');dom.window.close();
});
