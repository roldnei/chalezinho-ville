import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {projectFinance} from '../supabase/functions/_shared/finance/model.ts';
const db=new PGlite();
const actor='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002';
let n=100;
const uuid=()=>`20000000-0000-4000-8000-${String(n++).padStart(12,'0')}`;
const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth; create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key,role text);
 create table public.payment_settings(id int primary key,active_provider text);
 insert into public.payment_settings values(1,'mock');
 create table public.properties(id int primary key,features jsonb);
 insert into public.properties values(1,'{"payment_terms":{"max_installments":8,"no_interest_installments":4},"other":"preserved"}');
 create table public.quote_options(id uuid primary key default gen_random_uuid());
 create table public.reservations(id uuid primary key default gen_random_uuid(),status text default 'confirmed',total_amount numeric default 100);
 create table public.payments(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),amount_cents bigint,status text,provider text,method text,provider_payment_id text,installments int);
 create table public.guarantees(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),provider text default 'pagbank_sandbox',provider_authorization_id text,amount_cents bigint,captured_amount_cents bigint default 0,status text default 'guaranteed',requested_capture_cents bigint,provider_last_status text,updated_at timestamptz default now());
 create table public.incidents(id uuid primary key default gen_random_uuid(),guarantee_id uuid not null references guarantees(id),description text,requested_capture_cents bigint,evidence jsonb default '[]',status text default 'open',created_at timestamptz default now(),resolved_at timestamptz);
 create table public.financial_entries(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),payment_id uuid,entry_type text,amount_cents bigint,description text);
 create table public.post_booking_charges(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),kind text,amount_cents bigint,status text);
 create table public.reservation_refunds(id uuid primary key default gen_random_uuid(),payment_id uuid references payments(id),requested_cents bigint,confirmed_cents bigint default 0,state text);
 create table public.reservation_cancellations(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),status text);
 create table public.modification_requests(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations(id),status text);
 insert into auth.users values('${actor}'),('${guest}');insert into profiles values('${actor}','admin'),('${guest}','guest');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260929023043_reservation_finance_ledger.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260929024034_finance_installment_offers.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260929030240_finance_payment_configuration.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
async function reservation(){return (await one('insert into reservations default values returning id')).id;}
async function guarantee(captured=0){const r=await reservation();return await one('insert into guarantees(reservation_id,amount_cents,captured_amount_cents,status,provider_authorization_id) values($1,50000,$2,$3,$4) returning *',[r,captured,captured?'captured':'guaranteed','CHAR_QA']);}
const prepare=(g,amount,key=uuid(),who=actor)=>one('select (public.prepare_guarantee_refund($1,$2,$3,$4,$5)).*',[g.id,who,amount,'Devolução teste',key]);
const claim=id=>one('select * from claim_guarantee_refund($1)',[id]);
const confirm=(id,captured,total)=>one('select confirm_guarantee_refund($1,$2,$3,$4)',[id,'CHAR_QA',captured,total]);
const incident=(g,amount=18900,key=uuid(),who=actor)=>one('select (record_reservation_incident($1,$2,$3,$4,$5,$6,$7,$8)).*',[g.reservation_id,g.id,who,'damage','Dano fictício QA',amount,[{kind:'damage'},{kind:'receipt'}],key]);

