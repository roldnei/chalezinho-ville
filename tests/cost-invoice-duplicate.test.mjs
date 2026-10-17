import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {invoiceKey} from '../costs-model.js';
test('invoice identity ignores punctuation/case/leading zeros but preserves issuer and blank numbers',()=>{
 assert.equal(invoiceKey({supplier_document:'12.345.678/0001-90',document_number:'000123'}),invoiceKey({supplier_document:'12345678000190',document_number:'123'}));
 assert.equal(invoiceKey({document_number:'  - '}),null);assert.equal(invoiceKey({document_number:'000'}),':0');
 assert.notEqual(invoiceKey({supplier_document:'A',document_number:'1'}),invoiceKey({supplier_document:'B',document_number:'1'}));
});
test('database atomically claims invoices, preserves legacy duplicates, handles edits and disallows direct claim tampering',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create function auth.uid() returns uuid language sql as $$select '10000000-0000-4000-8000-000000000001'::uuid$$;create table profiles(id uuid,role text,pms_access_status text);insert into profiles values(auth.uid(),'admin','active');create table cost_entries(id int primary key,supplier_document text not null default '',document_number text not null default '',archived_at timestamptz,description text);grant select,insert,update on cost_entries to authenticated;insert into cost_entries(id,supplier_document,document_number) values(1,'12.345/0001','000123'),(2,'123450001','123');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261017004333_cost_invoice_duplicate_guard.sql',import.meta.url),'utf8'));
 await db.exec('set role authenticated');
 await assert.rejects(db.exec("insert into cost_entries(id,supplier_document,document_number) values(3,'12.345/0001','123')"),/cost_invoice_duplicate/);
 await db.exec("update cost_entries set description='reviewed',archived_at=now() where id=1");
 await assert.rejects(db.exec("insert into cost_entries(id,supplier_document,document_number) values(3,'123450001','000123')"),/cost_invoice_duplicate/);
 await db.exec("update cost_entries set document_number='124' where id=1");
 await assert.rejects(db.exec("insert into cost_entries(id,supplier_document,document_number) values(3,'123450001','123')"),/cost_invoice_duplicate/);
 await db.exec("update cost_entries set document_number='' where id=2;insert into cost_entries(id,supplier_document,document_number) values(3,'123450001','123'),(4,'999','123'),(5,'',''),(6,'','')");
 await assert.rejects(db.exec("update cost_entries set supplier_document='123450001' where id=4"),/cost_invoice_duplicate/);
 await assert.rejects(db.exec("insert into cost_entries(id,supplier_document,document_number) values(7,'123450001','123') on conflict(id) do nothing"),/cost_invoice_duplicate/);
 await db.exec("insert into cost_entries(id,supplier_document,document_number) values(3,'123450001','123') on conflict(id) do nothing");
 await assert.rejects(db.exec('update private.cost_invoice_claims set entry_count=0'),/permission denied/);
 await db.exec('reset role');
 const r=await db.query(`select count(*)::int n from private.cost_invoice_claims c where c.entry_count<>(select count(*) from cost_entries e where private.cost_invoice_key(e.supplier_document,e.document_number)=c.invoice_key)`);assert.equal(r.rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from cost_entries')).rows[0].n,6);
 }finally{await db.close();}
});
