import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
let db;
before(async()=>{db=new PGlite();await db.exec(`create schema private;create role anon;create role authenticated;
create table properties(id bigint primary key);insert into properties values(1),(2),(3);
create table reservations(id uuid primary key default gen_random_uuid(),property_id bigint,check_in date,check_out date,status text);
create table pms_calendar_blocks(id uuid primary key default gen_random_uuid(),property_id bigint,start_date date,end_date date,status text);
create table post_booking_charges(id uuid primary key default gen_random_uuid(),reservation_id uuid,kind text,target_property_id bigint,target_check_in date,target_check_out date,status text,expires_at timestamptz);`);
await db.exec(await readFile(new URL('../supabase/migrations/20260929220530_phase1_operational_inventory_lock.sql',import.meta.url),'utf8'));});
after(async()=>db?.close());
test('a block rejects direct booking and approved date-change hold, but allows adjacent checkout dates',async()=>{
 await db.exec("insert into pms_calendar_blocks(property_id,start_date,end_date,status) values(1,'2027-01-10','2027-01-12','active')");
 await assert.rejects(db.exec("insert into reservations(property_id,check_in,check_out,status) values(1,'2027-01-11','2027-01-13','confirmed')"),/operational_period_occupied/);
 await assert.rejects(db.exec("insert into post_booking_charges(kind,target_property_id,target_check_in,target_check_out,status,expires_at) values('modification',1,'2027-01-11','2027-01-13','awaiting_payment',now()+interval '1 hour')"),/operational_period_occupied/);
 await db.exec("insert into reservations(property_id,check_in,check_out,status) values(1,'2027-01-12','2027-01-14','confirmed')");
});
test('a reservation and an active modification each prevent maintenance blocking',async()=>{
 await db.exec("insert into reservations(property_id,check_in,check_out,status) values(2,'2027-01-10','2027-01-12','confirmed')");
 await assert.rejects(db.exec("insert into pms_calendar_blocks(property_id,start_date,end_date,status) values(2,'2027-01-11','2027-01-13','active')"),/operational_period_occupied/);
 await db.exec("insert into post_booking_charges(kind,target_property_id,target_check_in,target_check_out,status,expires_at) values('modification',3,'2027-01-10','2027-01-12','awaiting_payment',now()+interval '1 hour')");
 await assert.rejects(db.exec("insert into pms_calendar_blocks(property_id,start_date,end_date,status) values(3,'2027-01-11','2027-01-13','active')"),/operational_period_occupied/);
});
test('cancelled blocks release inventory and inactive records do not conflict',async()=>{
 await db.exec("update pms_calendar_blocks set status='cancelled' where property_id=1;insert into reservations(property_id,check_in,check_out,status) values(1,'2027-01-10','2027-01-12','confirmed')");
 await db.exec("insert into pms_calendar_blocks(property_id,start_date,end_date,status) values(1,'2027-01-10','2027-01-12','cancelled')");
});
