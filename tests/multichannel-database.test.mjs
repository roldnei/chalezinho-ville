import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db=new PGlite(),admin='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
const mutate=async(action,p,actor=admin)=>(await one('select ops_mutate($1,$2,$3) result',[actor,action,p])).result;
let source;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);
 create table properties(id bigint primary key,name text,check_in_time time default '15:00',check_out_time time default '11:00');insert into properties(id,name) values(1,'QA Amore'),(2,'QA Essenza');
 create table profiles(id uuid primary key,role text,pms_access_status text,pms_property_ids bigint[],pms_permissions jsonb);
 insert into auth.users values('${admin}'),('${staff}'),('${other}');insert into profiles values('${admin}','admin','active','{}','{}'),('${staff}','staff','active','{1}','{"housekeeping":true}'),('${other}','staff','active','{2}','{"housekeeping":true}');
 create table reservations(id uuid primary key default gen_random_uuid(),property_id bigint,check_in date,check_out date,status text,hold_expires_at timestamptz,source text,quote_id uuid,guest_name text,guest_phone text,guests int,checked_in_at timestamptz,checked_out_at timestamptz);
 create table pms_calendar_blocks(id uuid primary key default gen_random_uuid(),property_id bigint,start_date date,end_date date,status text);
 create table post_booking_charges(id uuid primary key default gen_random_uuid(),kind text,target_property_id bigint,target_check_in date,target_check_out date,status text,expires_at timestamptz,reservation_id uuid);
 create table admin_notifications(id uuid default gen_random_uuid(),notification_type text,severity text,title text,message text,entity_type text,entity_id text,dedupe_key text unique,payload jsonb);
 create table property_calendar_sources(id uuid primary key default gen_random_uuid(),property_id bigint,provider text,updated_at timestamptz default now(),enabled boolean default true,deleted_at timestamptz);
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261012162927_multichannel_operations.sql',import.meta.url),'utf8'));
 source=await one("insert into property_calendar_sources(property_id,provider) values(1,'airbnb') returning *");
});
after(()=>db.close());
async function sync(events,error=null){const token=(await one('select ops_claim_sync($1) token',[source.id])).token;await one('select ops_apply_sync($1,$2,$3,$4,$5,1)',[source.id,token,source.updated_at,JSON.stringify(events),error]);}
const event=(uid,start='2026-10-09',end='2026-10-12',kind='stay')=>({uid,start,end,kind,summary:'Reserved',sequence:0,cancelled:false});
test('real-shaped Airbnb stay creates distinct tasks, unknown guest and no invented attendance',async()=>{
 await sync([event('amore')]);const s=await one("select * from ops_stays where external_id='amore'");assert.equal(s.guest_name,null);assert.equal(s.guests,null);assert.equal(s.checked_out_at,null);
 const tasks=(await db.query('select * from ops_tasks where stay_id=$1 order by stage',[s.id])).rows;assert.equal(tasks.length,2);assert.equal(tasks.find(t=>t.stage==='preparation').due_at.toISOString(),'2026-10-09T17:30:00.000Z');
});
test('sync repeats idempotently, fenced claim rejects concurrency',async()=>{
 await sync([event('amore')]);assert.equal((await one('select count(*)::int n from ops_stays')).n,1);
 const token=(await one('select ops_claim_sync($1) token',[source.id])).token;assert.equal((await one('select ops_claim_sync($1) token',[source.id])).token,null);
 await assert.rejects(one('select ops_apply_sync($1,$2,$3,$4,null,1)',[source.id,crypto.randomUUID(),source.updated_at,'[]']),/lease_expired/);
 await one('select ops_apply_sync($1,$2,$3,$4,null,1)',[source.id,token,source.updated_at,JSON.stringify([event('amore')])]);
});
test('blocks and ambiguous periods do not generate stays/tasks',async()=>{
 await sync([event('amore'),event('blocked','2027-01-01','2027-01-03','block'),event('ambiguous','2027-02-01','2027-02-03','ambiguous')]);assert.equal((await one('select count(*)::int n from ops_stays')).n,1);
});
test('missing event and calendar failure retain stay and tasks with divergence',async()=>{
 await sync([]);await sync([], 'calendar_unreachable');assert.equal((await one("select status from ops_stays where external_id='amore'")).status,'confirmed');assert.equal((await one("select missing_count from ops_calendar_events where uid='amore'")).missing_count,1);assert.equal((await one('select last_error from ops_sync_state')).last_error,'calendar_unreachable');
});
test('manual record links to imported event without duplicates; external money stays separate',async()=>{
 const manual=await mutate('save_stay',{property_id:1,channel:'booking',check_in:'2027-03-01',check_out:'2027-03-03'});
 await sync([event('manual','2027-03-01','2027-03-03')]);const e=await one("select * from ops_calendar_events where uid='manual'");assert.equal(e.divergence,'possible_existing_stay_link_required');
 await mutate('classify',{event_id:e.id,kind:'stay',stay_id:manual.id});assert.equal((await one("select count(*)::int n from ops_stays where check_in='2027-03-01'")).n,1);assert.equal(manual.payment_origin,'external_channel');
});
test('native confirmed reservation feeds operation; hold never creates tasks',async()=>{
 await db.exec("insert into reservations(property_id,check_in,check_out,status,source) values(2,'2027-04-01','2027-04-03','hold','direct')");assert.equal((await one("select count(*)::int n from ops_stays where property_id=2")).n,0);
 await db.exec("update reservations set status='confirmed'");assert.equal((await one("select count(*)::int n from ops_stays where property_id=2")).n,1);
});
test('date change retains prior tasks, checklist version and evidence history',async()=>{
 const s=await one("select * from ops_stays where external_id='amore'");const t=await one("select * from ops_tasks where stay_id=$1 and stage='preparation'",[s.id]);
 await sync([event('amore','2026-10-10','2026-10-13')]);assert.equal((await one('select status from ops_tasks where id=$1',[t.id])).status,'cancelled');assert.equal((await one('select count(*)::int n from ops_tasks where stay_id=$1',[s.id])).n,4);
});
test('same-day turnover gets high priority and tight window is flagged',async()=>{
 await mutate('save_stay',{property_id:2,channel:'direct',check_in:'2027-04-03',check_out:'2027-04-04'});assert.equal((await one("select priority from ops_tasks t join ops_stays s on s.id=t.stay_id where s.check_in='2027-04-03' and stage='preparation'")).priority,'high');
 await db.exec("update properties set check_out_time='14:00' where id=2; select ops_refresh_tasks(2)");assert.equal((await one("select window_conflict from ops_tasks t join ops_stays s on s.id=t.stay_id where s.check_in='2027-04-03' and stage='preparation'")).window_conflict,true);
});
test('photo/checklist completion, immutable evidence and authorization',async()=>{
 const t=await one("select * from ops_tasks where property_id=1 and stage='preparation' and status='pending' order by created_at desc limit 1");
 await mutate('assign',{task_id:t.id,assigned_to:staff});await assert.rejects(mutate('status',{task_id:t.id,status:'in_progress'},other),/task_not_found/);
 await assert.rejects(mutate('status',{task_id:t.id,status:'inspection'},staff),/checklist_and_photos_required/);
 for(let i=0;i<t.checklist_snapshot.length;i++){
  await mutate('result',{task_id:t.id,item_index:i,result:'ok',observation:'QA'},staff);
  const upload_id=crypto.randomUUID(),p={task_id:t.id,item_index:i,upload_id,sha256:'qa',size_bytes:12,content_type:'image/jpeg'};
  await mutate('photo',p,staff);await mutate('photo',p,staff);await db.query('insert into storage.objects values($1,$2)',['operation-evidence',t.id+'/'+upload_id]);await mutate('photo',{...p,complete:true},staff);
 }
 assert.equal((await one('select count(*)::int n from ops_evidence where task_id=$1',[t.id])).n,t.checklist_snapshot.length);
 await mutate('status',{task_id:t.id,status:'inspection'},staff);await assert.rejects(mutate('status',{task_id:t.id,status:'approved'},staff),/admin_required/);await mutate('status',{task_id:t.id,status:'approved'});
 await assert.rejects(db.query('delete from ops_evidence where task_id=$1',[t.id]),/immutable/);
});
test('template edit versions do not rewrite task snapshot',async()=>{
 const before=await one('select * from ops_tasks limit 1');await mutate('template',{stage:'preparation',name:'QA revisão',items:['Um item novo']});assert.deepEqual((await one('select checklist_snapshot from ops_tasks where id=$1',[before.id])).checklist_snapshot,before.checklist_snapshot);
});
