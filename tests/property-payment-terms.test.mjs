import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),admin='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002';
const source=await readFile(new URL('../property-payment-editor.js',import.meta.url),'utf8');
const as=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)};
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 create table profiles(id uuid primary key,role text,pms_access_status text);grant select on profiles to authenticated;
 alter table profiles enable row level security;create policy self_read on profiles for select to authenticated using(id=auth.uid());
 insert into profiles values('${admin}','admin','active'),('${staff}','staff','active');
 create table properties(id bigint primary key,features jsonb);insert into properties values(1,'{"payment_terms":{"max_installments":12,"no_interest_installments":6}}'),(2,'{"payment_terms":{"max_installments":6}}');
 create table audit_events(id bigint generated always as identity,actor_user_id uuid,action text,entity_type text,entity_id text,old_value jsonb,new_value jsonb);
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261121124806_property_commercial_payment_terms.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
const insert="insert into property_commercial_payment_terms(property_id,credit_fee_bps,installments_count,cash_price_source) values($1,$2,$3,'quote') returning *";
test('anonymous reads only commercial data; only an active PMS administrator can configure a property',async()=>{
 await as('anon');assert.deepEqual((await db.query('select * from property_commercial_payment_terms')).rows,[]);await assert.rejects(db.query(insert,[1,700,10]),/permission denied/);
 await as('authenticated',staff);await assert.rejects(db.query(insert,[1,700,10]),/row-level security/);
 await as('authenticated',admin);await db.query(insert,[1,700,10]);await db.query(insert,[2,500,6]);
 await as('anon');assert.equal((await db.query('select count(*) n from property_commercial_payment_terms')).rows[0].n,2);
 await assert.rejects(db.query('update property_commercial_payment_terms set credit_fee_bps=0'),/permission denied/);
 await as('authenticated',staff);assert.equal((await db.query('update property_commercial_payment_terms set credit_fee_bps=0 returning *')).rows.length,0);
});
// Small PostgREST adapter exercises the actual RLS-protected database through the browser editor.
const sb={from(table){assert.equal(table,'property_commercial_payment_terms');let mode='read',values,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){mode='update';values=v;return q},insert(v){mode='insert';values=v;return q},async maybeSingle(){try{const args=[],where=filters.map(([k,v])=>{args.push(v);return k+'=$'+args.length}).join(' and ');let sql='select * from '+table+(where?' where '+where:'');if(mode==='update'){const sets=Object.entries(values).map(([k,v])=>{args.push(v);return k+'=$'+args.length});sql='update '+table+' set '+sets.join(',')+' where '+where+' returning *'}if(mode==='insert'){const entries=Object.entries(values);sql='insert into '+table+'('+entries.map(([k])=>k).join(',')+') values('+entries.map(([,v])=>{args.push(v);return '$'+args.length}).join(',')+') returning *'}return {data:(await db.query(sql,args)).rows[0]??null}}catch(error){return {error}}}};return q}};
async function editor(id,max=12){const d=new JSDOM('<main><form id="property-form"></form></main>',{runScripts:'outside-only'}),w=d.window;w.eval(source);await w.VillePropertyPaymentEditor.mount({host:w.document.querySelector('main'),property:{id,features:{payment_terms:{max_installments:max}}},sb});return {d,w,form:w.document.querySelector('[data-commercial-payment]')}}
test('PMS saves fee and advertised installments, persists after reopening, and keeps other properties and gateway terms intact',async()=>{
 await as('authenticated',admin);const e=await editor(1);assert.equal(e.form.elements.credit_fee_percent.value,'7');assert.equal(e.form.elements.installments_count.value,'10');
 e.form.elements.credit_fee_percent.value='5.25';e.form.elements.installments_count.value='8';await e.form.onsubmit(new e.w.Event('submit'));assert.match(e.form.textContent,/Condição salva/);e.d.window.close();
 const reopened=await editor(1);assert.equal(reopened.form.elements.credit_fee_percent.value,'5.25');assert.equal(reopened.form.elements.installments_count.value,'8');reopened.d.window.close();
 const other=await editor(2,6);assert.equal(other.form.elements.credit_fee_percent.value,'5');assert.equal(other.form.elements.installments_count.value,'6');other.d.window.close();
 await as('postgres');const p=(await db.query('select features from properties where id=1')).rows[0];assert.equal(p.features.payment_terms.no_interest_installments,6);
 const audit=(await db.query("select * from audit_events where action='commercial_payment_terms_update'")).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,admin);assert.equal(audit[0].old_value.credit_fee_bps,700);assert.equal(audit[0].new_value.credit_fee_bps,525);
});
test('database rejects invalid percentages and counts, and the editor detects a concurrent change',async()=>{
 await as('authenticated',admin);for(const [fee,count] of [[-1,6],[10001,6],[500,7],[500,0]])await assert.rejects(db.query('update property_commercial_payment_terms set credit_fee_bps=$1,installments_count=$2 where property_id=2',[fee,count]));
 const first=await editor(1),second=await editor(1);first.form.elements.credit_fee_percent.value='6';await first.form.onsubmit(new first.w.Event('submit'));second.form.elements.credit_fee_percent.value='9';await second.form.onsubmit(new second.w.Event('submit'));assert.match(second.form.textContent,/outra tela/);assert.equal((await db.query('select credit_fee_bps from property_commercial_payment_terms where property_id=1')).rows[0].credit_fee_bps,600);first.d.window.close();second.d.window.close();
 await as('postgres');await db.query("update profiles set pms_access_status='suspended' where id=$1",[admin]);await as('authenticated',admin);assert.equal((await db.query('update property_commercial_payment_terms set credit_fee_bps=0 returning *')).rows.length,0);
});
