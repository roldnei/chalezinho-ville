-- DEV applied first; production requires a separately approved rollout.
-- Catalog housekeeping only. Never touches reservations, holds, financial rows or media.
create or replace function stay_internal.pause_expired_offers()
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare affected integer;
begin
 with expired as materialized (
  select o.id,to_jsonb(o) as old_value from public.stay_offers o
  where o.status='active' and o.end_date is not null
    and o.end_date-o.min_nights < (now() at time zone 'America/Sao_Paulo')::date
  for update
 ), paused as (
  update public.stay_offers o set status='paused',updated_at=now()
  from expired e where o.id=e.id returning o.id,e.old_value,to_jsonb(o) as new_value
 )
 insert into public.audit_events(action,entity_type,entity_id,old_value,new_value)
 select 'stay_offer_auto_paused','stay_offer',id::text,old_value,new_value from paused;
 get diagnostics affected = row_count;
 return affected;
end $$;
revoke all on function stay_internal.pause_expired_offers() from public,anon,authenticated;
grant execute on function stay_internal.pause_expired_offers() to service_role;
-- Public reads reject expired dates immediately; this job persists the PMS status.
select cron.schedule('stay-offer-expiry','3 * * * *','select stay_internal.pause_expired_offers();');
