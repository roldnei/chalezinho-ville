-- Private calendar credentials are server-only, never exposed through guest RLS.
create table public.property_calendar_exports (
 property_id bigint primary key references public.properties(id) on delete cascade,
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.property_calendar_sources (
 id uuid primary key default gen_random_uuid(),
 property_id bigint not null references public.properties(id) on delete cascade,
 provider text not null check(provider in ('booking','airbnb')),
 label text not null default '',
 feed_url text,
 enabled boolean not null default true,
 last_checked_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 event_count integer,
 updated_at timestamptz not null default now(),
 unique(property_id,provider)
);
alter table public.property_calendar_exports enable row level security;
alter table public.property_calendar_sources enable row level security;
revoke all on public.property_calendar_exports,public.property_calendar_sources from public,anon,authenticated;
grant all on public.property_calendar_exports,public.property_calendar_sources to service_role;
create function public.create_property_calendar_export() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.property_calendar_exports(property_id) values(new.id) on conflict do nothing; return new; end $$;
revoke all on function public.create_property_calendar_export() from public,anon,authenticated;
create trigger property_calendar_created after insert on public.properties for each row execute function public.create_property_calendar_export();
insert into public.property_calendar_exports(property_id) select id from public.properties on conflict do nothing;
-- Existing channels remain required until their links are migrated.
insert into public.property_calendar_sources(property_id,provider,enabled)
 select property_id,provider,active from public.property_integrations where provider in ('booking','airbnb')
 on conflict do nothing;
