import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const product='d7c8da18-e089-46d1-962b-f90816135ef5';let serial=1;
const uuid=()=>`20000000-0000-4000-8000-${String(serial++).padStart(12,'0')}`;
const one=async(q,p=[]) => (await db.query(q,p)).rows[0];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text);
 create table properties(id bigint primary key,active boolean default true,check_in_time time default '15:00',check_out_time time default '11:00',timezone text default 'America/Sao_Paulo');insert into properties(id) values(1),(2);
 create table experience_products(id uuid primary key default gen_random_uuid(),name text,code text,description text,package_type text,price_cents bigint,status text,details jsonb,minimum_lead_hours int default 0,daily_capacity int,inventory int,upsell_enabled bool);
 create table experience_property_eligibility(product_id uuid,property_id bigint);insert into experience_property_eligibility values('${product}',1),('${product}',2);
 create table experience_variants(id uuid primary key default gen_random_uuid(),product_id uuid,active bool,display_order int,code text,name text,price_cents bigint);
 create table experience_media(product_id uuid,media_url text,alt_text text,display_order int);
 create table quote_options(id uuid primary key default gen_random_uuid());
 create table quote_experience_items(id uuid primary key default gen_random_uuid(),quote_id uuid,product_id uuid);
 create table reservations(id uuid primary key default gen_random_uuid(),quote_option_id uuid,quote_id uuid,property_id bigint,status text,check_in date,check_out date,hold_expires_at timestamptz,confirmation_code text default 'DEV-OFFER',guest_name text default 'Teste',user_id uuid);
 create table experience_orders(id uuid primary key default gen_random_uuid(),reservation_id uuid,status text);
 create table experience_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,variant_id uuid,product_name_snapshot text,status text,quantity int default 1);
 create table pms_tasks(id uuid primary key default gen_random_uuid(),property_id bigint,reservation_id uuid,task_type text,title text,description text,status text default 'todo',scheduled_for timestamptz,due_at timestamptz,priority text,assigned_user_id uuid,assigned_name text,completed_at timestamptz,submitted_at timestamptz,updated_at timestamptz);
 create unique index pms_turnover_per_reservation_idx on pms_tasks(reservation_id,task_type) where reservation_id is not null;
 create table pms_task_checklist_items(id uuid primary key default gen_random_uuid(),task_id uuid,label text,display_order int,completed bool default false,completed_at timestamptz,completed_by uuid);
 create table pms_activity_events(id uuid primary key default gen_random_uuid(),task_id uuid,event_type text,details jsonb);
 create table audit_events(actor_user_id uuid,action text,entity_type text,entity_id text,new_value jsonb);
 create table post_booking_cart_items(id uuid primary key,reservation_id uuid,user_id uuid,target_variant_id uuid,snapshot jsonb);
 create table post_booking_charges(id uuid primary key,reservation_id uuid,target_variant_id uuid,status text,created_at timestamptz,snapshot jsonb);
 create function add_experience_cart_item_atomic(uuid,uuid,uuid) returns table(cart_item_id uuid,purchase_mode text,amount_cents bigint,description text) language sql as $$ select null::uuid,'add'::text,100::bigint,'test'::text $$;
 create function checkout_experience_cart_item_atomic(uuid,uuid,int) returns table(charge_id uuid,purchase_mode text,amount_cents bigint,description text,expires_at timestamptz) language sql as $$ select null::uuid,'add'::text,100::bigint,'test'::text,now() $$;
 insert into experience_products(id,name,status,details,price_cents) values('${product}','Romance','active','{"components":[{"name":"Bebida","quantity":1,"frequency":"arrival","choices":["Vinho","Espumante"]},{"name":"Frutas","quantity":2,"frequency":"daily","choices":[]}]}',10000);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261005201531_romantic_stay_offers.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261005203843_experience_service_day_capacity.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
