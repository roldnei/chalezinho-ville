import {test} from 'node:test';import assert from 'node:assert/strict';
import {costAnalytics} from '../costs-analytics-model.js';
const properties=[{id:1,name:'Signature'},{id:2,name:'Essenza'}];
const row=(id,property_id,amount_cents,competence,extra={})=>({id,property_id,amount_cents,competence,archived_at:null,paid_on:null,fiscal_status:'operational',exclusion_cents:0,...extra});
const rows=[row('a',1,10001,'2026-01-01',{paid_on:'2026-02-03'}),row('b',2,20002,'2026-10-01'),row('c',null,30003,'2026-10-01'),row('d',1,5000,'2025-10-01'),row('e',1,999999,'2026-10-01',{archived_at:'2026-10-16'}),row('f',9,40004,'2026-10-01')];
test('month/year/overall sums reconcile in integer cents, including shared and unknown properties',()=>{
 const a=costAnalytics(rows,properties,{month:'2026-10'});assert.equal(a.monthTotal,90009);assert.equal(a.yearTotal,100010);assert.equal(a.generalYearTotal,100010);assert.equal(a.months.length,12);assert.equal(a.months[1].value,0);assert.equal(a.months.reduce((s,r)=>s+r.value,0),a.yearTotal);assert.equal(a.byProperty.reduce((s,r)=>s+r.value,0),a.comparisonTotal);assert.equal(a.byProperty.find(r=>r.key==='9').label,'Imóvel #9');assert.equal(a.byProperty.find(r=>r.key==='shared').value,30003);assert.equal(a.years[0].value,5000);
});
test('property selection affects its trend while overall totals and comparison stay complete',()=>{
 const a=costAnalytics(rows,properties,{month:'2026-10',property:'1',period:'month'});assert.equal(a.monthTotal,0);assert.equal(a.yearTotal,10001);assert.equal(a.generalYearTotal,100010);assert.equal(a.comparisonTotal,90009);assert.equal(a.byProperty.find(r=>r.key==='1').value,0);
 const b=costAnalytics(rows,properties,{month:'2026-10',property:'shared'});assert.equal(b.yearTotal,30003);
});
test('payment excludes unpaid expenses; fiscal plots only confirmed exclusion amounts',()=>{
 const a=costAnalytics(rows,properties,{month:'2026-02',basis:'paid_on'});assert.equal(a.monthTotal,10001);assert.equal(a.yearTotal,10001);
 const fiscal=[row('a',1,50000,'2026-01-01',{fiscal_month:'2026-09-01',fiscal_status:'confirmed',exclusion_cents:12000}),row('b',2,80000,'2026-01-01',{fiscal_month:'2026-09-01',fiscal_status:'review',exclusion_cents:20000})];
 const b=costAnalytics(fiscal,properties,{month:'2026-09',basis:'fiscal_month'});assert.equal(b.yearTotal,12000);assert.equal(b.fiscal,true);
});
test('empty periods preserve twelve zero months and selected year',()=>{
 const a=costAnalytics([],properties,{month:'2027-03'});assert.equal(a.yearTotal,0);assert.equal(a.months.length,12);assert.deepEqual(a.years,[{key:'2027',value:0}]);assert.equal(a.byProperty.length,3);
});
