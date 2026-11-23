-- Keep business history intact; summarize calendar polling metadata only.
set local lock_timeout = '3s';
create table ops_private.calendar_poll_daily (
 event_id uuid not null,
 day date not null,
 updates bigint not null default 1,
 first_observed_at timestamptz not null,
 last_observed_at timestamptz not null,
 first_missing_count integer not null,
 last_missing_count integer not null,
 last_seen_at timestamptz,
 primary key(event_id,day)
);
alter table ops_private.calendar_poll_daily enable row level security;
revoke all on ops_private.calendar_poll_daily from public,anon,authenticated;
grant usage on schema ops_private to service_role;
grant select,insert,update on ops_private.calendar_poll_daily to service_role;

create or replace function ops_private.audit() returns trigger
language plpgsql set search_path='' as $$
declare previous jsonb; current_row jsonb;
begin
 current_row=to_jsonb(new);
 if tg_op='UPDATE' then
  previous=to_jsonb(old);
  if tg_table_schema='public' and tg_table_name='ops_calendar_events'
   and (previous-array['last_seen_at','missing_count']) =
       (current_row-array['last_seen_at','missing_count']) then
   insert into ops_private.calendar_poll_daily as summary
    (event_id,day,first_observed_at,last_observed_at,
     first_missing_count,last_missing_count,last_seen_at)
   values(new.id,(now() at time zone 'America/Sao_Paulo')::date,now(),now(),
    old.missing_count,new.missing_count,new.last_seen_at)
   on conflict(event_id,day) do update set
    updates=summary.updates+1,
    last_observed_at=excluded.last_observed_at,
    last_missing_count=excluded.last_missing_count,
    last_seen_at=excluded.last_seen_at;
   return new;
  end if;
 end if;
 insert into public.ops_history(entity,entity_id,actor_id,operation,before_value,after_value)
 values(tg_table_name,coalesce(current_row->>'id',current_row->>'task_id'),
  nullif(coalesce(current_row->>'updated_by',current_row->>'actor_id',
   current_row->>'author_id',current_row->>'created_by'),'')::uuid,
  tg_op,previous,current_row);
 return new;
end $$;

-- The maintenance runs as the existing cron database owner, never a browser role.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('ops-calendar-poll-summary-retention','41 4 * * *',
   $job$delete from ops_private.calendar_poll_daily
    where day < (now() at time zone 'America/Sao_Paulo')::date - 30$job$);
 end if;
end $$;
