import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {loadPropertyPriceLabs, normalizeOwnPricing, resolvePropertyPricing} from '../supabase/functions/_shared/property-pricing.ts';

const start = '2026-11-17', end = '2026-11-19';
const now = new Date('2026-11-05T12:00:00-03:00');
const integration = {active:true, provider:'pricelabs', external_listing_id:'42', pms:'airbnb'};
const table = {weekdays_cents:[19000,19000,23137,24659,19000,26000,27000], periods:[]};
const own = normalizeOwnPricing(table);
const empty = {ok:true,listings:new Map()};
const prices = async days => loadPropertyPriceLabs([integration],start,end,async () => [{id:42,pms:'airbnb',currency:'BRL',data:days}]);
const complete = [{date:start,user_price:'301.125',min_stay:'3'},{date:'2026-11-18',price:'350.29'},{date:end,price:1}];
const resolve = (local, link, remote) => resolvePropertyPricing(local,link,remote,start,end,now);

test('no PriceLabs: own weekdays, inclusive exceptions, integer cents and exclusive checkout', async () => {
  const notCalled = await loadPropertyPriceLabs([],start,end,async () => assert.fail('PriceLabs must not be called'));
  const tableWithOverride = normalizeOwnPricing({...table,periods:[{start:'2026-11-18',end,cents:25768}]});
  const quote = resolve(tableWithOverride,null,notCalled);
  assert.equal(quote.source,'own');
  assert.equal(quote.totalCents,48905);
  assert.deepEqual(quote.days.map(day => [day.date,day.price_cents]),[[start,23137],['2026-11-18',25768]]);
  assert.equal(resolve(null,null,empty).totalCents,null);
});

test('connected PriceLabs: mapped external nights, exact half-cent rounding and explicit PMS overrides', async () => {
  const feed = await prices(complete);
  const dynamic = resolve(own,integration,feed);
  assert.equal(dynamic.totalCents,65142);
  assert.equal(dynamic.minStay,3);
  assert.equal(dynamic.source,'pricelabs');
  const custom = normalizeOwnPricing({...table,periods:[{start,end:start,cents:22467}]});
  const mixed = resolve(custom,integration,feed);
  assert.equal(mixed.source,'mixed');
  assert.equal(mixed.totalCents,57496);
  assert.deepEqual(mixed.days.map(day=>day.source),['own','pricelabs']);
  const manual = resolve({...custom,mode:'own'},integration,feed);
  assert.equal(manual.totalCents,47126);
  assert.equal(manual.minStay,1);
  assert.equal(resolve(null,integration,feed).source,'pricelabs');
});

test('partial, ambiguous, invalid or failed PriceLabs response falls back for the entire stay', async () => {
  for (const days of [[complete[0]], [complete[0],{date:'2026-11-18',price:-1}], [...complete,complete[0]]]) {
    const remote = await prices(days);
    const result = resolve(own,integration,remote);
    assert.equal(result.totalCents,47796);
    assert.equal(result.fallbackReason,'pricelabs_incomplete');
    assert.equal(resolve(null,integration,remote).totalCents,null);
  }
  const failed = await loadPropertyPriceLabs([integration],start,end,async () => {throw Error('timeout');});
  assert.equal(resolve(own,integration,failed).fallbackReason,'pricelabs_unavailable');
  assert.equal(resolve(own,{...integration,pms:'booking'},await prices(complete)).totalCents,47796);
});

test('discounts use the best eligible rule on own prices, without changing the previous quote', async () => {
  const configured = normalizeOwnPricing({...table,discounts:[{kind:'advance',days:10,bps:1250},{kind:'last_minute',days:12,bps:1000}]});
  const previous = resolve(configured,null,empty);
  assert.equal(previous.discountBps,1250);
  assert.equal(previous.totalCents,41822);
  const revised = normalizeOwnPricing({...table,weekdays_cents:Array(7).fill(25000)});
  assert.equal(resolve(revised,null,empty).totalCents,50000);
  assert.equal(previous.totalCents,41822);
  assert.equal(resolve(configured,integration,await prices(complete)).discountBps,0);
});

test('database rejects active inserts or reactivation without own prices and validates direct writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema private;
      create table public.properties(id bigint primary key, active boolean not null);
      insert into properties values (1,true), (2,false);`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261105224027_property_own_pricing.sql',import.meta.url),'utf8'));
    await assert.rejects(db.exec('insert into properties (id,active) values (3,true)'),/own_pricing_required/);
    await assert.rejects(db.exec('update properties set active=true where id=2'),/own_pricing_required/);
    await db.exec('update properties set active=true where id=1');
    await db.query('update properties set own_pricing=$1,active=true where id=2',[JSON.stringify(own)]);
    assert.deepEqual((await db.query('select own_pricing from properties where id=2')).rows[0].own_pricing,own);
    await assert.rejects(db.exec('update properties set own_pricing=null where id=2'),/own_pricing_required/);
    for (const invalid of [{...own,weekdays_cents:[...own.weekdays_cents.slice(0,6),1.5]},
      {...own,discounts:[{kind:'weekly',days:6,bps:1500}]},
      {...own,periods:[{start,end,cents:100},{start:end,end,cents:100}]}]) {
      assert.throws(()=>normalizeOwnPricing(invalid),/pricing/);
      await assert.rejects(db.query('update properties set own_pricing=$1 where id=2',[JSON.stringify(invalid)]),/pricing/);
    }
  } finally { await db.close(); }
});

test('PMS calendar edits an interval by weekday, preserves other nights and calls the block API', async () => {
  const ui = new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});
  ui.window.eval(await readFile(new URL('../property-pricing-calendar.js',import.meta.url),'utf8'));
  const requests = [], blockCalls = [];
  const host = ui.window.document.getElementById('host');
  let saved = {...own, periods:[{start:'2026-11-16',end:'2026-11-20',cents:27000}]};
  ui.window.prompt = () => 'Uso do proprietário';
  ui.window.VillePropertyPricing.mount(host,{
    property:{id:6,name:'QA'}, today:'2026-11-17', esc:String, brl:String, formatDate:String,
    back:()=>{}, availability:()=>{},
    api:async (_,body)=>{
      requests.push(body);
      if (body.operation==='save_pricing') saved=JSON.parse(JSON.stringify(body.own_pricing));
      return {property:{id:6,updated_at:'v1',own_pricing:saved},events:[],days:[{date:start,price_cents:27000,source:'own'},{date:'2026-11-19',price_cents:27000,source:'own'}]};
    },block:async body=>blockCalls.push(JSON.parse(JSON.stringify(body))),
  });
  const tick = () => new Promise(resolve=>setImmediate(resolve));
  await tick();
  host.querySelector('[data-day="2026-11-17"]').click();
  host.querySelector('[data-day="2026-11-19"]').click();
  for (const box of host.querySelectorAll('[name=weekday]')) box.checked=box.value==='3';
  const form=host.querySelector('[data-selection]');
  form.elements.value.value='215,39';
  form.requestSubmit();
  await tick();
  assert.equal(requests.find(r=>r.operation==='save_pricing').updated_at,'v1');
  assert.deepEqual(saved.periods,[
    {start:'2026-11-16',end:'2026-11-17',cents:27000},
    {start:'2026-11-18',end:'2026-11-18',cents:21539},
    {start:'2026-11-19',end:'2026-11-20',cents:27000},
  ]);
  host.querySelector('[data-block]').click();
  await tick();
  assert.deepEqual(blockCalls,[{operation:'create',property_id:6,start_date:start,end_date:'2026-11-20',reason:'Uso do proprietário',block_type:'owner_use'}]);
  ui.window.close();
});
