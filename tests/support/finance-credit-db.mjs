import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function creditDatabase(){
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create table profiles(id uuid primary key,role text);
 create table rate_plans(code text primary key,name text,active boolean default true);
 insert into rate_plans values('refundable','Reembolsável',true),('non_refundable','Não reembolsável',true);
 create table policy_documents(id uuid primary key default gen_random_uuid(),document_type text,code text,version text,title text,body text,status text,unique(code,version));
 insert into policy_documents(code,version,body) values('refundable_v1','1.2','Contrato anterior imutável'),('non_refundable_v1','1.2','Contrato anterior imutável');
 create table reservations(id uuid primary key default gen_random_uuid(),status text default 'confirmed',rate_plan_code text default 'refundable',check_in date default '2099-12-01',checked_in_at timestamptz,total_amount numeric default 1499,updated_at timestamptz,cancelled_at timestamptz,cancellation_actor text,cancellation_reason text);
 create table reservation_policy_acceptances(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,document_id uuid references policy_documents,document_code text,document_version text,accepted_at timestamptz default now());
 create table payments(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,amount_cents bigint,status text,provider text,method text,provider_payment_id text,installments int,updated_at timestamptz);
 create table experience_orders(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,status text default 'active');
 create table experience_order_items(id uuid primary key default gen_random_uuid(),order_id uuid references experience_orders,product_id uuid,variant_id uuid,unit_price_cents bigint not null,quantity int default 1,status text default 'active');
 create table guarantees(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,provider text,provider_authorization_id text,amount_cents bigint,captured_amount_cents bigint default 0,status text,requested_capture_cents bigint,provider_last_status text,updated_at timestamptz);
 create table incidents(id uuid primary key default gen_random_uuid(),guarantee_id uuid not null references guarantees,description text,requested_capture_cents bigint,evidence jsonb default '[]',status text default 'open',created_at timestamptz default now(),resolved_at timestamptz);
 create table financial_entries(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,payment_id uuid references payments,experience_order_item_id uuid references experience_order_items,entry_type text,amount_cents bigint,description text);
 create table post_booking_charges(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,kind text,amount_cents bigint,status text);
 create table modification_requests(id uuid primary key default gen_random_uuid(),reservation_id uuid references reservations,status text);
 `);
 for(const name of ['20260928003727_cancellation_policy_admin.sql','20260928123000_pagbank_reservation_refunds.sql',
 '20260928133500_reservation_financial_cases.sql','20260929023043_reservation_finance_ledger.sql',
 '20260929033510_finance_commercial_cancellation_window.sql','20260929033610_finance_experience_credits.sql','20261005225000_settled_experience_credit.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 return db;
}
