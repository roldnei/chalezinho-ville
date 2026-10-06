import {test} from 'node:test';
import assert from 'node:assert/strict';
import {persistentShowcase,showcaseCacheKey} from '../supabase/functions/_shared/showcase-cache.ts';
function database(row){
 let writes=0,claims=0;
 return {
  get writes(){return writes},get claims(){return claims},
  from(){return {
   select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})}),
   upsert:async()=>{writes++;return {error:null}},
   update:()=>({eq:()=>({lte:()=>({select:async()=>{claims++;return {data:[{cache_key:'key'}],error:null}}})})})
  }}
 };
}
const now=Date.parse('2026-10-06T01:00:00Z');
const cached=age=>({payload:{cards:[{total_cents:123456}],checked_at:new Date(now-age).toISOString()},checked_at:new Date(now-age).toISOString(),refresh_after:new Date(now-age+120000).toISOString()});
test('fresh stored showcase returns immediately without calendar or quotation calls',async()=>{
 const db=database(cached(1000));const d=await persistentShowcase({admin:db,key:'key',now,build:()=>{throw Error('must not build')}});assert.equal(d.cards[0].total_cents,123456);assert.equal(d.cache_status,'fresh');assert.equal(db.writes,0);
});
test('stale snapshot refreshes behind one atomic lease without blocking display',async()=>{
 const db=database(cached(150000));let finish,work,builds=0;const d=await persistentShowcase({admin:db,key:'key',now,background:p=>{work=p},build:()=>{builds++;return new Promise(r=>finish=r)}});
 assert.equal(d.cache_status,'refreshing');assert.equal(db.claims,1);assert.equal(builds,1);assert.equal(db.writes,0);finish({cards:[],checked_at:new Date(now).toISOString()});await work;assert.equal(db.writes,1);
});
test('snapshot over five minutes old is never shown as current price',async()=>{
 const db=database(cached(300001));const d=await persistentShowcase({admin:db,key:'key',now,background:()=>{throw Error('no stale response')},build:async()=>({cards:[{total_cents:99900}]})});assert.equal(d.cards[0].total_cents,99900);assert.equal(d.cache_status,'computed');assert.equal(db.writes,1);
});
test('expired cache cannot hide a failed pricing consultation',async()=>{
 await assert.rejects(persistentShowcase({admin:database(cached(600000)),key:'key',now,build:async()=>{throw Error('upstream_failed')}}),/upstream_failed/);
});
test('discount, pause, package price and date changes invalidate stored identity',async()=>{
 const catalog={offers:[{id:'offer',discount_bps:500,status:'active'}],products:[{id:'p',price_cents:100}]};const key=await showcaseCacheKey('2026-10-05',catalog);
 for(const mutate of [c=>c.offers[0].discount_bps=1000,c=>c.offers[0].status='paused',c=>c.products[0].price_cents=200]){const c=structuredClone(catalog);mutate(c);assert.notEqual(await showcaseCacheKey('2026-10-05',c),key)}assert.notEqual(await showcaseCacheKey('2026-10-06',catalog),key);
});
