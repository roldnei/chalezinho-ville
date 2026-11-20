import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const offer='357cca8d-b0c2-4d68-ac72-d21ac7164e43',tick=()=>new Promise(r=>setTimeout(r,15));
async function page({query='',defer=false}={}){
 const dom=new JSDOM(await readFile(new URL('../villemoments-escapadas.html',import.meta.url),'utf8'),{url:'https://pms.test/villemoments-escapadas.html'+query,runScripts:'outside-only'}),w=dom.window,calls=[],previews=[],exports=[];let pending;
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://pms.test',environment:'production'};w.AbortSignal=AbortSignal;w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})};
 const catalog={properties:[{id:2,code:'CH2',name:'Ville Essenza',active:true,cover_image:'assets/essenza.webp',gallery:[{url:'assets/essenza.webp'}]},{id:3,code:'CH3',name:'Ville Amore',active:true,cover_image:'assets/amore.webp',gallery:[{url:'assets/amore.webp'}]}],offers:[{id:offer,name:'Escapada',status:'active',showcase:{enabled:true},property_ids:[2,3]}]};
 w.fetch=async(url,opts={})=>{calls.push({url,opts});if(String(url).includes('/villegram-content'))return {ok:true,json:async()=>({ok:true,...catalog,offers:catalog.offers.map(({showcase,...o})=>o)})};if(String(url).includes('action=stay_offers'))return {ok:true,json:async()=>({ok:true,offers:catalog.offers})};
 const q=new URL(url,'https://pms.test').searchParams,p=catalog.properties.find(p=>p.id===Number(q.get('property_id')));const data={ok:true,card:{property_id:p.id,property_code:p.code,property_name:p.name,offer_id:q.get('offer_id'),check_in:q.get('check_in'),check_out:q.get('check_out'),guests:Number(q.get('guests')),nights:(Date.parse(q.get('check_out'))-Date.parse(q.get('check_in')))/86400000,rate_code:q.get('rate_code'),total_cents:119440},checked_at:new Date().toISOString()};if(defer)return new Promise(resolve=>pending=()=>resolve({ok:true,json:async()=>data}));return {ok:true,json:async()=>data};};
 w.eval(await readFile(new URL('../escapada-video.js',import.meta.url),'utf8'));
 w.VilleEscapadaVideo.preview=async(canvas,card,media)=>{previews.push({card,media});return {destroy(){},pause(){},play(){}};};w.VilleEscapadaVideo.exportVideo=async(card,media)=>{exports.push({card,media});return new w.Blob(['mp4']);};w.VilleEscapadaVideo.download=()=>{};
 w.eval(await readFile(new URL('../escapadas-datas.js',import.meta.url),'utf8'));await tick();return {dom,w,calls,previews,exports,resolve:()=>pending?.(),$:s=>w.document.querySelector(s)};
}
test('loads exact dates directly, outside the automatic showcase window, without a post composer or mutations',async()=>{
 const p=await page({query:'?chalet=CH2&check_in=2026-12-14&check_out=2026-12-16&guests=2'});
 assert.equal(p.$('#date-result').hidden,false);assert.equal(p.$('#date-price').textContent,'10xR$127,80');assert.equal(p.$('.escape-installment-count').textContent,'10x');assert.equal(p.exports.length,0);assert.equal(p.$('#date-download').disabled,false);assert.equal(p.previews[0].card.check_in,'2026-12-14');assert.equal(p.previews[0].card.check_out,'2026-12-16');assert.equal(p.previews[0].card.property_code,'CH2');assert.equal(p.previews[0].media[0].url,'assets/essenza.webp');assert.equal(p.$('#vg-post-form'),null);
 const quote=new URL(p.calls.find(c=>c.url.startsWith('/api/escapada-video')).url,'https://pms.test');assert.equal(quote.searchParams.get('offer_id'),offer);
 p.$('#date-download').click();await tick();assert.equal(p.exports.length,1);assert.ok(p.calls.every(c=>!c.opts.body||JSON.parse(c.opts.body).operation==='admin_list'));p.dom.window.close();
});
test('changing dates clears the old quote and a late result cannot restore it',async()=>{
 const p=await page({query:'?chalet=CH2&check_in=2026-12-14&check_out=2026-12-16&guests=2',defer:true});p.$('#date-in').value='2026-12-15';p.$('#date-in').dispatchEvent(new p.w.Event('change'));p.resolve();await tick();assert.equal(p.previews.length,0);assert.equal(p.$('#date-result').hidden,true);assert.equal(p.$('#date-download').disabled,true);p.dom.window.close();
});
test('switching chalet requires loading its own dates and price',async()=>{
 const p=await page({query:'?chalet=CH2&check_in=2026-12-14&check_out=2026-12-16&guests=2'});p.$('#date-chalet').value='CH3';p.$('#date-chalet').dispatchEvent(new p.w.Event('change'));assert.equal(p.$('#date-download').disabled,true);p.$('#date-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await tick();assert.equal(p.previews.at(-1).card.property_code,'CH3');assert.equal(p.previews.at(-1).media[0].url,'assets/amore.webp');p.dom.window.close();
});
