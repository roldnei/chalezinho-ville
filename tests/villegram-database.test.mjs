import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id='4069a585-7cc6-48ad-9263-567358a45c0c';
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table public.profiles(id uuid primary key,role text,pms_access_status text);
 create table public.properties(id bigint primary key);create table public.experience_products(id uuid primary key);
 create table public.stay_offers(id uuid primary key);create table public.reservations(id uuid primary key);
 create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,name text,bucket_id text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261006170228_villegram_publications.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261007033341_villegram_stay_selection.sql',import.meta.url),'utf8'));
 await db.exec('insert into properties(id) values(1)');
 await db.query(`insert into villegram_publications(id,title,caption,type,media,cta,source_key) values($1,'Ville','Fotos reais','trust','[{"kind":"photo","url":"assets/real.webp"}]','dates','trust:test')`,[id]);
});
after(()=>db.close());
test('database denies direct anonymous/authenticated writes and drafts stay service-only',async()=>{
 for(const role of ['anon','authenticated']){
  const r=await db.query(`select has_table_privilege($1,'villegram_publications','SELECT') as can_read,has_table_privilege($1,'villegram_signals','INSERT') as can_write`,[role]);
  assert.deepEqual(r.rows[0],{can_read:false,can_write:false});
 }
 const r=await db.query(`select relrowsecurity from pg_class where relname like 'villegram_%' and relkind='r'`);
 assert.equal(r.rows.length,6);assert.ok(r.rows.every(x=>x.relrowsecurity));
 const b=await db.query(`select public,file_size_limit from storage.buckets where id='villegram-media'`);
 assert.deepEqual(b.rows[0],{public:false,file_size_limit:52428800});
});
test('natural view keys and generation identities deduplicate retries with different UUIDs',async()=>{
 await db.exec(`insert into villegram_signals(id,publication_id,visitor_id,session_id,view_id,kind) values(gen_random_uuid(),'${id}','${id}','${id}','${id}','view'),(gen_random_uuid(),'${id}','${id}','${id}','${id}','view') on conflict(view_id,kind,sequence) do nothing`);
 assert.equal((await db.query(`select count(*)::int as n from villegram_signals`)).rows[0].n,1);
 await db.exec(`insert into villegram_publications(title,caption,type,media,cta,source_key) values('Replacement','Never replaces edits','trust','[{"kind":"photo","url":"assets/real.webp"}]','dates','trust:test') on conflict(source_key) do nothing`);
 assert.equal((await db.query(`select title from villegram_publications where id='${id}'`)).rows[0].title,'Ville');
});
test('invalid publication cover/status and client payment signals fail in the database',async()=>{
 await assert.rejects(db.exec(`update villegram_publications set status='published' where id='${id}'`));
 await assert.rejects(db.exec(`update villegram_publications set cover_index=1 where id='${id}'`));
 await assert.rejects(db.exec(`insert into villegram_signals(id,publication_id,visitor_id,session_id,view_id,kind) values(gen_random_uuid(),'${id}','${id}','${id}','${id}','payment_confirmed')`));
});

test('fixed stay metadata requires exact choices and rejects stored prices or malformed dates',async()=>{
 const value={check_in:'2026-11-16',check_out:'2026-11-19',guests:2,rate_code:'refundable'};
 await db.query('update villegram_publications set property_id=1,stay_selection=$1 where id=$2',[JSON.stringify(value),id]);
 for(const extra of [{total_cents:1},{check_in:null},{rate_code:null},{check_in:'2026-02-30'},{check_out:value.check_in},{guests:2.5},{rate_code:'cheapest'}])await assert.rejects(db.query('update villegram_publications set stay_selection=$1 where id=$2',[JSON.stringify({...value,...extra}),id]));
 assert.deepEqual((await db.query('select stay_selection from villegram_publications where id=$1',[id])).rows[0].stay_selection,value);
});
