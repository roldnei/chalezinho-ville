import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('development dispatch claims only the allowed recipient and leaves other messages queued',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,email text);create table reservations(id uuid primary key,guest_email text);
  create table notification_outbox(id uuid primary key default gen_random_uuid(),reservation_id uuid,user_id uuid,status text default 'queued',send_after timestamptz default now(),created_at timestamptz default now(),attempt_count int default 0,max_attempts int default 3,last_attempt_at timestamptz,last_error text);
  insert into auth.users values('11111111-1111-4111-8111-111111111111','owner@example.test');
  insert into reservations values('22222222-2222-4222-8222-222222222222','someone@example.test');
  insert into notification_outbox(user_id) values('11111111-1111-4111-8111-111111111111');
  insert into notification_outbox(user_id,reservation_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260930003115_phase1_notification_test_recipient.sql',import.meta.url),'utf8'));
  const claimed=await db.query("select * from claim_notification_outbox_for_delivery(1,'OWNER@example.test')");
  assert.equal(claimed.rows.length,1);assert.equal(claimed.rows[0].reservation_id,null);assert.equal(claimed.rows[0].attempt_count,1);
  assert.equal((await db.query("select * from claim_notification_outbox_for_delivery(1,'owner@example.test')")).rows.length,0);
  const other=await db.query("select status,attempt_count from notification_outbox where reservation_id is not null");assert.deepEqual(other.rows,[{status:'queued',attempt_count:0}]);
 }finally{await db.close()}
});
