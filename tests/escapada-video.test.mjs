import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {quoteInput} from '../api/escapada-video.js';
const scope={window:{},Intl,Date,URLSearchParams};vm.runInNewContext(await readFile(new URL('../site-prices.js',import.meta.url),'utf8'),scope);vm.runInNewContext(await readFile(new URL('../escapada-video.js',import.meta.url),'utf8'),scope);
const V=scope.window.VilleEscapadaVideo,base={offer_id:'12345678-abcd-abcd-abcd-123456789012',property_id:2,property_code:'CH2',property_name:'Ville Essenza',check_in:'2026-11-23',check_out:'2026-11-25',guests:2,nights:2,rate_code:'non_refundable',total_cents:119440,gross_cents:124200};
test('filters identify one chalet and arrival date without mixing different packages',()=>{
 const cards=[base,{...base,property_id:1,property_code:'CH1'},{...base,check_in:'2026-11-27',check_out:'2026-11-29'}];
 assert.equal(V.filter(cards,{property:'CH2',from:'2026-11-23',to:'2026-11-23'}).length,1);
 assert.equal(V.filter(cards,{property:'CH1',from:'2026-11-24'}).length,0);
 assert.match(V.fileName(base),/ch2-2026-11-23-a-2026-11-25\.mp4$/);
 assert.notEqual(V.key(base),V.key({...base,check_out:'2026-11-26'}));
});
test('automatic videos use exactly the property-specific offer photos, framing and sequence',()=>{
 const catalog={offers:[{id:base.offer_id,villegram:{photos:[{property_id:1,url:'other.jpg'},{property_id:2,url:'one.jpg',position:30,zoom:1.2},{property_id:2,url:'two.jpg'}]}}],properties:[{id:2,gallery:[{url:'not-selected.jpg'}]}]};
 const media=V.mediaFor(base,catalog);assert.equal(media.length,2);assert.equal(media[0].url,'one.jpg');assert.equal(media[0].position,30);assert.equal(media[0].zoom,1.2);assert.equal(media[1].url,'two.jpg');
 assert.equal(media[0].mode,'breathe');assert.equal(media[0].kind,'photo');
});
test('reconfirmation preserves the exact property, stay, guests, offer and rate',()=>{
 const q=new URLSearchParams(Object.fromEntries(Object.keys(base).map(k=>[k,base[k]]))),input=quoteInput(q);
 assert.equal(input.offer_id,base.offer_id);assert.equal(input.rate_code,'non_refundable');assert.equal(input.check_out,base.check_out);
 for(const [key,value] of [['check_in','2026-02-30'],['check_out','2026-11-22'],['guests','0'],['property_id','0'],['offer_id','x'],['rate_code','wrong']]){const bad=new URLSearchParams(q);bad.set(key,value);assert.throws(()=>quoteInput(bad));}
 assert.throws(()=>V.assertCard({...base,total_cents:null}));
});

test('date-based tool retains exact chalet, period and offer without importing a post',()=>{
 const url=new URL(V.dateToolURL(base),'https://pms.test');assert.equal(url.pathname,'/villemoments-escapadas.html');assert.equal(url.searchParams.get('check_in'),base.check_in);assert.equal(url.searchParams.get('check_out'),base.check_out);assert.equal(url.searchParams.get('chalet'),'CH2');assert.equal(url.searchParams.get('offer_id'),base.offer_id);
 const result=V.dateSelection({chalet:'CH2',check_in:'2026-12-14',check_out:'2026-12-16',guests:2},{properties:[{id:2,code:'CH2',name:'Ville Essenza',active:true}],offers:[{id:base.offer_id,name:'Escapada',status:'active',showcase:{enabled:true},property_ids:[2]}]});assert.equal(result.check_in,'2026-12-14');assert.equal(result.offer_id,base.offer_id);assert.equal(result.total_cents,undefined);
});
test('export overlay contains dates and prices with no WhatsApp call-to-action or button',()=>{
 const texts=[],ctx={canvas:{width:720,height:1280},save(){},restore(){},scale(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}}),measureText:t=>({width:t.length*8}),fillText:t=>texts.push(t),beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 V.drawOverlay(ctx,base);assert.ok(texts.includes(base.property_name));assert.ok(texts.includes('R$127,80'));assert.ok(texts.includes('10x'));assert.ok(!texts.some(t=>t.includes('1.194,40')));assert.ok(!texts.some(t=>/WhatsApp|Quero estes dias/i.test(t)));
});

test('ten installments include seven percent once, for every chalet, without altering the quote',()=>{
 for(const property_code of ['CH1','CH2','CH3']){
  const card={...base,property_code,total_cents:163000};
  assert.equal(V.installment(card.total_cents).value_cents,17441);
  assert.equal(V.installmentText(card.total_cents),'10xR$174,41');
  assert.match(V.installmentHTML(card.total_cents),/>10x<.*>R\$174,41</);
  assert.equal(V.installment(card.total_cents).total_cents,174410);
  assert.equal(V.installmentText(card.total_cents),'10xR$174,41');
  assert.equal(card.total_cents,163000);
 }
 assert.equal(V.installmentText(119440),'10xR$127,80');
 assert.equal(V.installmentText(118000),'10xR$126,26');
});
test('canvas preview and export show a small 10x adjoining a larger installment, with comparable crossed price',()=>{
 const draws=[],ctx={canvas:{width:720,height:1280},save(){},restore(){},scale(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}}),measureText:t=>({width:t.length*8}),fillText(t,x,y){draws.push({text:t,x,y,font:this.font})},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const card={...base,total_cents:163000,gross_cents:180000};V.drawOverlay(ctx,card);
 const count=draws.find(d=>d.text==='10x'),value=draws.find(d=>d.text==='R$174,41');
 assert.ok(count&&value);assert.equal(count.y,value.y);assert.ok(value.x>count.x);
 assert.ok(parseInt(count.font.match(/(\d+)px/)[1])<parseInt(value.font.match(/(\d+)px/)[1]));
 assert.ok(draws.some(d=>d.text==='10xR$192,60'));assert.ok(!draws.some(d=>d.text==='R$ 1.630,00'));
 assert.equal(card.total_cents,163000);
});
