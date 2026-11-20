import test from 'node:test';
import assert from 'node:assert/strict';
import {selection,quotePrice,trustedPhoto,createPromotionService} from '../scripts/promotion-banner-service.mjs';
const s={from:'2026-12-29',to:'2027-01-02',guests:2,rate:'lowest'};
const contract={check_in:s.from,check_out:s.to,guests:2};
const rate={code:'non_refundable',selectable:true,total_amount_cents:123400,contract_snapshot:contract};
test('price uses the exact stay and selected rate; unavailable dates never keep a value',()=>{
  const p={available:true,quote:{rate_options:[rate,{...rate,code:'refundable',total_amount_cents:150000}],consulted_at:'2026-11-20T01:00:00Z'}};
  assert.equal(quotePrice(p,s).cents,123400);
  assert.equal(quotePrice(p,{...s,rate:'refundable'}).cents,150000);
  for(const bad of [{...s,guests:4},{...s,to:'2027-01-03'},{...s,from:'2026-12-28'}])assert.equal(quotePrice(p,bad).cents,null);
  assert.equal(quotePrice({...p,available:false},s).cents,null);
  assert.equal(quotePrice({available:true,quote:{rate_options:[{...rate,selectable:false}]}},s).cents,null);
});
test('invalid dates, duration, sources and photo origins are rejected',()=>{
  const params=()=>new URLSearchParams({...s,source:'site'});
  assert.equal(selection(params()).guests,2);
  for(const [key,value] of [['from','2026-02-30'],['to','2026-12-29'],['guests','0'],['rate','anything'],['source','airbnb'],['offer','bad']]){
    const p=params();p.set(key,value);assert.throws(()=>selection(p));
  }
  const origin='https://irxsaladqhbzhkoaclxy.supabase.co';
  assert.equal(trustedPhoto(origin+'/storage/v1/object/public/property-media/a.webp',origin),origin+'/storage/v1/object/public/property-media/a.webp');
  for(const u of ['http://127.0.0.1/secrets','https://evil.test/a.webp',origin+'/storage/v1/object/sign/private/x',origin+'/storage/v1/object/public/property-media/x?token=secret'])assert.equal(trustedPhoto(u,origin),null);
});
test('imported offers quote the actual package instead of substituting lodging only',async()=>{
  const calls=[],endpoint='https://irxsaladqhbzhkoaclxy.supabase.co/functions/v1/public-consultation';
  const fetchData=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>init.method==='POST'?{ok:true,rate_options:[{...rate,total_amount_cents:234500}],checked_at:'2026-11-20T01:00:00Z'}:{ok:true,properties:[{id:3,code:'CH3',gallery:[]}]}};};
  const service=createPromotionService({endpoint,environment:'production',fetchData});
  const rows=await service.prices({...s,offer:'12345678-abcd-abcd-abcd-123456789012',property:'CH3'});
  assert.equal(rows.find(p=>p.code==='CH3').cents,234500);
  assert.equal(rows.find(p=>p.code==='CH1').cents,null);
  const post=calls.find(c=>c.init.method==='POST');
  assert.equal(JSON.parse(post.init.body).offer_id,'12345678-abcd-abcd-abcd-123456789012');
  assert.equal(JSON.parse(post.init.body).property_id,3);
  assert.equal(post.init.headers['X-Chalezinho-Env'],'production');
  assert.ok(!calls.some(c=>c.url.includes('action=search')));
});