async function booking(){
 const option=await one('insert into quote_options(contract_snapshot) values($1) returning id',[{offer_name:'Romance',discount_cents:500,experiences:[]}]);
 const r=await one("insert into reservations(property_id,status,check_in,check_out,quote_option_id) values(1,'pending_payment','2030-01-01','2030-01-03',$1) returning *",[option.id]);
 const order=await one("insert into experience_orders(reservation_id,status) values($1,'pending') returning id",[r.id]);
 const item=await one("insert into experience_order_items(order_id,product_id,product_name_snapshot,status,composition_snapshot) values($1,$2,'Romance','active',stay_internal.package_snapshot($2,'{\"Bebida\":\"Vinho\"}',true)) returning id",[order.id,product]);
 return {r,order,item};
}
test('contract copied from chosen quote and cannot be rewritten',async()=>{
 const {r}=await booking();assert.equal(r.contract_snapshot.offer_name,'Romance');await assert.rejects(db.query("update reservations set contract_snapshot='{}' where id=$1",[r.id]),/immutable/);
});
test('confirmation events generate concrete preference and daily checklists once',async()=>{
 const {r,order}=await booking();await db.query("update reservations set status='confirmed' where id=$1",[r.id]);assert.equal((await one('select count(*)::int n from pms_tasks where reservation_id=$1',[r.id])).n,0);
 await db.query("update experience_orders set status='active' where id=$1",[order.id]);
 const tasks=(await db.query('select * from pms_tasks where reservation_id=$1 order by service_date',[r.id])).rows;assert.equal(tasks.length,2);assert.equal(tasks[0].due_at.toISOString(),'2030-01-01T17:00:00.000Z');
 assert.deepEqual((await db.query('select label from pms_task_checklist_items where task_id=$1 order by display_order',[tasks[0].id])).rows.map(x=>x.label),['1 × Bebida · Vinho','2 × Frutas']);
 await db.query("update reservations set status='confirmed' where id=$1",[r.id]);assert.equal((await one('select count(*)::int n from pms_tasks where reservation_id=$1',[r.id])).n,2);
});
test('catalog edits and pause do not change bought composition; cancel keeps audited preparation',async()=>{
 const {r,order,item}=await booking();await db.query("update experience_orders set status='active' where id=$1",[order.id]);await db.query("update reservations set status='confirmed' where id=$1",[r.id]);
 await db.query("update experience_products set details='{}',status='inactive' where id=$1",[product]);const snap=await one('select composition_snapshot from experience_order_items where id=$1',[item.id]);assert.equal(snap.composition_snapshot.components[0].choice,'Vinho');
 await assert.rejects(db.query("update experience_order_items set composition_snapshot='{}' where id=$1",[item.id]),/immutable/);
 await db.query("update reservations set status='cancelled' where id=$1",[r.id]);assert.equal((await one("select count(*)::int n from pms_tasks where reservation_id=$1 and status='cancelled'",[r.id])).n,2);assert.ok((await one("select count(*)::int n from pms_activity_events where event_type='preparation_cancelled'")).n>=2);
 await db.query("update experience_products set status='active',details=$2 where id=$1",[product,{includes:['Ambientação']}]);
});
test('date or property changes cancel obsolete services and update preparation',async()=>{
 const {r,order}=await booking();await db.query("update experience_orders set status='active' where id=$1",[order.id]);await db.query("update reservations set status='confirmed' where id=$1",[r.id]);
 await db.query("update reservations set check_in='2030-01-05',check_out='2030-01-07',property_id=2 where id=$1",[r.id]);
 const active=(await db.query("select * from pms_tasks where reservation_id=$1 and status<>'cancelled'",[r.id])).rows;assert.ok(active.length>0);assert.ok(active.every(t=>t.property_id===2));assert.ok((await one("select count(*)::int n from pms_tasks where reservation_id=$1 and status='cancelled'",[r.id])).n>0);
});

test('daily capacity counts contracted service dates and preserves prior frequency after catalog edits',async()=>{
 await db.query("update reservations set status='cancelled'");
 await db.query("update experience_products set status='active',daily_capacity=1,details=$1 where id=$2",[{components:[{name:'Ambientação',quantity:1,frequency:'arrival',choices:[]}]},product]);
 const {r}=await booking();await db.query("update reservations set status='confirmed' where id=$1",[r.id]);await db.query("update experience_orders set status='active' where reservation_id=$1",[r.id]);
 assert.equal((await one("select experience_sale_issue($1,2,'2030-01-02','2030-01-04') as issue",[product])).issue,null,'arrival-only packages do not occupy capacity for the whole stay');
 assert.equal((await one("select experience_sale_issue($1,2,'2030-01-01','2030-01-03') as issue",[product])).issue,'experience_capacity');
 await db.query("update experience_products set details=$1 where id=$2",[{components:[{name:'Ambientação',quantity:1,frequency:'daily',choices:[]}]},product]);
 assert.equal((await one("select experience_sale_issue($1,2,'2030-01-02','2030-01-04') as issue",[product])).issue,null,'catalog changes do not rewrite the first booking service frequency');
 const {r:daily}=await booking();await db.query("update reservations set status='confirmed' where id=$1",[daily.id]);await db.query("update experience_orders set status='active' where reservation_id=$1",[daily.id]);
 assert.equal((await one("select experience_sale_issue($1,2,'2030-01-02','2030-01-04') as issue",[product])).issue,'experience_capacity');
});
