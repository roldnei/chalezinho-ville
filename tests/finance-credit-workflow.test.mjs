import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {creditDatabase} from './support/finance-credit-db.mjs';
import {projectFinance} from '../supabase/functions/_shared/finance/model.ts';
let db;const actor=randomUUID(),guest=randomUUID();
const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
before(async()=>{db=await creditDatabase();await db.query('insert into auth.users values($1),($2)',[actor,guest]);await db.query("insert into profiles values($1,'admin'),($2,'guest')",[actor,guest]);});
after(async()=>{await db?.close();});
async function fixture(){
 const r=(await one('insert into reservations default values returning id')).id;
 const p=(await one("insert into payments(reservation_id,amount_cents,status,provider,provider_payment_id) values($1,149900,'paid','pagbank_sandbox','CHAR_QA') returning id",[r])).id;
 const o=(await one('insert into experience_orders(reservation_id) values($1) returning id',[r])).id;
 const i=(await one('insert into experience_order_items(order_id,unit_price_cents) values($1,49900) returning id',[o])).id;
 await db.query("insert into financial_entries(reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents) values($1,$2,$3,'experience',49900)",[r,p,i]);
 await db.query("insert into financial_entries(reservation_id,payment_id,entry_type,amount_cents) values($1,$2,'accommodation',100000)",[r,p]);
 await db.query("insert into reservation_policy_acceptances(reservation_id,document_id,document_code,document_version) select $1,id,code,version from policy_documents where code='refundable_v1' and version='1.2'",[r]);
 return {r,p,i,key:randomUUID()};
}
const prepare=(f,who=actor,notProvided=true)=>one('select prepare_experience_credit($1,$2,$3,$4,$5,$6) id',[f.r,f.i,who,'Serviço não prestado',f.key,notProvided]);
const projection=async f=>projectFinance((await db.query('select * from finance_events where reservation_id=$1 order by sequence',[f.r])).rows);

test('commercial policy migration versions new drafts without changing accepted rules',async()=>{
 const rows=(await db.query("select r.*,d.version,d.body from cancellation_policy_rules r join policy_documents d on d.id=r.document_id order by d.version")).rows;
 assert.equal(rows.filter(r=>r.version==='1.2'&&r.commercial_free_cancellation_hours===0).length,2);
 assert.equal(rows.filter(r=>r.version==='1.3'&&r.commercial_free_cancellation_hours===24).length,2);
 assert.match(rows.find(r=>r.version==='1.3').body,/24 horas/);
 assert.equal(rows.find(r=>r.version==='1.2').body,'Contrato anterior imutável');
 await assert.rejects(db.query('update cancellation_policy_rules set withdrawal_days=9'),/immutable/);
 await assert.rejects(db.query("select save_finance_cancellation_policy('refundable',7,null,20,50)"),/invalid_policy/);
});
test('experience credit prepares atomically, approves once and refunds without cancelling reservation',async()=>{
 const f=await fixture(),c=await prepare(f);
 assert.equal((await projection(f)).credit_balance_cents,0);
 assert.equal((await prepare(f)).id,c.id);
 await db.query("update reservation_cancellations set status='pending_provider',approved_at=now() where id=$1",[c.id]);
 assert.equal((await one('select status from experience_order_items where id=$1',[f.i])).status,'cancelled');
 assert.equal((await projection(f)).credit_balance_cents,49900);
 assert.equal((await projection(f)).refunded_cents,0);
 const refund=await one('select * from reservation_refunds where cancellation_id=$1',[c.id]);
 await db.query('select * from claim_reservation_refund($1)',[refund.id]);
 await db.query('select mark_refund_dispatch($1)',[refund.id]);
 await assert.rejects(db.query("select confirm_reservation_refund($1,'CHAR_QA','PAID',149900,49901)",[refund.id]),/amount_mismatch/);
 for(let n=0;n<2;n++)await db.query("select confirm_reservation_refund($1,'CHAR_QA','PAID',149900,49900)",[refund.id]);
 const balance=await projection(f);
 assert.equal(balance.refunded_cents,49900);assert.equal(balance.credit_balance_cents,0);assert.equal(balance.balance_due_cents,0);
 assert.equal((await one('select status from reservations where id=$1',[f.r])).status,'confirmed');
 assert.equal((await one('select status from reservation_cancellations where id=$1',[c.id])).status,'confirmed');
 assert.equal((await prepare(f)).id,c.id);
});
test('experience credit requires admin, actual unprovided-service decision and matching reservation',async()=>{
 const f=await fixture();await assert.rejects(prepare(f,guest),/admin_required/);await assert.rejects(prepare(f,actor,false),/service_review_required/);
 const other=await fixture();await assert.rejects(prepare({...f,r:other.r}),/experience_not_active/);
});
test('credit preparation rolls back whole case when a payment cannot fund its allocation',async()=>{
 const f=await fixture();await db.query('update payments set amount_cents=100 where id=$1',[f.p]);
 await assert.rejects(prepare(f),/refund_exceeds_captured/);
 assert.equal((await one('select count(*)::int n from reservation_cancellations where reservation_id=$1',[f.r])).n,0);
 assert.equal((await one('select count(*)::int n from experience_credits where reservation_id=$1',[f.r])).n,0);
});
test('credits are immutable, idempotent and prevent duplicate items and upgrades',async()=>{
 const f=await fixture();await prepare(f);
 await assert.rejects(prepare({...f,key:randomUUID()}),/credit_already_exists/);
 await assert.rejects(prepare({...await fixture(),key:f.key}),/idempotency_conflict/);
 await assert.rejects(db.query("update experience_order_items set status='upgraded' where id=$1",[f.i]),/credit_pending/);
 await assert.rejects(db.query('delete from experience_credits where reservation_id=$1',[f.r]),/immutable/);
 await db.exec('set role authenticated');try{
  await assert.rejects(db.query('select * from experience_credits'),/permission denied/);
  await assert.rejects(prepare(f),/permission denied/);
 }finally{await db.exec('reset role');}
});
test('upgrade and interest allocations require review instead of a guessed refund',async()=>{
 const f=await fixture();await db.query("insert into financial_entries(reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents) values($1,$2,$3,'upgrade',5000)",[f.r,f.p,f.i]);
 await assert.rejects(prepare(f),/review_required/);
 const interest=await fixture();await db.query('update experience_order_items set unit_price_cents=45000 where id=$1',[interest.i]);
 await assert.rejects(prepare(interest),/review_required/);
});

test('credit audit retains item provenance and duplicate key cannot accept a null item',async()=>{
 const f=await fixture();await prepare(f);
 const e=await one("select payload from finance_events where reservation_id=$1 and source='experience_credits'",[f.r]);
 assert.equal(e.payload.experience_order_item_id,f.i);assert.equal(e.payload.service_not_provided,true);
 await assert.rejects(prepare({...f,i:null}),/idempotency_conflict/);
});
