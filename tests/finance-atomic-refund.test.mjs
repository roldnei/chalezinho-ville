import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {creditDatabase} from './support/finance-credit-db.mjs';
let db;const actor=randomUUID();
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
before(async()=>{db=await creditDatabase();
 await db.exec(await readFile(new URL('../supabase/migrations/20260929041943_finance_atomic_refund_preparation.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[actor]);await db.query("insert into profiles values($1,'admin')",[actor]);});
after(async()=>db?.close());
async function fixture(){
 const r=await one("insert into reservations(status) values('cancelled') returning id");
 const p=await one("insert into payments(reservation_id,amount_cents,status,provider,provider_payment_id) values($1,10000,'paid','pagbank_sandbox','CHAR_A') returning id",[r.id]);
 return {reservation_id:r.id,kind:'voluntary_refund',operation_key:randomUUID(),refund_due_cents:3000,
   reason:'Devolução por acordo',requested_at:new Date().toISOString(),calculation:{allocations:[{payment_id:p.id,charge_id:'CHAR_A',refund_cents:3000}]}};
}
const prepare=c=>one('select (prepare_reservation_refund_case($1,$2)).*',[actor,c]);
test('voluntary refund for cancelled stay needs no cancellation acceptance and is idempotent',async()=>{
 const c=await fixture(),a=await prepare(c),b=await prepare(c);assert.equal(a.id,b.id);
 assert.equal((await one('select count(*)::int n from reservation_refunds where cancellation_id=$1',[a.id])).n,1);
 await assert.rejects(prepare({...c,refund_due_cents:4000}),/idempotency_conflict/);
});
test('second invalid allocation rolls back case and first allocation',async()=>{
 const c=await fixture();c.refund_due_cents=4000;c.calculation.allocations.push({payment_id:randomUUID(),charge_id:'CHAR_BAD',refund_cents:1000});
 await assert.rejects(prepare(c),/refund_payment_mismatch/);
 assert.equal((await one('select count(*)::int n from reservation_cancellations where reservation_id=$1',[c.reservation_id])).n,0);
 c.calculation.allocations.pop();c.refund_due_cents=3000;assert.ok((await prepare(c)).id);
});
test('duplicate payment allocations and mismatched totals cannot reserve money',async()=>{
 const c=await fixture();await assert.rejects(prepare({...c,refund_due_cents:3001}),/allocation_mismatch/);
 c.calculation.allocations.push({...c.calculation.allocations[0]});await assert.rejects(prepare(c),/duplicate_allocation/);
});
test('guest role cannot invoke refund preparation',async()=>{
 const c=await fixture();await db.exec('set role authenticated');
 try{await assert.rejects(prepare(c),/permission denied/)}finally{await db.exec('reset role')}
});
