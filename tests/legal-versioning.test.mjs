import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('publication preserves signed text, timestamps and refuses stale/unauthorized changes',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table profiles(id uuid primary key,role text,pms_access_status text);create table policy_documents(id uuid primary key default gen_random_uuid(),document_type text,code text,version text,title text,body text,status text,created_at timestamptz default now(),effective_at timestamptz,unique(code,version));create table reservation_policy_acceptances(id uuid primary key default gen_random_uuid(),reservation_id uuid,user_id uuid,document_id uuid references policy_documents,document_code text,document_version text,accepted_at timestamptz default now());insert into auth.users values('00000000-0000-0000-0000-000000000001');insert into profiles values('00000000-0000-0000-0000-000000000001','admin','active');`);
 await db.exec(await readFile('supabase/migrations/20261005173351_versioned_booking_documents.sql','utf8'));
 const actor='00000000-0000-0000-0000-000000000001',body='Contrato original. '.repeat(10);
 const publish=async(previous,text=body)=> (await db.query('select publish_booking_document($1,$2,$3,$4,$5) id',['hosting_terms','Termos de Hospedagem',text,actor,previous])).rows[0].id;
 const initial=(await db.query("select id from policy_documents where code='hosting_terms' and version='1.1'")).rows[0].id;
 const v1=await publish(initial);
 await db.query('insert into reservation_policy_acceptances(reservation_id,document_id,document_code,document_version,accepted_at) values(gen_random_uuid(),$1,$2,$3,$4)',[v1,'forged','999','2000-01-01']);
 const accepted=(await db.query('select * from reservation_policy_acceptances')).rows[0];
 assert.equal(accepted.document_version,'1.2');assert.equal(accepted.document_snapshot.body,body.trim());assert.ok(new Date(accepted.accepted_at).getUTCFullYear()>2000);
 const v2=await publish(v1,'Texto atualizado. '.repeat(10));assert.notEqual(v1,v2);
 const unchanged=(await db.query('select * from reservation_policy_acceptances')).rows[0];assert.deepEqual(unchanged,accepted);
 await assert.rejects(()=>publish(v1),/policy_version_changed/);
 await assert.rejects(()=>db.query('insert into reservation_policy_acceptances(reservation_id,document_id,document_code,document_version) values(gen_random_uuid(),$1,$2,$3)',[v1,'x','1']),/policy_version_changed/);
 await assert.rejects(()=>db.query('update policy_documents set body=$1 where id=$2',['tampered',v1]),/policy_document_immutable/);
 await assert.rejects(()=>db.exec('delete from reservation_policy_acceptances'),/policy_acceptance_immutable/);
 await assert.rejects(()=>db.exec("set role authenticated;select publish_booking_document('hosting_terms','Termos de Hospedagem','"+body+"','"+actor+"',null)"),/permission denied/);
 }finally{await db.close()}
});
