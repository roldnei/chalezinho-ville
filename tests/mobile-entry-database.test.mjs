import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
before(async()=>{await db.exec('create role anon;create role authenticated;create role service_role;create table reservations(id uuid primary key);create table profiles(id uuid primary key);');await db.exec(readFileSync(new URL('../supabase/migrations/20261019174019_mobile_entry_instrumentation.sql',import.meta.url),'utf8'));});
after(()=>db.close());
test('migration starts in calibration with no start date, and anonymous clients cannot read or mutate measurement',async()=>{
 const initial=(await db.query('select * from mobile_entry_experiments')).rows[0];assert.equal(initial.status,'baseline');assert.equal(initial.started_at,null);
 for(const role of ['anon','authenticated'])for(const table of ['mobile_entry_experiments','mobile_entry_participants','mobile_entry_events','mobile_entry_outcomes']){
  const r=(await db.query("select has_table_privilege($1,$2,'SELECT') as read,has_table_privilege($1,$2,'INSERT') as write",[role,table])).rows[0];assert.deepEqual(r,{read:false,write:false});
 }
 assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'mobile_entry_%' and rowsecurity")).rows[0].n,4);
});
test('activation requires a fixed protocol; started hypothesis cannot be edited or reset',async()=>{
 await assert.rejects(()=>db.exec("update mobile_entry_experiments set status='running',started_at=now()"),/experiment_protocol_required|check/);
 await db.exec(`update mobile_entry_experiments set status='running',started_at=now(),protocol='{"primary_metric":"property_viewed","sample_per_arm":1100,"enrollment_days":28,"attribution_days":7}'`);
 await assert.rejects(()=>db.exec("update mobile_entry_experiments set protocol=protocol||'{\"sample_per_arm\":5}'"),/experiment_protocol_locked/);
 await assert.rejects(()=>db.exec("update mobile_entry_experiments set status='baseline'"),/experiment_protocol_locked/);
 await db.exec("update mobile_entry_experiments set status='paused'");
});
