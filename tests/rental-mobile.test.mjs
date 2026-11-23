import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const gallery=await readFile(new URL('../rental-gallery.js',import.meta.url),'utf8'),showcase=await readFile(new URL('../rental-showcase.js',import.meta.url),'utf8');
const p={id:4,name:'Apartamento do Centro',slug:'centro',cover_image:'assets/one.webp',gallery:['assets/one.webp','assets/two.webp','assets/three.webp'],max_guests:4,listing:{location_label:'Centro'}};
function setup(t){
 const dom=new JSDOM('<!doctype html><body><main></main></body>',{url:'https://example.test/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.matchMedia=()=>({matches:true});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.HTMLElement.prototype.scrollTo=function({left}){this.scrollLeft=left};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(gallery);return {w,doc:w.document};
}
test('card carousel and full-screen gallery share photos, visible controls and native swipe state',async t=>{
 const {w,doc}=setup(t),host=doc.querySelector('main');host.innerHTML=w.VilleRentalGallery.cardMarkup(p);w.VilleRentalGallery.mountCards(host,[p]);
 assert.equal(host.querySelectorAll('[data-carousel-photo]').length,3);
 host.querySelector('[data-card-step="1"]').click();assert.equal(host.querySelector('[data-card-count]').textContent,'2 / 3');
 host.querySelector('[data-carousel-photo="1"]').click();const dialog=doc.querySelector('dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-photo-count]').textContent,'2 / 3');
 dialog.querySelector('[data-viewer-step="1"]').click();assert.equal(dialog.querySelector('[data-photo-count]').textContent,'3 / 3');
 dialog.querySelector('[data-viewer-step="-1"]').click();assert.equal(dialog.querySelector('[data-photo-count]').textContent,'2 / 3');
 // Native touch scrolling produces scroll events; the counter follows the
 // snapped viewport, independent of whether a navigation button was used.
 const track=dialog.querySelector('.lightbox-track');Object.defineProperty(track,'clientWidth',{value:320});track.scrollLeft=0;track.dispatchEvent(new w.Event('scroll'));await new Promise(r=>setTimeout(r,130));assert.equal(dialog.querySelector('[data-photo-count]').textContent,'1 / 3');
 dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(dialog.querySelector('[data-photo-count]').textContent,'2 / 3');
 dialog.querySelector('[data-close-photo]').click();assert.equal(dialog.open,false);assert.equal(doc.body.classList.contains('rental-gallery-open'),false);
});
test('date search precedes the catalog introduction, and both pages expose a top shortcut',async()=>{
 const catalog=new JSDOM(await readFile(new URL('../casas-e-apartamentos.html',import.meta.url),'utf8'));
 const form=catalog.window.document.querySelector('#rental-search');assert.ok(form.compareDocumentPosition(catalog.window.document.querySelector('.rental-hero'))&4);
 assert.equal(catalog.window.document.querySelector('.rental-search-shortcut').getAttribute('href'),'#pesquisar-datas');assert.equal(catalog.window.document.querySelectorAll('#rental-search').length,1);catalog.window.close();
 const detail=new JSDOM(await readFile(new URL('../hospedagem.html',import.meta.url),'utf8'));assert.equal(detail.window.document.querySelector('.rental-search-shortcut').getAttribute('href'),'#consultar');detail.window.close();
 const home=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'));const choice=home.window.document.querySelector('.home-collection-switch');assert.match(choice.textContent,/Casas e apartamentos/);assert.equal(choice.querySelector('a[href="casas-e-apartamentos.html"]').textContent,'Casas e apartamentos');home.window.close();
});
test('showcase checks bounded real windows, omits unavailable rates and preserves the chosen guests',async t=>{
 const {w,doc}=setup(t);w.eval(showcase);w.VillePrices={load:async()=>[],heading:()=> 'Total à vista',html:c=>String(c),cashHTML:c=>String(c)};
 const windows=w.VilleRentalShowcase.periods('2026-11-23');assert.equal(windows.length,6);assert.ok(windows.every(x=>x.start>'2026-11-23'&&x.start<='2026-12-14'));assert.ok(windows.every(x=>(Date.parse(x.end)-Date.parse(x.start))/86400000===2));
 let calls=0,active=0,max=0,chosen;
 const request=async params=>{const number=++calls;max=Math.max(max,++active);assert.equal(params.action,'search');assert.equal(params.guests,4);await new Promise(r=>setTimeout(r,10));active--;return {listings:[{...p,available:number!==2,total_cents:number===2?null:65000}]}};
 w.VilleRentalShowcase.mount({host:doc.querySelector('main'),property:p,request,onChoose:value=>{chosen=value}});
 await new Promise(r=>setTimeout(r,60));assert.equal(calls,3);assert.ok(max<=2);assert.equal(doc.querySelectorAll('.rental-period-card').length,2);
 doc.querySelector('.rental-period-card button').click();assert.equal(chosen.guests,4);assert.ok(chosen.start>='2026-11-24');
 doc.querySelector('[data-showcase-more]').click();await new Promise(r=>setTimeout(r,60));assert.equal(calls,6);assert.equal(doc.querySelector('[data-showcase-more]').hidden,true);
});
