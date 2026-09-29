import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('confirmation snapshots use cents and legacy queued snapshots are converted only once',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
  create table reservations(id uuid primary key default gen_random_uuid(),user_id uuid,status text,confirmation_code text,check_in date,check_out date,total_amount numeric);
  create table notification_outbox(id uuid default gen_random_uuid(),user_id uuid,reservation_id uuid,modification_request_id uuid,charge_id uuid,template_code text,send_after timestamptz,payload jsonb,dedupe_key text unique,status text default 'queued');
  insert into notification_outbox(template_code,payload,dedupe_key) values('reservation_confirmed','{"total_amount_cents":1642.35}','legacy');
  insert into notification_outbox(template_code,payload,dedupe_key,status) values('reservation_confirmed','{"total_amount_cents":1642.35}','sent','sent');`);
  const migration=await readFile(new URL('../supabase/migrations/20260929224919_phase1_notification_amount_units.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec(`create trigger notification_test after insert on reservations for each row execute function enqueue_phase1_notification_events();
  insert into reservations(status,confirmation_code,check_in,check_out,total_amount) values('confirmed','TEST','2027-01-10','2027-01-12',1642.35);`);
  const {rows}=await db.query("select payload from notification_outbox where template_code='reservation_confirmed' and status='queued'");
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.payload.total_amount_cents===164235&&r.payload.payload_version===2));
  const sent=await db.query("select payload from notification_outbox where status='sent'");assert.equal(sent.rows[0].payload.total_amount_cents,1642.35);
 }finally{await db.close()}
});