test('installment offer is immutable and requires exactly one payable source',async()=>{
 const q=await one('insert into quote_options default values returning id');
 const sql="insert into installment_offers(user_id,quote_option_id,base_amount_cents,provider,plans,terms,expires_at) values($1,$2,10000,'pagbank_sandbox',$3,'{}',now()+interval '15 minutes') returning id";
 const offer=await one(sql,[guest,q.id,[{installments:1,total_cents:10000}]]);
 await assert.rejects(db.query('update installment_offers set base_amount_cents=1 where id=$1',[offer.id]),/immutable/);
 await assert.rejects(db.query('delete from installment_offers where id=$1',[offer.id]),/immutable/);
 await assert.rejects(one(sql,[guest,null,[{installments:1,total_cents:10000}]]),/check constraint/);
});
test('financial settings migration preserves configured property terms and enables explicit sandbox provider',async()=>{
 const settings=await one('select * from payment_settings');assert.equal(settings.active_provider,'pagbank_sandbox');assert.equal(settings.pix_enabled,true);
 const {features}=await one('select features from properties');assert.equal(features.other,'preserved');assert.equal(features.payment_terms.max_installments,8);assert.equal(features.payment_terms.no_interest_installments,4);assert.equal(features.payment_terms.interest_payer,'guest');
});
test('an existing financial record cannot be moved to another reservation',async()=>{
 const a=await reservation(),b=await reservation();const p=await one("insert into payments(reservation_id,amount_cents,status) values($1,10000,'paid') returning id",[a]);
 await assert.rejects(db.query('update payments set reservation_id=$1 where id=$2',[b,p.id]),/link_is_immutable/);
});

