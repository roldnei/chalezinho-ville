-- Applied only to DEV. Existing offer interactions and financial contracts are preserved.
create table public.villegram_publications (
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
create index villegram_publications_feed on public.villegram_publications(status,featured desc,display_order,published_at);
create table public.villegram_automation (
 id int primary key check(id=1), enabled bool not null default true,auto_publish bool not null default false,
 frequency_hours int not null default 24 check(frequency_hours in(6,12,24,48,168)),max_offers int not null default 3 check(max_offers between 0 and 6),
 templates jsonb not null,last_generated_at timestamptz,updated_at timestamptz not null default now()
);
insert into public.villegram_automation(id,templates) values(1,'{"property":{"enabled":true,"title":"{name}","caption":"{description}","motion":"gentle"},"experience":{"enabled":true,"title":"{name}","caption":"{description}","motion":"romantic"},"offer":{"enabled":true,"title":"{name}","caption":"{description}","motion":"slow"},"trust":{"enabled":true,"title":"{name}","caption":"{description}","motion":"gentle"}}');
create table public.villegram_signals (
 id uuid primary key, publication_id uuid not null references public.villegram_publications(id),
 visitor_id uuid not null,session_id uuid not null,view_id uuid not null,
 kind text not null check(kind in ('view','progress','complete','repeat','skip','like','share','comment','property_open','experience_open','inclusions_open','dates_query','reservation_start')),
 sequence int not null default 0 check(sequence between 0 and 10000),loop int not null default 0 check(loop between 0 and 1000),
 active_ms int not null default 0 check(active_ms between 0 and 7200000),metadata jsonb not null default '{}',created_at timestamptz not null default now(),
 unique(view_id,kind,sequence)
);
create index villegram_signals_report on public.villegram_signals(created_at,publication_id);
create index villegram_signals_attribution on public.villegram_signals(publication_id,visitor_id,session_id,view_id) where kind='view';
create table public.villegram_attributions (
 id uuid primary key default gen_random_uuid(),reservation_id uuid not null unique references public.reservations(id),
 publication_id uuid not null references public.villegram_publications(id),visitor_id uuid not null,session_id uuid not null,view_id uuid not null,
 user_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index villegram_attributions_report on public.villegram_attributions(created_at,publication_id);
create table public.villegram_post_likes (
 publication_id uuid not null references public.villegram_publications(id),user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(publication_id,user_id)
);
create table public.villegram_post_comments (
 id uuid primary key,publication_id uuid not null references public.villegram_publications(id),user_id uuid not null references auth.users(id),
 display_name text not null check(length(display_name) between 1 and 80),body text not null check(length(body) between 1 and 500),
 status text not null default 'visible' check(status in('visible','removed')),created_at timestamptz not null default now(),removed_at timestamptz
);
create index villegram_post_comments_read on public.villegram_post_comments(publication_id,status,created_at desc);
create index villegram_post_comments_author on public.villegram_post_comments(user_id,created_at desc);
do $$declare t text;begin
 foreach t in array array['villegram_publications','villegram_automation','villegram_signals','villegram_attributions','villegram_post_likes','villegram_post_comments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
-- Draft/guest media stays private. Only the DEV service signs eligible published media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('villegram-media','villegram-media',false,52428800,array['image/webp','image/jpeg','video/mp4','video/webm']);
create policy villegram_media_team_upload on storage.objects for insert to authenticated
with check(bucket_id='villegram-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy villegram_media_team_read on storage.objects for select to authenticated
using(bucket_id='villegram-media' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
-- No guest upload or publication permission is enabled.
