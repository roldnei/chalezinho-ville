-- DEV merchandising cache. Contains only public offer cards, never guest or payment data.
create table public.stay_showcase_cache (
 cache_key text primary key,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 checked_at timestamptz not null,
 refresh_after timestamptz not null
);
alter table public.stay_showcase_cache enable row level security;
revoke all on public.stay_showcase_cache from public, anon, authenticated;
grant select, insert, update, delete on public.stay_showcase_cache to service_role;
