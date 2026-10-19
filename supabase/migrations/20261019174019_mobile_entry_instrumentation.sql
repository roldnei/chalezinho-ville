-- Independent of financial checkout. Public clients never access these tables.
create table public.mobile_entry_experiments (
 id text primary key, status text not null default 'baseline' check(status in ('baseline','running','paused','completed')),
 started_at timestamptz, ended_at timestamptz, protocol jsonb not null default '{}',
 created_at timestamptz not null default now(),
 check(status <> 'running' or (started_at is not null and protocol ?& array['primary_metric','sample_per_arm','enrollment_days','attribution_days']))
);
insert into public.mobile_entry_experiments(id) values('mobile-home-v1');
create table public.mobile_entry_participants (
 id uuid primary key, experiment_id text not null references public.mobile_entry_experiments,
 visitor_id uuid not null, phase text not null check(phase in ('baseline','test')),
 variant text not null check(variant in ('baseline','A','B')), reference text not null unique,
 os text not null check(os in ('ios','android')), source text not null,
 campaign text, excluded boolean not null default false,
 assigned_at timestamptz not null default now(),
 unique(experiment_id,visitor_id,phase),
 check((phase='baseline' and variant='baseline') or (phase='test' and variant in ('A','B')))
);
create table public.mobile_entry_events (
 id uuid primary key, participant_id uuid not null references public.mobile_entry_participants,
 event_name text not null check(event_name in ('entry_rendered','property_viewed','search_started','search_completed','consultation_prepared','whatsapp_clicked','summary_copied','entry_failed','search_failed','performance')),
 property_code text, details jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create index mobile_entry_events_participant_time on public.mobile_entry_events(participant_id,occurred_at);
create index mobile_entry_events_time on public.mobile_entry_events(occurred_at);
create table public.mobile_entry_outcomes (
 participant_id uuid not null references public.mobile_entry_participants,
 kind text not null check(kind in ('request_received','reservation_confirmed')),
 reservation_id uuid references public.reservations,
 actor_id uuid not null references public.profiles, occurred_at timestamptz not null default now(),
 primary key(participant_id,kind),
 check(kind <> 'reservation_confirmed' or reservation_id is not null)
);
create unique index mobile_entry_reservation_once on public.mobile_entry_outcomes(reservation_id) where reservation_id is not null;
do $$declare t text;begin
 foreach t in array array['mobile_entry_experiments','mobile_entry_participants','mobile_entry_events','mobile_entry_outcomes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- Changing the hypothesis midway must use a new experiment ID.
create function public.guard_mobile_entry_protocol() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.started_at is not null and (new.protocol is distinct from old.protocol or new.started_at is distinct from old.started_at or new.status='baseline') then
  raise exception 'experiment_protocol_locked';
 end if;
 if new.status='running' then
  if coalesce(new.protocol->>'primary_metric','') not in ('property_viewed','request_received') or
     coalesce((new.protocol->>'sample_per_arm')::int,0)<1 or
     coalesce((new.protocol->>'enrollment_days')::int,0)<14 or
     coalesce((new.protocol->>'attribution_days')::int,0)<1 or
     coalesce((new.protocol->>'attribution_days')::int,0)>30 then raise exception 'experiment_protocol_required';end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_mobile_entry_protocol() from public,anon,authenticated;
create trigger mobile_entry_protocol_guard before update on public.mobile_entry_experiments for each row execute function public.guard_mobile_entry_protocol();
