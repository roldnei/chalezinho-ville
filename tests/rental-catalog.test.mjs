import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {listingSettings,isPublicRental,publicRental,rentalSearchInput,rentalResult} from '../supabase/functions/_shared/rental-catalog.ts';
import {mapListingPrices} from '../scripts/listing-prices.mjs';
const seed=JSON.parse(await readFile(new URL('../docs/catalog/apartments.json',import.meta.url),'utf8'));
const property={...seed[1],id:5,active:true,gallery:[{url:'assets/a.webp',alt:'test'}],features:{...seed[1].features,private_token:'not-public',payment_terms:{secret:123}}};
test('public catalog includes only explicitly published active homes and whitelists metadata',()=>{
 assert.equal(isPublicRental(property),true);
 for(const extra of [{active:false},{property_type:'chalet'},{features:{public_listing:{published:false}}}])assert.equal(isPublicRental({...property,...extra}),false);
 const row=publicRental(property);assert.equal(row.max_guests,6);assert.equal(row.listing.air_conditioning,false);assert.deepEqual(row.gallery,['assets/a.webp']);
 assert.ok(!JSON.stringify(row).includes('private_token'));assert.ok(!JSON.stringify(row).includes('payment_terms'));assert.ok(!('features' in row));
});
test('listing validates complete publishable facts and never accepts arbitrary nested keys',()=>{
 assert.throws(()=>listingSettings({...seed[0].features.public_listing,bedrooms:-1}));
 assert.throws(()=>listingSettings({...seed[0].features.public_listing,location_label:''}));
 assert.throws(()=>listingSettings({...seed[0].features.public_listing,parking:'yes'}));
 assert.ok(!('token' in listingSettings({...seed[0].features.public_listing,token:'private'})));
});
test('dates use real civil dates, bounded nights and integer guests',()=>{
 assert.deepEqual(rentalSearchInput({start:'2026-12-01',end:'2026-12-03',guests:6}),{start:'2026-12-01',end:'2026-12-03',guests:6});
 for(const args of [{start:'2026-02-30',end:'2026-03-02',guests:2},{start:'2026-12-01',end:'2026-12-01',guests:2},{start:'2026-12-01',end:'2027-06-01',guests:2},{start:'2026-12-01',end:'2026-12-02',guests:2.5}])assert.throws(()=>rentalSearchInput(args));
});
test('rate mapping uses exact listing identity and never positional fallback or partial calendars',()=>{
 const listings=[{id:'a',pms:'airbnb',name:'A'},{id:'b',pms:'airbnb',name:'B'}],rows=[{id:'b',data:[{date:'2026-12-01',price:200,min_stay:2}]},{id:'a',data:[{date:'2026-12-01',price:100,min_stay:1}]}];
 assert.deepEqual(mapListingPrices(listings,rows,'2026-12-01','2026-12-02').map(x=>x.total_price),[100,200]);
 assert.equal(mapListingPrices(listings,rows.slice(0,1),'2026-12-01','2026-12-02')[0].total_price,null);
 assert.deepEqual(mapListingPrices(listings,rows,'2026-12-01','2026-12-03').map(x=>x.days),[[],[]]);
});
test('occupied or failed calendars never expose a bookable price; quote rounds in cents',()=>{
 assert.equal(rentalResult({}, {available:true,from_stay_price:123.45}).total_cents,12345);
 assert.equal(rentalResult({}, {available:false,from_stay_price:123,unavailable_reason:'occupied'}).total_cents,null);
 assert.equal(rentalResult({}, {available:true,from_stay_price:null}).available,false);
 assert.equal(rentalResult({},undefined).available,false);
});
test('catalog and individual page render WhatsApp consultation with property, dates and guests, without writes',async()=>{
 for(const page of ['catalog','detail']){
  const filename=page==='catalog'?'casas-e-apartamentos.html':'hospedagem.html';
  const dom=new JSDOM(await readFile(new URL('../'+filename,import.meta.url),'utf8'),{url:'https://example.test/'+(page==='detail'?'imoveis/'+property.slug:filename),runScripts:'outside-only'});
  const {window:w}=dom;w.CHALEZINHO_CONFIG={supabaseUrl:'https://test.supabase.co',whatsappNumber:'5593991592266'};
  w.VillePrices={load:async()=>[],terms:()=>null,heading:()=>'',html:c=>'R$ '+c/100,cashHTML:c=>'Total à vista: R$ '+c/100};
  const requests=[];w.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({ok:true,listings:[new URL(url).searchParams.get('action')==='catalog'?publicRental(property):{...publicRental(property),available:true,total_cents:65000}]})}};
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.IntersectionObserver=class{observe(){}disconnect(){}};
  w.eval(await readFile(new URL('../rental-gallery.js',import.meta.url),'utf8'));w.eval(await readFile(new URL('../rental-showcase.js',import.meta.url),'utf8'));
  w.eval(await readFile(new URL('../rentals.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(w.document.body.textContent,/Apartamento Praia do Morro/);
  const form=w.document.querySelector('form');form.elements.start.value='2026-12-04';form.elements.end.value='2026-12-06';form.elements.guests.value='6';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,30));
  const link=w.document.querySelector('#rental-list a[href^="https://wa.me/"]'),message=new URL(link.href).searchParams.get('text');
  assert.match(message,/Praia do Morro/);assert.match(message,/04\/12\/2026/);assert.match(message,/Hóspedes: 6/);assert.match(message,/650,00/);
  assert.ok(requests.every(x=>!x.options?.method||x.options.method==='GET'));
  form.elements.start.value='2026-12-07';form.elements.end.value='2026-12-09';form.elements.start.dispatchEvent(new w.Event('input',{bubbles:true}));
  const nextMessage=new URL(w.document.querySelector('#rental-list a[href^=\"https://wa.me/\"]').href).searchParams.get('text');
  assert.match(nextMessage,/07\/12\/2026/);assert.ok(!nextMessage.includes('Valor consultado'));assert.ok(!w.document.querySelector('.rental-price'));
  dom.window.close();
 }
});
