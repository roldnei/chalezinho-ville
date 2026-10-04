import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('pre-stay reminder follows dates, property time and timezone without resending delivered messages',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role;
   create table properties(id bigint primary key,check_in_time time,timezone text);
   create table reservations(id bigint primary key,status text,property_id bigint,check_in date,check_out date);
   create table notification_outbox(reservation_id bigint,template_code text,status text,payload jsonb,send_after timestamptz);
   insert into properties values(1,'15:00','America/Sao_Paulo'),(2,'17:00','UTC');
   insert into reservations values(1,'confirmed',1,'2099-11-16','2099-11-18');
   insert into notification_outbox values(1,'pre_stay_important','queued','{}','2099-11-15 18:00Z'),(1,'pre_stay_important','sent','{"check_in":"old"}','2099-11-15 18:00Z');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261004141000_reschedule_pre_stay_notification.sql',import.meta.url),'utf8'));
  await db.exec("update reservations set check_in='2099-11-17',check_out='2099-11-19' where id=1");
  let {rows}=await db.query("select *,send_after::text as scheduled from notification_outbox order by status");
  assert.equal(rows[0].payload.check_in,'2099-11-17');assert.match(rows[0].scheduled,/2099-11-16 18:00/);
  await db.exec('update reservations set property_id=2 where id=1');
  ({rows}=await db.query("select *,send_after::text as scheduled from notification_outbox order by status"));
  assert.equal(rows.length,2);assert.equal(rows[0].payload.property_id,2);assert.match(rows[0].scheduled,/2099-11-16 17:00/);
  assert.equal(rows[1].payload.check_in,'old');assert.match(rows[1].scheduled,/2099-11-15 18:00/);
 } finally {await db.close()}
});
