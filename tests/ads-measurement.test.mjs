import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../ads-measurement.js',import.meta.url),'utf8');
function fixture({enabled=true,url='https://ville.example/chale-premium.html?utm_source=google&utm_medium=cpc&utm_campaign=cv_search_guarapari&utm_content=signature&gclid=Example_123&email=secret@example.com',gpc=false,storageError=false}={}){
 const dom=new JSDOM('<footer></footer><a id="contact" href="https://wa.me/5593991592266?text=Oi">Contato</a>',{url,runScripts:'outside-only'}),w=dom.window;
 w.CHALEZINHO_CONFIG={whatsappNumber:'5593991592266',marketing:{enabled,ga4Id:'G-EXAMPLE123',googleAdsId:'AW-123456',whatsappLabel:'abc123'}};
 if(gpc)Object.defineProperty(w.navigator,'globalPrivacyControl',{value:true});
 if(storageError)Object.defineProperty(w,'localStorage',{get(){throw Error('unavailable')}});
 w.eval(script);return {w,close:()=>w.close(),accept:()=>w.document.querySelector('#ville-marketing-consent button').click(),events:()=>Array.from(w.dataLayer||[],x=>Array.from(x))};
}
test('disabled configuration, GPC and storage restrictions cause no Google request or attribution',()=>{
 for(const options of [{enabled:false},{gpc:true},{storageError:true}]){const f=fixture(options);try{assert.equal(f.w.document.querySelector('script[src*="googletagmanager"]'),null);assert.equal(f.w.localStorage?.getItem('ville-ad-attribution-v1'),null)}catch(e){if(!options.storageError)throw e}finally{f.close()}}
});
test('consent precedes loading and only approved campaign fields survive; events omit personal data',()=>{
 const f=fixture();try{
 assert.equal(f.w.document.querySelector('script[src*="googletagmanager"]'),null);assert.equal(f.w.localStorage.getItem('ville-ad-attribution-v1'),null);
 f.accept();assert.ok(f.w.document.querySelector('script[src*="googletagmanager"]'));
 const a=f.w.VilleAds.attribution();assert.equal(a.gclid,'Example_123');assert.equal(a.campaign,'cv_search_guarapari');assert.equal(a.email,undefined);
 f.w.VilleAds.event('consultation_prepared',{property_code:'CH1',email:'secret@example.com',check_in:'2026-12-01'});
 const raw=JSON.stringify(f.events());assert.doesNotMatch(raw,/secret@example|2026-12-01|utm_source/);assert.match(raw,/CH1/);
 f.w.VilleAds.event('reservation_confirmed');assert.doesNotMatch(JSON.stringify(f.events()),/reservation_confirmed/);
 }finally{f.close()}
});
test('rejecting and withdrawing consent stop events and clear attribution',()=>{
 const f=fixture();try{
 f.w.document.querySelectorAll('#ville-marketing-consent button')[1].click();assert.equal(f.w.dataLayer,undefined);
 f.w.VilleAds.preferences();f.accept();assert.ok(f.w.VilleAds.attribution());
 f.w.VilleAds.preferences();f.w.document.querySelectorAll('#ville-marketing-consent button')[1].click();
 const n=f.events().length;f.w.VilleAds.event('whatsapp_clicked');assert.equal(f.events().length,n);assert.equal(f.w.VilleAds.attribution(),null);assert.equal(f.w.localStorage.getItem('ville-ad-attribution-v1'),null);
 }finally{f.close()}
});
test('WhatsApp keeps the quoted contents and reference; another quote gets another reference',()=>{
 const f=fixture();try{
 f.accept();const msg=f.w.VilleAds.message('Total consultado: R$ 1.500,00');assert.match(msg,/Total consultado: R\$ 1.500,00/);assert.match(msg,/VA-[A-F0-9]{12}/);
 assert.equal(f.w.VilleAds.message('Total consultado: R$ 1.500,00'),msg);assert.notEqual(f.w.VilleAds.message('Total consultado: R$ 1.600,00'),msg);
 const a=f.w.document.querySelector('#contact');a.addEventListener('click',e=>e.preventDefault());a.click();const href=a.href;a.click();assert.equal(a.href,href);assert.equal(new URL(href).searchParams.get('text').match(/Referência do anúncio/g).length,1);
 assert.equal(f.events().filter(x=>x[0]==='event'&&x[1]==='whatsapp_clicked').length,2);
 }finally{f.close()}
});
test('arbitrary UTM values are not persisted',()=>{
 const f=fixture({url:'https://ville.example/?utm_source=google&utm_medium=cpc&utm_campaign=secret@example.com&gclid=Example'});try{f.accept();assert.equal(f.w.VilleAds.attribution(),null);assert.equal(f.w.VilleAds.message('Oi'),'Oi')}finally{f.close()}
});

test('expired click attribution is cleared instead of being attached to a new inquiry',()=>{
 const f=fixture({url:'https://ville.example/chale-premium.html'});try{
 f.w.localStorage.setItem('ville-ad-attribution-v1',JSON.stringify({campaign:'cv_search_guarapari',at:Date.now()-31*86400000,gclid:'old'}));
 f.accept();assert.equal(f.w.VilleAds.attribution(),null);assert.equal(f.w.localStorage.getItem('ville-ad-attribution-v1'),null);
 }finally{f.close()}
});
