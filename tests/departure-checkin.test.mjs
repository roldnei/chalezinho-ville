import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db=new PGlite(),admin='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002';
const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
let property=100,legacy,approvedPrep,approvedDeparture,intentional,worked,changed;
async function stay(channel='airbnb',today=false){
 const pid=++property;await db.query("insert into properties(id,name) values($1,'QA')",[pid]);
 return one("insert into ops_stays(property_id,channel,origin,payment_origin,check_in,check_out) select $1,$2,'manual','not_recorded',d+$3::int,d+$3::int+2 from (select (now() at time zone 'America/Sao_Paulo')::date d) x returning *",[pid,channel,today?0:5]);
}
const departure=s=>one("select * from ops_tasks where stay_id=$1 and stage='departure' and stay_version=$2",[s.id,s.version]);
async function approve(t){
 await db.query("update ops_tasks set checklist_snapshot='[]',item_rules_snapshot='[]',scheduled_for=now()-interval '1 hour',status='inspection' where id=$1",[t.id]);
 await db.query("update ops_tasks set status='approved',approved_by=$2,completed_at=now() where id=$1",[t.id,admin]);
}
before(async()=>{
 const original=await readFile(new URL('./multichannel-database.test.mjs',import.meta.url),'utf8');
 await db.exec(original.match(/await db.exec\(\x60([\s\S]*?)\x60\);/)[1].replaceAll('${admin}',admin).replaceAll('${staff}',staff).replaceAll('${other}','10000000-0000-4000-8000-000000000003'));
 for(const name of ['20261012162927_multichannel_operations.sql','20261012192148_multichannel_reconciliation_hardening.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec("alter table properties add column features jsonb default '{}';alter table ops_tasks add column cleaning_job_id uuid;alter table profiles add column full_name text;alter table auth.users add column phone text;alter table ops_stays add column is_test boolean default false not null;");
 for(const name of ['20261013010000_multichannel_task_time_eligibility.sql','20261013012000_multichannel_archival_persistence.sql','20261015133302_team_inspections.sql','20261015140247_inspection_reassignment_pending_uploads.sql','20261015150002_inspection_property_water_amenities.sql','20261015180248_link_standalone_preparation.sql','20261017231324_close_standalone_preparation.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 legacy=await stay();const dep=await departure(legacy);legacy.departureId=dep.id;
 await db.query('update ops_tasks set assigned_to=$2 where id=$1',[dep.id,staff]);
 const prep=await one("select * from ops_tasks where stay_id=$1 and stage='preparation'",[legacy.id]);await approve(prep);approvedPrep=await one('select * from ops_tasks where id=$1',[prep.id]);
 intentional=await stay();await db.query("update ops_tasks set status='cancelled' where id=$1",[(await departure(intentional)).id]);
 worked=await stay();await db.query("update ops_tasks set status='in_progress',started_at=now() where id=$1",[(await departure(worked)).id]);
 const historical=await stay();await approve(await departure(historical));approvedDeparture=await departure(historical);
 changed=await stay();
 await db.exec(await readFile(new URL('../supabase/migrations/20261022003235_departure_requires_checkin.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
test('migration defers untouched departures while retaining assignment, approved preparation and history',async()=>{
 const t=await departure(legacy);assert.equal(t.status,'cancelled');assert.equal(t.departure_waiting_check_in,true);assert.equal(t.assigned_to,staff);
 const prep=await one('select * from ops_tasks where id=$1',[approvedPrep.id]);delete prep.departure_waiting_check_in;assert.deepEqual(prep,approvedPrep);
 assert.ok((await one("select count(*)::int n from ops_history where entity_id=$1 and after_value->>'departure_waiting_check_in'='true'",[t.id])).n>0);
});
test('new confirmed stays in every channel create only preparation before check-in',async()=>{
 for(const channel of ['airbnb','booking','site','direct','other']){
  const s=await stay(channel);await db.query('select ops_refresh_tasks($1)',[s.property_id]);
  assert.equal((await rows('select stage from ops_tasks where stay_id=$1',[s.id])).length,1);assert.equal(await departure(s),undefined);
 }
});
test('approval of preparation alone never releases departure',async()=>{
 await db.query('select ops_refresh_tasks($1)',[legacy.property_id]);assert.equal((await departure(legacy)).status,'cancelled');
});
test('recording check-in creates exactly one departure and does not require preparation approval',async()=>{
 const s=await stay('booking',true);
 await db.query("select ops_mutate($1,'attendance',$2)",[admin,{stay_id:s.id,operation:'check_in'}]);
 assert.equal((await departure(s)).status,'pending');
 await db.query('select ops_refresh_tasks($1)',[s.property_id]);await db.query('select ops_refresh_tasks($1)',[s.property_id]);
 assert.equal((await one("select count(*)::int n from ops_tasks where stay_id=$1 and stage='departure'",[s.id])).n,1);
});
test('real check-in releases the same deferred task and keeps its assignee',async()=>{
 await db.query('update ops_stays set checked_in_at=now() where id=$1',[legacy.id]);
 const t=await departure(legacy);assert.equal(t.id,legacy.departureId);assert.equal(t.status,'pending');assert.equal(t.departure_waiting_check_in,false);assert.equal(t.assigned_to,staff);
});
test('manual cancellation never reopens and work already performed is retained',async()=>{
 await db.query('update ops_stays set checked_in_at=now() where id=$1',[intentional.id]);
 assert.equal((await departure(intentional)).status,'cancelled');assert.equal((await departure(intentional)).departure_waiting_check_in,false);
 assert.equal((await departure(worked)).status,'in_progress');
 const historic=await one('select * from ops_tasks where id=$1',[approvedDeparture.id]);delete historic.departure_waiting_check_in;assert.deepEqual(historic,approvedDeparture);
});
test('direct inserts, manual unlinked departures and premature reopening cannot bypass check-in',async()=>{
 const s=await stay();
 await assert.rejects(db.query("insert into ops_tasks(property_id,stay_id,stay_version,stage,title,scheduled_for,due_at) values($1,$2,1,'departure','Bypass',now(),now()+interval '1 hour')",[s.property_id,s.id]),/departure_requires_checkin/);
 await assert.rejects(db.query("select ops_mutate($1,'manual_task',$2)",[admin,{property_id:s.property_id,stage:'departure',title:'Bypass',scheduled_for:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString()}]),/departure_requires_checkin/);
 const t=await departure(changed);await assert.rejects(db.query("update ops_tasks set status='pending' where id=$1",[t.id]),/departure_requires_checkin/);
});
test('date changes release only the current version after check-in',async()=>{
 await db.query("update ops_stays set check_in=check_in+1,check_out=check_out+1 where id=$1",[changed.id]);
 await db.query('update ops_stays set checked_in_at=now() where id=$1',[changed.id]);
 const tasks=await rows("select * from ops_tasks where stay_id=$1 and stage='departure' order by stay_version",[changed.id]);
 assert.equal(tasks.length,2);assert.equal(tasks[0].status,'cancelled');assert.equal(tasks[1].status,'pending');assert.equal(tasks[1].stay_version,2);
});
test('cancelled stays cannot regenerate departure through repeated refresh',async()=>{
 const s=await stay();await db.query("update ops_stays set status='cancelled' where id=$1",[s.id]);await db.query('select ops_refresh_tasks($1)',[s.property_id]);assert.equal(await departure(s),undefined);
});
test('refresh remains private to service_role and the guard uses invoker security',async()=>{
 for(const role of ['anon','authenticated'])assert.equal((await one("select has_function_privilege($1,'ops_refresh_tasks(bigint)','execute') yes",[role])).yes,false);
 assert.equal((await one("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ops_private' and proname='departure_checkin_guard'")).prosecdef,false);
});
