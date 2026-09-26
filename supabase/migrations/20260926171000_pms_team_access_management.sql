-- Self-service PMS team access, invitations and auditable property scopes.

alter table public.profiles
  add column if not exists pms_access_status text not null default 'active',
  add column if not exists pms_position text,
  add column if not exists pms_last_access_at timestamptz;

alter table public.profiles drop constraint if exists profiles_pms_access_status_check;
alter table public.profiles add constraint profiles_pms_access_status_check
  check (pms_access_status in ('invited','active','suspended'));

create table if not exists public.pms_team_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  role text not null check (role in ('admin','host','staff','service_provider')),
  position text,
  property_ids bigint[] not null default '{}'::bigint[],
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pms_team_invitations_status_idx
  on public.pms_team_invitations(status,expires_at);
create index if not exists profiles_pms_scope_idx
  on public.profiles using gin(pms_property_ids);

alter table public.pms_team_invitations enable row level security;
revoke all on public.pms_team_invitations from public,anon,authenticated;
grant all on public.pms_team_invitations to service_role;

-- Preserve the access existing operators had before empty scope changed to "no property".
update public.profiles
set pms_property_ids = array(select id from public.properties where active=true order by id)
where role in ('host','staff','service_provider') and cardinality(pms_property_ids)=0;

comment on table public.pms_team_invitations is 'PMS operator invitations. Service-layer only; never exposed through the public Data API.';
comment on column public.profiles.pms_access_status is 'Operational login state independent from the guest account state.';
