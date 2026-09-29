import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {creditDatabase} from './support/finance-credit-db.mjs';
let db;const actor=randomUUID();
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
before(async()=>{db=await creditDatabase();
 for(const name of ['20260928174500_refund_provider_observations.sql','20260929041943_finance_atomic_refund_preparation.sql','20260929052454_finance_retry_transient_refunds.sql','20260929053203_finance_provider_reconciliation_gate.sql'])
  await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[actor]);await db.query("insert into profiles values($1,'admin')",[actor]);});
after(async()=>db?.close());
async function fixture(){
 const r=await one('insert into reservations default values returning id');
 const g=await one("insert into guarantees(reservation_id,provider,status,amount_cents,captured_amount_cents,provider_authorization_id) values($1,'pagbank_sandbox','captured',50000,18000,'CHAR_G') returning id",[r.id]);
 const f=await one("select (prepare_guarantee_refund($1,$2,3000,'Reembolso de teste',$3)).*",[g.id,actor,randomUUID()]);
 await one('select * from claim_guarantee_refund($1)',[f.id]);
 return f;
}
const retry=(id,paid=18000,refunded=0)=>one("select retry_transient_refund('guarantee',$1,$2,$3,$4) ready",[id,actor,paid,refunded]);
test('a timeout or unknown outcome can never be retried',async()=>{
 const f=await fixture();await db.query("update guarantee_refunds set state='uncertain',provider_error_code='provider_result_unknown',last_dispatch_at=now()-interval '2 minutes' where id=$1",[f.id]);
 assert.equal((await retry(f.id)).ready,false);
});
test('temporary rejection requires cooldown, live balance and one atomic claim',async()=>{
 const f=await fixture();await db.query("update guarantee_refunds set state='uncertain',provider_error_code='40008' where id=$1",[f.id]);
 assert.equal((await retry(f.id)).ready,false);
 await db.query("update guarantee_refunds set last_dispatch_at=now()-interval '2 minutes' where id=$1",[f.id]);
 await assert.rejects(retry(f.id,18000,3000),/balance_mismatch/);
 const results=await Promise.all([retry(f.id),retry(f.id)]);assert.equal(results.filter(x=>x.ready).length,1);
 const c=await one('select * from claim_guarantee_refund($1)',[f.id]);
 assert.equal(c.operation_key,f.operation_key);assert.equal(c.requested_cents,3000);assert.equal(c.provider_error_code,null);
});
test('authenticated clients cannot unlock uncertain refunds directly',async()=>{
 const f=await fixture();await db.exec('set role authenticated');
 try{await assert.rejects(retry(f.id),/permission denied/)}finally{await db.exec('reset role')}
});
test('unsigned hints can only reconcile registered charges and are rate limited',async()=>{
 const claim=id=>one('select claim_provider_reconciliation($1) ready',[id]);
 assert.equal((await claim('CHAR_UNKNOWN')).ready,false);
 await fixture();assert.equal((await claim('CHAR_G')).ready,true);
 assert.equal((await claim('CHAR_G')).ready,false);
 await db.exec('set role authenticated');
 try{await assert.rejects(claim('CHAR_G'),/permission denied/)}finally{await db.exec('reset role')}
});
test('reservation retry preserves allocation and cannot reuse an earlier rejection after a later request',async()=>{
 const r=await one('insert into reservations default values returning id');
 const p=await one("insert into payments(reservation_id,provider,status,amount_cents,provider_payment_id) values($1,'pagbank_sandbox','paid',10000,'CHAR_R') returning id",[r.id]);
 const c=await one('select (prepare_reservation_refund_case($1,$2)).*',[actor,{
  reservation_id:r.id,kind:'voluntary_refund',operation_key:randomUUID(),reason:'Teste de reenvio',
  requested_at:new Date().toISOString(),refund_due_cents:3000,calculation:{allocations:[{payment_id:p.id,charge_id:'CHAR_R',refund_cents:3000}]}}]);
 const f=await one('select * from reservation_refunds where cancellation_id=$1',[c.id]);
 await db.query("update reservation_refunds set state='uncertain',sent_at=now()-interval '3 minutes' where id=$1",[f.id]);
 const retry=()=>one("select retry_transient_refund('reservation',$1,$2,10000,0) ready",[f.id,actor]);
 assert.equal((await retry()).ready,false);
 await db.query("insert into reservation_refund_provider_observations(refund_id,phase,source,charge_id,http_status,error_code,observed_at) values($1,'post','charge','CHAR_R',400,'40008',now()-interval '2 minutes')",[f.id]);
 assert.equal((await retry()).ready,true);
 const claimed=await one('select * from claim_reservation_refund($1)',[f.id]);
 assert.equal(claimed.idempotency_key,f.idempotency_key);
 await one('select mark_refund_dispatch($1)',[f.id]);
 await db.query("update reservation_refunds set state='uncertain' where id=$1",[f.id]);
 assert.equal((await retry()).ready,false);
});
