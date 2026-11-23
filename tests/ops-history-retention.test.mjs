import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

const db = new PGlite();
const one = async sql => (await db.query(sql)).rows[0];
const count = async () => (await one('select count(*)::int n from public.ops_history')).n;
before(async () => {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema ops_private;revoke all on schema ops_private from public;
 create table public.ops_history(id bigint generated always as identity primary key,
  entity text,entity_id text,actor_id uuid,operation text,before_value jsonb,after_value jsonb,
  created_at timestamptz default now());
 create table public.ops_calendar_events(id uuid primary key default gen_random_uuid(),
  start_date date default '2099-01-01',end_date date default '2099-01-03',
  cancelled boolean default false,divergence text,kind text default 'stay',stay_id uuid,
  provider_sequence integer default 0,classification_by uuid,summary text default 'Reserved',
  missing_count integer default 0,last_seen_at timestamptz default now());
 create table public.ops_tasks(id uuid primary key default gen_random_uuid(),status text default 'pending',
  updated_by uuid,missing_count integer default 0,last_seen_at timestamptz default now());`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261122231752_ops_calendar_poll_history_retention.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger ops_audit after insert or update on public.ops_calendar_events
  for each row execute function ops_private.audit();
 create trigger ops_audit after insert or update on public.ops_tasks
  for each row execute function ops_private.audit();
 insert into public.ops_calendar_events default values;`);
});
after(() => db.close());

test('polling still updates timestamps and missing counters without full audit copies',async () => {
 const initial=await count();
 await db.exec("update public.ops_calendar_events set last_seen_at=last_seen_at+interval '10 minutes'");
 await db.exec('update public.ops_calendar_events set missing_count=missing_count+1');
 assert.equal(await count(),initial);
 const row=await one('select * from ops_private.calendar_poll_daily');
 assert.equal(Number(row.updates),2);
 assert.equal(row.first_missing_count,0);assert.equal(row.last_missing_count,1);
 assert.equal((await one('select missing_count from public.ops_calendar_events')).missing_count,1);
});
test('new divergence, dates, cancellation, classification and provider changes retain full history',async () => {
 for (const sql of ["divergence='missing_from_feed_review_required',missing_count=missing_count+1",
  "start_date='2099-01-02',end_date='2099-01-04'",'cancelled=true',"kind='block'",
  'stay_id=gen_random_uuid()','provider_sequence=1','classification_by=gen_random_uuid()',
  "summary='Changed booking'"]) {
  const initial=await count();
  await db.exec('update public.ops_calendar_events set '+sql);
  assert.equal(await count(),initial+1,sql);
 }
 const last=await one('select * from public.ops_history order by id desc limit 1');
 assert.equal(last.operation,'UPDATE');assert.ok(last.before_value);assert.ok(last.after_value);
});
test('repeated missing and reappearance counters remain correct while summarized',async () => {
 const initial=await count();
 await db.exec('update public.ops_calendar_events set missing_count=missing_count+1');
 await db.exec('update public.ops_calendar_events set missing_count=0,last_seen_at=now()');
 assert.equal(await count(),initial);
 await db.exec('update public.ops_calendar_events set divergence=null');
 assert.equal(await count(),initial+1);
});
test('other entities preserve full audit, actor attribution and no-op semantics',async () => {
 const initial=await count();
 await db.exec("insert into public.ops_tasks(updated_by) values('10000000-0000-4000-8000-000000000001')");
 await db.exec('update public.ops_tasks set missing_count=missing_count+1');
 await db.exec('update public.ops_tasks set status=status');
 assert.equal(await count(),initial+3);
 const row=await one('select * from public.ops_history order by id desc limit 1');
 assert.equal(row.actor_id,'10000000-0000-4000-8000-000000000001');
});
test('browser roles cannot read or mutate private summaries',async () => {
 for (const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from ops_private.calendar_poll_daily'),/permission denied/);
  await assert.rejects(db.query('delete from ops_private.calendar_poll_daily'),/permission denied/);
  await db.exec('reset role');
 }
});

test('cleanup requires a matching archive and retains useful immutable history',async () => {
 await db.exec(`create function ops_private.immutable() returns trigger language plpgsql as
  $$ begin raise exception 'history_is_immutable';end $$;
  create trigger ops_history_immutable before update or delete on public.ops_history
  for each row execute function ops_private.immutable();`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261123000804_ops_history_guarded_compaction.sql',import.meta.url),'utf8'));
 const event=await one('select to_jsonb(t) snapshot from public.ops_calendar_events t limit 1');
 const before=event.snapshot,after={...before,missing_count:before.missing_count+1};
 await db.query(`insert into public.ops_history(entity,entity_id,operation,before_value,after_value)
  values('ops_calendar_events',$1,'UPDATE',$2,$3)`,[before.id,before,after]);
 const predicate=`entity='ops_calendar_events' and operation='UPDATE' and before_value is not null
  and after_value is not null and before_value ?& array['last_seen_at','missing_count']
  and after_value ?& array['last_seen_at','missing_count']
  and before_value-array['last_seen_at','missing_count']=after_value-array['last_seen_at','missing_count']`;
 const useful=async()=>one(`select count(*)::int n,md5(jsonb_agg(to_jsonb(h) order by id)::text) hash
  from public.ops_history h where not (${predicate})`);
 const initial=await useful();
 await assert.rejects(db.query('delete from public.ops_history'),/history_is_immutable/);
 await assert.rejects(db.query("select ops_private.compact_verified_history(0,50000,1,'wrong')"),/archive_does_not_match/);
 assert.deepEqual(await useful(),initial);
 await assert.rejects(db.query('delete from public.ops_history'),/history_is_immutable/);
 const archive=await one(`with candidates as materialized(select * from public.ops_history where id>0 and id<=50000 and ${predicate}),
 grouped as(select entity_id,actor_id,before_value-array['last_seen_at','missing_count'] base,
  jsonb_agg(jsonb_build_array(id,created_at,before_value->'last_seen_at',before_value->'missing_count',
   after_value->'last_seen_at',after_value->'missing_count') order by id) entries,min(id) first_id
  from candidates group by entity_id,actor_id,before_value-array['last_seen_at','missing_count']),
 archive as(select jsonb_build_object('format','ops-history-archive-v1','entity','ops_calendar_events',
  'operation','UPDATE','row_count',(select count(*) from candidates),
  'groups',coalesce(jsonb_agg(to_jsonb(grouped)-'first_id' order by first_id),'[]'::jsonb))::text plaintext from grouped)
 select (select count(*)::int from candidates) n,encode(sha256(convert_to(plaintext,'UTF8')),'hex') sha from archive`);
 const removed=await db.query('select ops_private.compact_verified_history(0,50000,$1,$2) n',[archive.n,archive.sha]);
 assert.equal(Number(removed.rows[0].n),archive.n);
 assert.deepEqual(await useful(),initial);
 await assert.rejects(db.query('delete from public.ops_history'),/history_is_immutable/);
 await db.exec('set role service_role');
 await assert.rejects(db.query("select ops_private.compact_verified_history(0,50000,0,'x')"),/permission denied/);
 await db.exec('reset role');
});
