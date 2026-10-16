import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {cents,selection,totals,reportCSV,zipBlob} from '../costs-model.js';

test('BRL parsing uses cents and rejects ambiguous, negative or excess values',()=>{
 assert.equal(cents('1.234,56'),123456);assert.equal(cents('0,01'),1);assert.equal(cents('130'),13000);
 for(const value of ['-10','0','1.23','1,234','NaN','10000001'])assert.throws(()=>cents(value));
});
test('competence, payment and fiscal months remain independent and archived costs never count',()=>{
 const rows=[{id:'a',property_id:1,amount_cents:10000,competence:'2026-09-01',paid_on:'2026-10-02',fiscal_month:null,fiscal_status:'operational',exclusion_cents:0},{id:'b',property_id:2,amount_cents:20000,competence:'2026-10-01',paid_on:'2026-11-02',fiscal_month:'2026-11-01',fiscal_status:'confirmed',exclusion_cents:15000},{id:'c',property_id:null,amount_cents:30000,competence:'2026-10-01',fiscal_status:'review',exclusion_cents:0},{id:'d',amount_cents:999999,competence:'2026-10-01',archived_at:'2026-10-01'}];
 assert.deepEqual(selection(rows,'2026-10').map(r=>r.id),['b','c']);assert.deepEqual(selection(rows,'2026-10','all','paid_on').map(r=>r.id),['a']);assert.deepEqual(selection(rows,'2026-11','all','fiscal_month').map(r=>r.id),['b']);assert.deepEqual(selection(rows,'2026-10','shared').map(r=>r.id),['c']);assert.equal(totals(selection(rows,'2026-10')).cost,50000);assert.equal(totals(selection(rows,'2026-11','all','fiscal_month')).exclusions,15000);
});
test('CSV escapes formulas, preserves Portuguese values and maps originals to ZIP names',()=>{
 const csv=reportCSV([{id:'a',category:'energy',amount_cents:12345,exclusion_cents:0,description:'=WEBSERVICE("secret")',supplier:'A;B',fiscal_status:'operational'}],[{id:'f',expense_id:'a',original_name:'conta.pdf'}],[]);
 assert.ok(csv.includes('123,45'));assert.ok(csv.includes("'=WEBSERVICE"));assert.ok(csv.includes('a/f-conta.pdf'));assert.ok(csv.includes('Custo operacional'));
});
test('ZIP contains UTF-8 names and correct uncompressed original payload',async()=>{
 const blob=await zipBlob([{name:'resumo.csv',blob:new Blob(['a;b\r\n1;2'])},{name:'custo/água.pdf',blob:new Blob([new Uint8Array([0,1,2,255])])}]);
 const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(data.length-12,true),2);assert.ok(new TextDecoder().decode(data).includes('custo/água.pdf'));
 await writeFile('/tmp/costs-test.zip',data);
});
test('database enforces private access, evidence, legal classification, audit and preservation',async()=>{
 const db=new PGlite(),admin='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002',expense='20000000-0000-4000-8000-000000000001',file='30000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage to authenticated;grant execute on function auth.uid() to authenticated;create table profiles(id uuid primary key,role text,pms_access_status text);grant select on profiles to authenticated;create table properties(id bigint primary key);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),name text,bucket_id text);alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;insert into auth.users values('${admin}'),('${guest}');insert into profiles values('${admin}','admin','active'),('${guest}','guest','active');insert into properties values(1);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261016125659_costs_receipts.sql',import.meta.url),'utf8'));
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;insert into cost_entries(id,property_id,category,description,document_date,competence,amount_cents,paid_on) values('${expense}',1,'property_tax','IPTU teste','2026-10-01','2026-10-01',12000,'2026-10-02');`);
 await assert.rejects(db.exec(`update cost_entries set fiscal_status='confirmed',exclusion_cents=12000,fiscal_month='2026-10-01',owner_borne=true,fiscal_note='Conferido IPTU' where id='${expense}'`),/cost_receipt_required/);
 await assert.rejects(db.exec(`insert into cost_receipts(id,expense_id,object_path,original_name,mime_type,size_bytes) values('${file}','${expense}','${expense}/${file}.pdf','nota.pdf','application/pdf',100)`),/cost_uploaded_object_required/);
 await db.exec(`insert into storage.objects(name,bucket_id) values('${expense}/${file}.pdf','cost-receipts');insert into cost_receipts(id,expense_id,object_path,original_name,mime_type,size_bytes) values('${file}','${expense}','${expense}/${file}.pdf','nota.pdf','application/pdf',100);update cost_entries set fiscal_status='confirmed',exclusion_cents=12000,fiscal_month='2026-10-01',owner_borne=true,fiscal_note='Conferido IPTU' where id='${expense}';`);
 await assert.rejects(db.exec(`update cost_entries set category='energy' where id='${expense}'`),/check constraint/);
 await assert.rejects(db.exec(`update cost_entries set exclusion_cents=13000 where id='${expense}'`),/check constraint/);
 await assert.rejects(db.exec(`update cost_entries set fiscal_month='2026-09-01' where id='${expense}'`),/cost_fiscal_month_invalid/);
 await assert.rejects(db.exec(`update cost_entries set property_id=null where id='${expense}'`),/check constraint/);
 await assert.rejects(db.exec(`delete from cost_receipts where id='${file}'`),/permission denied/);
 await assert.rejects(db.exec(`update cost_history set operation='forged'`),/permission denied/);
 assert.equal((await db.query('select count(*)::int n from cost_history')).rows[0].n,2);
 await db.exec(`update cost_entries set archived_at=now() where id='${expense}';select set_config('request.jwt.claim.sub','${guest}',false);`);
 for(const table of ['cost_entries','cost_receipts','cost_history','storage.objects'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
 await assert.rejects(db.exec(`insert into cost_entries(category,description,document_date,competence,amount_cents) values('cleaning','Faxina','2026-10-01','2026-10-01',100)`),/row-level security/);
 await db.exec(`reset role;update profiles set pms_access_status='inactive' where id='${admin}';select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;`);
 assert.equal((await db.query('select count(*)::int n from cost_entries')).rows[0].n,0);
 }finally{await db.close();}
});
