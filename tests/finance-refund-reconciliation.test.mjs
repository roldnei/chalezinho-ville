import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReservationRefunds} from '../supabase/functions/_shared/finance/refund-reconciliation.ts';
const payment={id:'payment',provider_payment_id:'CHAR_TEST',amount_cents:10000};
function fixture(){
 const refunds=[{id:'refund',charge_id:'CHAR_TEST',state:'uncertain',requested_cents:2900,confirmed_cents:0}];
 const observations=[],commands=[];
 const admin={from:table=>table==='reservation_refunds'?{select:()=>({eq:async()=>({data:structuredClone(refunds)})})}:{insert:async row=>{observations.push(row);return {error:null}}},
  rpc:async(name,input)=>{commands.push({name,input});if(name==='confirm_reservation_refund'){refunds[0].state='confirmed';refunds[0].confirmed_cents=2900;return {error:null};}return {error:{message:'provider_receipt_not_reconciled'}}}};
 return {admin,refunds,observations,commands};
}
const charge={id:'CHAR_TEST',status:'PAID',httpStatus:200,amount:{value:10000,currency:'BRL'},summary:{total:10000,paid:10000,refunded:2900}};
test('webhook and manual reconciliation share exact cumulative refund confirmation',async()=>{
 const f=fixture();assert.equal((await reconcileReservationRefunds(f.admin,payment,charge)).confirmed,1);
 await reconcileReservationRefunds(f.admin,payment,charge);
 assert.equal(f.commands.length,1);assert.equal(f.commands[0].input.p_provider_refunded_cents,2900);
 assert.equal(f.observations.length,1);
});
test('provider status paid or cancelled without refunded amount cannot invent refund',async()=>{
 const f=fixture();const result=await reconcileReservationRefunds(f.admin,payment,{...charge,status:'CANCELED',summary:undefined});
 assert.equal(result.confirmed,0);assert.equal(f.refunds[0].state,'uncertain');
});
test('wrong amount and another charge cannot confirm the reservation refund',async()=>{
 const f=fixture();await assert.rejects(reconcileReservationRefunds(f.admin,payment,{...charge,id:'CHAR_OTHER'}),/mismatch/);
 await reconcileReservationRefunds(f.admin,payment,{...charge,summary:{...charge.summary,refunded:5000}});
 assert.equal(f.commands.length,0);
});
