import {test} from 'node:test';
import assert from 'node:assert/strict';
import {experiencePaymentEntries} from '../supabase/functions/_shared/finance/experience-payment-entries.ts';

test('included discounted and full-price extras bind exactly to their persisted order items',()=>{
 const rows=experiencePaymentEntries('r','p',[
  {id:'romance',unit_price_cents:95,quantity:1,product_name_snapshot:'Incluído'},
  {id:'coffee',unit_price_cents:500,quantity:2,product_name_snapshot:'Avulso'}
 ],1095);
 assert.deepEqual(rows.map(r=>[r.experience_order_item_id,r.amount_cents]),[['romance',95],['coffee',1000]]);
 assert.ok(rows.every(r=>r.payment_id==='p'&&r.reservation_id==='r'));
});
test('unbound, mismatched or fractional original allocations fail before provider charge',()=>{
 for(const items of [[{unit_price_cents:95,quantity:1}],[{id:'x',unit_price_cents:100,quantity:1}],[{id:'x',unit_price_cents:95.5,quantity:1}]])
  assert.throws(()=>experiencePaymentEntries('r','p',items,95),/allocation_invalid/);
 assert.deepEqual(experiencePaymentEntries('r','p',[],0),[]);
});
