import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const properties=[{id:1,code:'CH1',name:'Ville Signature',active:true,cover_image:'https://photos.example/signature.webp',tagline:'Piscina aquecida privativa'},{id:2,code:'CH2',name:'Ville Essenza',active:true,cover_image:'https://photos.example/essenza.webp'},{id:3,code:'CH3',name:'Ville Amore',active:true,cover_image:'https://photos.example/amore.webp'}];
const publication={id:'4069a585-7cc6-48ad-9263-567358a45c0c',type:'property',property_id:1,title:'Signature',caption:'Original preservado',cta:'property',media:[{kind:'photo',url:'assets/ch1-capa-casal-spa.webp'}],cover_index:0};
test('late showcase projection cannot remove the opening chalet Trip',async()=>{
 const p=await page({query:'?view=moments'});
 try{
  p.w.VillegramContent.setOffers([],[],properties.map(({active,...property})=>property));
  p.w.Villegram.close();p.w.VillegramContent.enter();
  assert.ok(p.w.document.querySelector('#villegram.vg-intro'));
  assert.equal(p.w.document.querySelectorAll('[data-intro-scene]').length,3);
  assert.match(p.w.document.querySelector('.vg-progress').textContent,/1 de/);
 }finally{p.close()}
});
async function page({query='?view=moments&intro=1',reduced=false,catalog=properties,saved=null,publications=[publication]}={}){
 const dom=new JSDOM('<header><nav></nav></header><main><div class="hero"></div></main>',{url:'https://preview.local/index.html'+query,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],intervals=new Map(),timeouts=new Map();let now=0;
 Object.defineProperty(w.performance,'now',{value:()=>now});w.setInterval=(fn,ms)=>{intervals.set(ms,fn);return ms};w.clearInterval=id=>intervals.delete(id);w.setTimeout=(fn,ms)=>{timeouts.set(ms,fn);return ms};w.clearTimeout=id=>timeouts.delete(id);
 if(saved)w.sessionStorage.setItem('villegram-position',JSON.stringify(saved));
 w.matchMedia=q=>({matches:q.includes('reduced-motion')?reduced:true,addEventListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLMediaElement.prototype.pause=function(){};
 w.CHALEZINHO_CONFIG={environment:'development',releaseProfile:'whatsapp',supabaseUrl:'https://pxfqmnhqodqyaaqeyjgr.supabase.co',bookingEngine:'https://dev/public-consultation',features:{social:true}};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
 const viewed=[];w.VillegramSignals={begin(p){viewed.push(p?.id||null)},active(){},end(){},flush(){},mark(){},complete(){},declared(){return {}},interest(){return {}}};
 w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,properties:catalog,publications,products:[],offers:[],max_offers:3})}};
 const style=w.document.createElement('style');style.textContent=await source('villegram.css');w.document.head.append(style);
 for(const file of ['villegram.js','villegram-content.js'])w.eval(await source(file));
 await new Promise(resolve=>setTimeout(resolve,25));
 return {w,calls,timeouts,viewed,advance(ms){now+=ms;intervals.get(100)?.()},close(){w.Villegram.close();w.close()}};
}
test('first discovery Trip presents three distinct facility photos and each chalet destination',async()=>{
 const p=await page(),d=p.w.document;
 try{
  assert.ok(d.querySelector('#villegram.vg-intro'));assert.match(d.querySelector('.vg-story').textContent,/3 CHALÉS.*Ville Signature.*Piscina aquecida privativa/);
  const photos=[...d.querySelectorAll('.vg-scene img')],paths=photos.map(img=>img.getAttribute('src')||img.dataset.src);
  assert.equal(photos.length,3);assert.equal(new Set(paths).size,3);
  assert.deepEqual(paths,properties.map(p=>p.cover_image));
  const destinations=['chale-premium.html','chale-com-hidro.html','chale-romantico.html'];
  for(let i=0;i<3;i++){
   d.querySelector(`[data-intro-scene="${i}"]`).click();
   assert.equal(d.querySelector('[data-intro-name]').textContent,properties[i].name);
   assert.equal(d.querySelector('.vg-scene.is-visible img').getAttribute('src'),paths[i]);
   const link=d.querySelector('[data-intro-link]:not([hidden])');assert.equal(link.getAttribute('href'),destinations[i]);assert.equal(link.textContent,'Conhecer '+properties[i].name);
   assert.equal(d.querySelectorAll('[data-intro-link]:not([hidden])').length,1);
   assert.equal(d.querySelector('[data-action=pause]').getAttribute('aria-label'),'Continuar apresentação');
  }
  assert.equal(d.querySelector('.vg-primary').classList.contains('vg-primary'),true);
  assert.equal(d.querySelector('[data-action=like]').hidden,true);
  assert.equal(p.calls.some(c=>c.body.action==='villegram'||['like','comment'].includes(c.body.operation)),false);assert.ok(p.calls.filter(c=>c.body.operation==='social').every(c=>c.body.publication_id===publication.id));
  assert.equal(p.calls[0].body.operation,'public_feed');
 }finally{p.close()}
});
test('automatic scene changes synchronize names and links, pause freezes them, and navigation hint is retained',async()=>{
 const p=await page(),d=p.w.document;
 try{
  assert.ok(d.querySelector('.vg-swipe-hint'));assert.match(d.querySelector('.vg-swipe-hint').textContent,/Arraste para cima/);
  p.advance(6500);assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Essenza');assert.equal(d.querySelector('[data-intro-link]:not([hidden])').getAttribute('href'),'chale-com-hidro.html');
  d.querySelector('[data-intro-link]:not([hidden])').focus();p.advance(6500);assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Essenza');
  d.querySelector('[data-action=pause]').click();p.advance(6500);assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Amore');
  p.w.Villegram.remember();const saved=JSON.parse(p.w.sessionStorage.getItem('villegram-position'));assert.equal(saved.id,'intro:chalets');assert.equal(saved.photo,2);
  d.querySelector('[data-action=next]').click();p.timeouts.get(110)?.();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(d.querySelector('#villegram').classList.contains('vg-intro'),false);assert.match(d.querySelector('.vg-story').textContent,/Original preservado/);
 }finally{p.close()}
});
test('reduced motion keeps all three manual choices, while shared publications and following retain their entry',async()=>{
 for(const options of [{reduced:true},{query:'?publication='+publication.id},{query:'?feed=following'},{catalog:properties.filter(x=>x.code!=='CH2')}]){
  const p=await page(options),d=p.w.document;
  try{
   if(options.query)assert.equal(d.querySelector('#villegram').classList.contains('vg-intro'),false);
   else if(options.reduced){p.advance(6500);assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Signature');d.querySelector('[data-intro-scene="2"]').click();assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Amore')}
   else{assert.equal(d.querySelectorAll('[data-intro-scene]').length,2);assert.doesNotMatch(d.querySelector('.vg-intro-choices').textContent,/Essenza/)}
  }finally{p.close()}
 }
});
test('reload restores the selected intro chalet without importing a scene from another Trip',async()=>{
 for(const saved of [{id:'intro:chalets',photo:2},{id:publication.id,photo:7}]){
  const p=await page({saved});
  try{assert.equal(p.w.document.querySelector('[data-intro-name]').textContent,saved.id==='intro:chalets'?'Ville Amore':'Ville Signature');assert.equal(p.w.document.querySelector('[data-intro-link]:not([hidden])').getAttribute('href'),saved.id==='intro:chalets'?'chale-romantico.html':'chale-premium.html')}
  finally{p.close()}
 }
});
test('intro uses each real chalet publication for social reads and freezes its identity before interaction',async()=>{
 const publications=properties.map(property=>({...publication,id:publication.id.slice(0,-2)+String(property.id).padStart(2,'0'),property_id:property.id}));
 const p=await page({publications}),d=p.w.document;
 try{
  for(let i=0;i<3;i++){
   d.querySelector(`[data-intro-scene="${i}"]`).click();await new Promise(resolve=>setTimeout(resolve,0));
   assert.equal(d.querySelector('[data-action=like]').hidden,false);assert.equal(d.querySelector('[data-action=comments]').hidden,false);
   assert.equal(p.calls.filter(c=>c.body.operation==='social').at(-1).body.publication_id,publications[i].id);
   assert.equal(p.viewed.at(-1),publications[i].id);
  }
  d.querySelector('[data-intro-scene="0"]').click();await new Promise(resolve=>setTimeout(resolve,0));
  d.querySelector('[data-action=pause]').click();d.querySelector('[data-action=like]').focus();p.advance(6500);
  assert.equal(d.querySelector('[data-intro-name]').textContent,'Ville Signature');
  p.w.Villegram.remember();assert.equal(new URL(p.w.location.href).searchParams.has('publication'),false);
  assert.equal(p.calls.some(c=>['like','comment','start_payment'].includes(c.body.operation||c.body.action)),false);
 }finally{p.close()}
});
