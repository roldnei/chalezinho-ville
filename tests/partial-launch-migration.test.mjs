import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('partial release migration preserves existing data, blocks public holds and is repeatable',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create schema storage; create schema extensions;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat(md5(random()::text),2),'hex')$$;
   create table profiles(id uuid primary key,role text,pms_access_status text);
   create table properties(id bigint primary key,cover_image text,gallery jsonb,updated_at timestamptz);
   create table experience_products(id uuid primary key);
   create table experience_media(id uuid primary key,media_url text);
   create table reservations(id uuid primary key default gen_random_uuid(),source text,status text);
   create table guarantees(id uuid primary key,reservation_id uuid references reservations(id),amount_cents bigint,captured_amount_cents bigint);
   create table incidents(id uuid primary key);
   create table cancellation_policy_rules(id uuid primary key);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid,name text,bucket_id text);
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
   insert into properties(id,gallery) values(1,'["original.webp"]');
   insert into reservations(source,status) values('airbnb','confirmed');`);
  const migration=await readFile(new URL('../supabase/migrations/20261012003749_partial_launch_compatibility.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const tokens=await db.query('select token from property_calendar_exports');
  await db.exec(migration);
  assert.deepEqual((await db.query('select token from property_calendar_exports')).rows,tokens.rows);
  assert.deepEqual((await db.query('select gallery from properties')).rows,[{gallery:['original.webp']}]);
  assert.equal((await db.query('select count(*)::int n from reservations')).rows[0].n,1);
  assert.equal((await db.query('select enabled from villegram_automation')).rows[0].enabled,false);
  await assert.rejects(db.exec("insert into reservations(source,status) values('direct','hold')"),/public_checkout_disabled/);
  await db.exec("insert into reservations(source,status) values('manual','confirmed')");
  const access=await db.query("select has_table_privilege('anon','property_calendar_sources','select') a,has_table_privilege('authenticated','launch_settings','update') b");
  assert.deepEqual(access.rows,[{a:false,b:false}]);
  const tables=await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relname in ('stay_offers','villegram_publications','property_calendar_sources','guarantee_refunds') and not relrowsecurity");
  assert.equal(tables.rows.length,0);
 } finally {await db.close()}
});
