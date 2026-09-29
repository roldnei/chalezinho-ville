import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reservationFinance} from '../supabase/functions/_shared/finance/reservation-report.ts';
function fixture(){
 const events=Array.from({length:1202},(_,i)=>({sequence:i+1,source:'reservations',entity_id:'r',payload:{id:'r',status:'confirmed',total_amount:100}}));
 events.push({sequence:1203,source:'payments',entity_id:'p',payload:{id:'p',status:'paid',amount_cents:10000,provider_payment_id:'secret-provider-id'}});
 let reads=0;
 const admin={from(table){const filters={};let desc=false,limit=1000;
  const query={select(){return this},eq(k,v){filters[k]=v;return this},gt(k,v){filters.gt=v;return this},lte(k,v){filters.lte=v;return this},order(k,opts){desc=opts?.ascending===false;return this},limit(v){limit=v;return this},
   async single(){return {data:{id:'r',user_id:'guest',total_amount:100}}},async maybeSingle(){return {data:{sequence:1203}}},
   then(resolve,reject){reads++;return Promise.resolve({data:table==='incidents'?[{id:'i',description:'Dano',actor_user_id:'private'}]:events.filter(e=>e.sequence>(filters.gt||0)&&e.sequence<=(filters.lte||Infinity)).slice(0,Math.min(500,limit))}).then(resolve,reject)}};return query}};
 return {admin,readCount:()=>reads};
}
test('financial report reads past the API cap and excludes internal fields for its owner',async()=>{
 const f=fixture(),r=await reservationFinance(f.admin,'r',{userId:'guest',manager:false});
 assert.equal(r.events_count,1203);assert.equal(r.paid_cents,10000);assert.equal(r.balance_due_cents,0);
 assert.equal(r.events,undefined);assert.equal(r.payments[0].provider_payment_id,undefined);assert.equal(r.incidents[0].actor_user_id,undefined);
});
test('another guest cannot read financial history',async()=>{
 const f=fixture();await assert.rejects(reservationFinance(f.admin,'r',{userId:'other',manager:false}),/not_found/);assert.equal(f.readCount(),0);
});
test('administrator retains audit detail',async()=>{
 const f=fixture(),r=await reservationFinance(f.admin,'r',{userId:'admin',manager:true});assert.equal(r.events.length,1203);
});