test('migration installs append-only events and records reservation baseline',async()=>{
 const r=await reservation();const e=await one('select * from finance_events where reservation_id=$1',[r]);assert.equal(e.event_type,'created');
 await assert.rejects(db.query('update finance_events set payload=\'{}\' where reservation_id=$1',[r]),/immutable/);
 await assert.rejects(db.query('delete from finance_events where reservation_id=$1',[r]),/immutable/);
});
test('financial event payload excludes customer identity, card data and provider secrets',async()=>{
 const row=await one("select finance_payload('payments',$1::jsonb) as safe",[{id:uuid(),amount_cents:18900,status:'paid',guest_name:'Private',tax_id:'private',encrypted_card:'private',card_token:'private',authorization:'private',metadata:{secret:'private'}}]);
 assert.deepEqual(Object.keys(row.safe).sort(),['amount_cents','id','status']);
});
test('legacy ledger cannot be rewritten or detached from reservation',async()=>{
 const r=await reservation();const e=await one("insert into financial_entries(reservation_id,entry_type,amount_cents) values($1,'accommodation',10000) returning id",[r]);
 await assert.rejects(db.query('update financial_entries set amount_cents=1 where id=$1',[e.id]),/immutable/);
 await assert.rejects(db.query("insert into financial_entries(entry_type,amount_cents) values('refund',-1)"),/reservation_required/);
});
test('total guarantee refund confirms once and survives duplicate callback',async()=>{
 const g=await guarantee(29000),r=await prepare(g,29000);await claim(r.id);await confirm(r.id,29000,29000);await confirm(r.id,29000,29000);
 const updated=await one('select * from guarantees where id=$1',[g.id]);assert.equal(updated.refunded_amount_cents,29000);
 const entries=(await db.query('select * from finance_events where source=\'guarantee_refunds\' and entity_id=$1',[r.id])).rows;assert.equal(entries.length,3);
});
test('multiple partial guarantee refunds enforce cumulative provider receipt',async()=>{
 const g=await guarantee(29000),a=await prepare(g,10000);await claim(a.id);await confirm(a.id,29000,10000);
 const b=await prepare(g,9000);assert.equal(b.prior_refunded_cents,10000);await claim(b.id);
 await assert.rejects(confirm(b.id,29000,9000),/receipt_mismatch/);await confirm(b.id,29000,19000);
 const c=await prepare(g,10000);await claim(c.id);await confirm(c.id,29000,29000);
 await assert.rejects(prepare(g,1),/exceeds/);
});
test('concurrent refund preparation never overcommits a capture',async()=>{
 const g=await guarantee(18900);
 const results=await Promise.allSettled([prepare(g,15000),prepare(g,15000)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
});
test('repeat request is same refund; changed amount is conflict',async()=>{
 const g=await guarantee(29000),key=uuid(),a=await prepare(g,18900,key),b=await prepare(g,18900,key);assert.equal(a.id,b.id);
 await assert.rejects(prepare(g,19000,key),/idempotency_conflict/);
 assert.ok(await claim(a.id));assert.equal(await claim(a.id),undefined);
});
test('unknown provider outcome keeps funds reserved',async()=>{
 const g=await guarantee(29000),a=await prepare(g,10000);await claim(a.id);
 await db.query("update guarantee_refunds set state='uncertain',provider_error_code='40008' where id=$1",[a.id]);
 await assert.rejects(prepare(g,1000),/pending/);
 assert.equal((await one('select refunded_amount_cents from guarantees where id=$1',[g.id])).refunded_amount_cents,0);
});
test('guest cannot request admin refunds or incidents',async()=>{
 const g=await guarantee(29000);await assert.rejects(prepare(g,1,uuid(),guest),/admin_required/);
 await assert.rejects(incident(g,100,uuid(),guest),/admin_required/);
});
test('occurrence without authorization or collection is allowed',async()=>{
 const g=await guarantee();await db.query("update guarantees set status='pending',provider_authorization_id=null where id=$1",[g.id]);
 const i=await incident(g,0);assert.equal(i.decision,'pending');
 await one('select decide_reservation_incident($1,$2,$3)',[i.id,actor,'no_charge']);
 assert.equal((await one('select status from guarantees where id=$1',[g.id])).status,'pending');
});
test('occurrence without guarantee belongs directly to reservation',async()=>{
 const r=await reservation();const i=await one('select (record_reservation_incident($1,null,$2,$3,$4,0,$5,$6)).*',[r,actor,'other','Registro sem cobrança',[],uuid()]);assert.equal(i.reservation_id,r);assert.equal(i.guarantee_id,null);
});
test('partial capture requires financial decision and resolves only selected occurrence',async()=>{
 const g=await guarantee(),a=await incident(g),b=await incident(g,1000);
 assert.equal((await one('select status from guarantees where id=$1',[g.id])).status,'guaranteed');
 await one('select decide_reservation_incident($1,$2,$3)',[a.id,actor,'approved']);
 await db.query("update guarantees set status='capture_requested',requested_capture_cents=18900 where id=$1",[g.id]);
 await one('select * from capture_guarantee_mock_atomic($1,$2,18900)',[g.id,actor]);
 await one('select * from capture_guarantee_mock_atomic($1,$2,18900)',[g.id,actor]);
 assert.equal((await one('select status from incidents where id=$1',[a.id])).status,'resolved');
 assert.equal((await one('select status from incidents where id=$1',[b.id])).status,'open');
 assert.equal((await one('select count(*)::int as n from financial_entries where reservation_id=$1',[g.reservation_id])).n,1);
 const ev=(await db.query('select * from finance_events where reservation_id=$1 order by sequence',[g.reservation_id])).rows;
 const p=projectFinance(ev);assert.equal(p.damage_captured_cents,18900);assert.equal(p.guarantees[0].status,'partially_captured');assert.equal(p.guarantees[0].released_cents,0);assert.equal(p.guarantees[0].release_confirmed,false);
});
test('capture cannot bypass decision or exceed requested amount',async()=>{
 const g=await guarantee();await assert.rejects(one('select * from capture_guarantee_mock_atomic($1,$2,18900)',[g.id,actor]),/capture_not_requested/);
 const i=await incident(g,60000);await assert.rejects(one('select decide_reservation_incident($1,$2,$3)',[i.id,actor,'approved']),/not_chargeable/);
});
test('event projection preserves paid amount through pending refund',async()=>{
 const r=await reservation();const p=await one("insert into payments(reservation_id,amount_cents,status,method) values($1,117200,'paid','card') returning id",[r]);
 await db.query("insert into reservation_refunds(payment_id,requested_cents,state) values($1,117200,'uncertain')",[p.id]);
 const ev=(await db.query('select * from finance_events where reservation_id=$1 order by sequence',[r])).rows;
 const x=projectFinance(ev);assert.equal(x.paid_cents,117200);assert.equal(x.refunded_cents,0);assert.equal(x.pending_refund_cents,117200);
});
test('RLS prevents guest reading the financial event stream directly',async()=>{
 await db.exec('set role authenticated');try{await assert.rejects(db.query('select * from finance_events'),/permission denied/);}finally{await db.exec('reset role');}
});
