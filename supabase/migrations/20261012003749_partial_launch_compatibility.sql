-- Additive compatibility for the partial WhatsApp release. No financial RPCs, contracts, users or DEV records are copied.


-- Private calendar credentials are server-only, never exposed through guest RLS.
create table if not exists public.property_calendar_exports (
 property_id bigint primary key references public.properties(id) on delete cascade,
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.property_calendar_sources (
 id uuid primary key default gen_random_uuid(),
 property_id bigint not null references public.properties(id) on delete cascade,
 provider text not null check(provider in ('booking','airbnb','ical')),
 label text not null default '',
 feed_url text,
 enabled boolean not null default true,
 last_checked_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 event_count integer,
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
alter table public.property_calendar_exports enable row level security;
alter table public.property_calendar_sources enable row level security;
revoke all on public.property_calendar_exports,public.property_calendar_sources from public,anon,authenticated;
grant all on public.property_calendar_exports,public.property_calendar_sources to service_role;
create or replace function public.create_property_calendar_export() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.property_calendar_exports(property_id) values(new.id) on conflict do nothing; return new; end $$;
revoke all on function public.create_property_calendar_export() from public,anon,authenticated;
drop trigger if exists property_calendar_created on public.properties;
create trigger property_calendar_created after insert on public.properties for each row execute function public.create_property_calendar_export();
insert into public.property_calendar_exports(property_id) select id from public.properties on conflict do nothing;


create unique index if not exists property_calendar_source_url_unique on public.property_calendar_sources(property_id,md5(feed_url)) where deleted_at is null and feed_url is not null;

-- Development only. Existing reservations keep their original contracts.
create table if not exists public.stay_offers (
 id uuid primary key default gen_random_uuid(), name text not null, description text not null,
 property_ids bigint[] not null, product_ids uuid[] not null,
 min_nights integer not null default 1 check(min_nights between 1 and 365),
 max_nights integer check(max_nights>=min_nights and max_nights<=365),
 start_date date,end_date date,discount_bps integer not null default 500 check(discount_bps between 0 and 10000),
 discount_enabled boolean not null default true,media jsonb not null default '[]',
 status text not null default 'paused' check(status in ('active','paused')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cardinality(property_ids)>0),check(end_date is null or start_date is null or end_date>=start_date)
);
alter table public.stay_offers enable row level security;
revoke all on public.stay_offers from anon,authenticated;
grant all on public.stay_offers to service_role;


alter table public.stay_offers add column if not exists showcase jsonb not null default '{"enabled":false,"nights":[2,3],"horizon_days":21}'::jsonb, add column if not exists villegram jsonb not null default '{}'::jsonb;

-- DEV merchandising cache. Contains only public offer cards, never guest or payment data.
create table if not exists public.stay_showcase_cache (
 cache_key text primary key,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 checked_at timestamptz not null,
 refresh_after timestamptz not null
);
alter table public.stay_showcase_cache enable row level security;
revoke all on public.stay_showcase_cache from public, anon, authenticated;
grant select, insert, update, delete on public.stay_showcase_cache to service_role;


alter table public.stay_offers add column if not exists villegram jsonb not null default '{}'::jsonb;
create table if not exists public.villegram_likes (
 offer_id uuid not null references public.stay_offers(id), user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), primary key(offer_id,user_id)
);
create table if not exists public.villegram_comments (
 id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.stay_offers(id),
 user_id uuid not null references auth.users(id), display_name text not null check(length(display_name) between 1 and 80),
 body text not null check(length(body) between 1 and 500), status text not null default 'visible' check(status in ('visible','removed')),
 created_at timestamptz not null default now(), removed_at timestamptz
);
create index if not exists villegram_comments_offer on public.villegram_comments(offer_id,created_at desc);
create index if not exists villegram_comments_author on public.villegram_comments(user_id,created_at desc);
alter table public.villegram_likes enable row level security;
alter table public.villegram_comments enable row level security;
revoke all on public.villegram_likes,public.villegram_comments from anon,authenticated;
grant all on public.villegram_likes,public.villegram_comments to service_role;
-- Writes only through the existing authenticated booking engine, with moderation and limits.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('villegram-audio','villegram-audio',true,10485760,array['audio/mpeg','audio/mp4','audio/ogg','audio/wav'])
on conflict(id) do nothing;
drop policy if exists villegram_audio_admin_insert on storage.objects;
create policy villegram_audio_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='villegram-audio' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
-- Commit the processed image reference across public media, without changing contracts.
create or replace function public.villegram_replace_media(p_old text,p_new text) returns void language plpgsql security invoker set search_path=public as $$
begin
 update properties set cover_image=case when cover_image=p_old then p_new else cover_image end,
 gallery=replace(gallery::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,updated_at=now()
 where cover_image=p_old or gallery::text like '%'||p_old||'%';
 update experience_media set media_url=p_new where media_url=p_old;
 update stay_offers set media=replace(media::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,
 villegram=replace(villegram::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,updated_at=now()
 where media::text like '%'||p_old||'%' or villegram::text like '%'||p_old||'%';
end $$;
revoke all on function public.villegram_replace_media(text,text) from public,anon,authenticated;
grant execute on function public.villegram_replace_media(text,text) to service_role;


-- Existing offer interactions and financial contracts are preserved.
create table if not exists public.villegram_publications (
 id uuid primary key default gen_random_uuid(), author_id uuid references auth.users(id),
 author_name text not null default 'Equipe Chalezinho Ville',
 source text not null default 'manual' check(source in ('manual','automatic','guest_submission')),
 source_key text unique, type text not null check(type in ('property','experience','offer','trust')),
 title text not null check(length(title) between 1 and 140), caption text not null check(length(caption) between 1 and 3000),
 media jsonb not null check(jsonb_typeof(media)='array' and jsonb_array_length(media) between 1 and 8),
 cover_index int not null default 0, motion text not null default 'gentle',
 property_id bigint references public.properties(id), experience_id uuid references public.experience_products(id),offer_id uuid references public.stay_offers(id),
 cta text not null check(cta in ('property','experience','offer','dates')),
 status text not null default 'draft' check(status in ('draft','published','archived','pending_review')),
 display_order int not null default 0, featured bool not null default false,
 published_at timestamptz, expires_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cover_index>=0 and cover_index<jsonb_array_length(media)),check(status<>'published' or published_at is not null),
 check(expires_at is null or published_at is null or expires_at>published_at)
);
create index if not exists villegram_publications_feed on public.villegram_publications(status,featured desc,display_order,published_at);
create table if not exists public.villegram_automation (
 id int primary key check(id=1), enabled bool not null default false,auto_publish bool not null default false,
 frequency_hours int not null default 24 check(frequency_hours in(6,12,24,48,168)),max_offers int not null default 3 check(max_offers between 0 and 6),
 templates jsonb not null,last_generated_at timestamptz,updated_at timestamptz not null default now()
);
insert into public.villegram_automation(id,templates) values(1,'{"property":{"enabled":true,"title":"{name}","caption":"{description}","motion":"gentle"},"experience":{"enabled":true,"title":"{name}","caption":"{description}","motion":"romantic"},"offer":{"enabled":true,"title":"{name}","caption":"{description}","motion":"slow"},"trust":{"enabled":true,"title":"{name}","caption":"{description}","motion":"gentle"}}') on conflict(id) do nothing;
create table if not exists public.villegram_signals (
 id uuid primary key, publication_id uuid not null references public.villegram_publications(id),
 visitor_id uuid not null,session_id uuid not null,view_id uuid not null,
 kind text not null check(kind in ('view','progress','complete','repeat','skip','like','share','comment','property_open','experience_open','inclusions_open','dates_query','reservation_start')),
 sequence int not null default 0 check(sequence between 0 and 10000),loop int not null default 0 check(loop between 0 and 1000),
 active_ms int not null default 0 check(active_ms between 0 and 7200000),metadata jsonb not null default '{}',created_at timestamptz not null default now(),
 unique(view_id,kind,sequence)
);
create index if not exists villegram_signals_report on public.villegram_signals(created_at,publication_id);
create index if not exists villegram_signals_attribution on public.villegram_signals(publication_id,visitor_id,session_id,view_id) where kind='view';
create table if not exists public.villegram_attributions (
 id uuid primary key default gen_random_uuid(),reservation_id uuid not null unique references public.reservations(id),
 publication_id uuid not null references public.villegram_publications(id),visitor_id uuid not null,session_id uuid not null,view_id uuid not null,
 user_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists villegram_attributions_report on public.villegram_attributions(created_at,publication_id);
create table if not exists public.villegram_post_likes (
 publication_id uuid not null references public.villegram_publications(id),user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(publication_id,user_id)
);
create table if not exists public.villegram_post_comments (
 id uuid primary key,publication_id uuid not null references public.villegram_publications(id),user_id uuid not null references auth.users(id),
 display_name text not null check(length(display_name) between 1 and 80),body text not null check(length(body) between 1 and 500),
 status text not null default 'visible' check(status in('visible','removed')),created_at timestamptz not null default now(),removed_at timestamptz
);
create index if not exists villegram_post_comments_read on public.villegram_post_comments(publication_id,status,created_at desc);
create index if not exists villegram_post_comments_author on public.villegram_post_comments(user_id,created_at desc);
do $$declare t text;begin
 foreach t in array array['villegram_publications','villegram_automation','villegram_signals','villegram_attributions','villegram_post_likes','villegram_post_comments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
-- Draft/guest media stays private. Only the DEV service signs eligible published media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('villegram-media','villegram-media',false,52428800,array['image/webp','image/jpeg','video/mp4','video/webm']) on conflict(id) do nothing;
drop policy if exists villegram_media_team_upload on storage.objects;
create policy villegram_media_team_upload on storage.objects for insert to authenticated
with check(bucket_id='villegram-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
drop policy if exists villegram_media_team_read on storage.objects;
create policy villegram_media_team_read on storage.objects for select to authenticated
using(bucket_id='villegram-media' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
-- No guest upload or publication permission is enabled.


-- DEV only. Stores booking choices, never variable prices or payment data.
alter table public.villegram_publications add column if not exists stay_selection jsonb;
alter table public.villegram_publications drop constraint if exists villegram_stay_selection_valid;
alter table public.villegram_publications add constraint villegram_stay_selection_valid check (
 stay_selection is null or (
  property_id is not null and jsonb_typeof(stay_selection)='object'
  and stay_selection ?& array['check_in','check_out','guests','rate_code']
  and stay_selection - array['check_in','check_out','guests','rate_code'] = '{}'::jsonb
  and jsonb_typeof(stay_selection->'check_in')='string' and jsonb_typeof(stay_selection->'check_out')='string' and jsonb_typeof(stay_selection->'rate_code')='string'
  and (stay_selection->>'check_in') ~ '^\d{4}-\d{2}-\d{2}$'
  and (stay_selection->>'check_out') ~ '^\d{4}-\d{2}-\d{2}$'
  and (stay_selection->>'check_out')::date > (stay_selection->>'check_in')::date
  and (stay_selection->>'check_out')::date - (stay_selection->>'check_in')::date <= 90
  and jsonb_typeof(stay_selection->'guests')='number'
  and (stay_selection->>'guests') ~ '^([1-9]|1[0-2])$'
  and stay_selection->>'rate_code' in ('refundable','non_refundable')
 )
);


alter table public.guarantees add column if not exists refunded_amount_cents bigint not null default 0
 check(refunded_amount_cents>=0 and refunded_amount_cents<=captured_amount_cents);
alter table public.guarantees add column if not exists released_amount_cents bigint not null default 0
 check(released_amount_cents>=0 and released_amount_cents+captured_amount_cents<=amount_cents);
alter table public.guarantees add column if not exists release_confirmed boolean not null default false;

create table if not exists public.guarantee_refunds (
 id uuid primary key default gen_random_uuid(),
 reservation_id uuid not null references public.reservations(id),
 guarantee_id uuid not null references public.guarantees(id),
 actor_user_id uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 5 and 1000),
 requested_cents bigint not null check(requested_cents>0),
 confirmed_cents bigint not null default 0 check(confirmed_cents between 0 and requested_cents),
 prior_refunded_cents bigint not null check(prior_refunded_cents>=0),
 state text not null default 'prepared' check(state in('prepared','dispatching','uncertain','confirmed','failed')),
 operation_key uuid not null unique,
 provider_error_code text,
 created_at timestamptz not null default now(),confirmed_at timestamptz
);
alter table public.guarantee_refunds enable row level security;
revoke all on public.guarantee_refunds from public,anon,authenticated;
grant select,insert,update on public.guarantee_refunds to service_role;
create index if not exists guarantee_refunds_reservation on public.guarantee_refunds(reservation_id);


alter table public.guarantees add column if not exists attention_code text;

alter table public.incidents add column if not exists category text not null default 'damage', add column if not exists decision text not null default 'pending', add column if not exists actor_user_id uuid references auth.users(id), add column if not exists decided_at timestamptz;

alter table public.cancellation_policy_rules add column if not exists commercial_free_cancellation_hours integer not null default 0 check(commercial_free_cancellation_hours between 0 and 720);

-- Prepared only; do not apply to PROD before the reviewed release.
-- Service-only switch also protects direct authenticated Data API/RPC attempts.
create table if not exists public.launch_settings (
 id integer primary key check(id=1),
 public_booking_mode text not null check(public_booking_mode in ('whatsapp','checkout-development')),
 updated_at timestamptz not null default now()
);
alter table public.launch_settings enable row level security;
revoke all on public.launch_settings from public,anon,authenticated;
insert into public.launch_settings(id,public_booking_mode) values(1,'whatsapp') on conflict(id) do nothing;
create or replace function public.guard_consultation_reservation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.source='direct' and new.status in ('hold','pending_payment') and
  exists(select 1 from public.launch_settings where id=1 and public_booking_mode='whatsapp') then
   raise exception 'public_checkout_disabled';
 end if;
 return new;
end $$;
revoke all on function public.guard_consultation_reservation() from public,anon,authenticated;
drop trigger if exists consultation_new_reservation_guard on public.reservations;
create trigger consultation_new_reservation_guard before insert on public.reservations
for each row execute function public.guard_consultation_reservation();
