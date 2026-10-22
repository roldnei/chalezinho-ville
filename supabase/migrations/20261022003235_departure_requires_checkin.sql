-- A confirmed booking is not evidence that a guest entered.
-- This flag preserves old placeholders and assignees without keeping them actionable.
alter table public.ops_tasks add column departure_waiting_check_in boolean not null default false;
comment on column public.ops_tasks.departure_waiting_check_in is
 'Untouched departure deferred until this stay has a recorded check-in; not a manual cancellation.';

-- Deferral is temporary; do not treat it as an owner's permanent archival.
create or replace function ops_private.retain_task_archival()
returns trigger language plpgsql security invoker set search_path='' as $archive$
begin
 new.suppressed_stages=array(select distinct stage from (
  select unnest(old.suppressed_stages) stage
  union select t.stage from public.ops_tasks t
   where t.stay_id=old.id and t.stay_version=old.version
    and t.status in ('cancelled','superseded') and not t.departure_waiting_check_in
 ) stages);
 return new;
end $archive$;

CREATE OR REPLACE FUNCTION public.ops_refresh_tasks(p_property bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.ops_stays;p public.properties;tpl public.ops_templates;stage_name text;arrival timestamptz;departure timestamptz;previous public.ops_stays;starts timestamptz;deadline timestamptz;conflict boolean;
begin
 perform pg_advisory_xact_lock(710122026);
 for s in select * from public.ops_stays where p_property is null or property_id=p_property loop
  update public.ops_tasks set status=case when status='approved' then 'superseded' else 'cancelled' end,updated_at=now()
   where stay_id=s.id and stay_version<>s.version and status not in ('superseded','cancelled');
  if s.is_test then
   update public.ops_tasks set status='superseded',notes=concat_ws(E'\n',nullif(notes,''),'Arquivada: registro de teste, não representa hospedagem real.'),updated_at=now()
    where stay_id=s.id and status in ('pending','in_progress','inspection','blocked');
   continue;
  end if;
  if s.status<>'confirmed' then
   update public.ops_tasks set status='cancelled',updated_at=now() where stay_id=s.id and status in ('pending','in_progress','blocked','inspection') and scheduled_for>=now();
   continue;
  end if;
  -- Keep prematurely generated, untouched departures out of the work queue.
  -- Preserve their IDs and assignments so an actual check-in can release them.
  if s.checked_in_at is null then
   update public.ops_tasks t set status='cancelled',departure_waiting_check_in=true,updated_at=now()
    where t.stay_id=s.id and t.stage='departure' and t.stay_version=s.version
     and t.status='pending' and t.started_at is null and t.submitted_at is null
     and t.completed_at is null and t.cleaning_job_id is null
     and not exists(select 1 from public.ops_task_results r where r.task_id=t.id)
     and not exists(select 1 from public.ops_evidence e where e.task_id=t.id);
  end if;
  select * into p from public.properties where id=s.property_id;
  arrival=(s.check_in+coalesce(p.check_in_time,'15:00'::time)) at time zone 'America/Sao_Paulo';
  departure=(s.check_out+coalesce(p.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo';
  -- Predicted occupancy is not attendance. Never backfill after the departure
  -- boundary or an owner's dated departure report. Existing work is retained.
  if s.checked_out_at is not null or s.departure_reported_on is not null or departure<=now() then continue;end if;
  select * into previous from public.ops_stays x where x.property_id=s.property_id and x.id<>s.id and x.status='confirmed' and not x.is_test and x.check_in<s.check_in order by x.check_out desc limit 1;
  foreach stage_name in array array['preparation','departure'] loop
   if stage_name=any(s.suppressed_stages) then continue;end if;
   if stage_name='departure' then
    if s.checked_in_at is null then continue;end if;
    -- Only our deferred placeholders may reopen; intentional cancellations stay closed.
    update public.ops_tasks set status='pending',departure_waiting_check_in=false,updated_at=now()
     where stay_id=s.id and stage='departure' and stay_version=s.version
      and status='cancelled' and departure_waiting_check_in and cleaning_job_id is null;
   end if;
   -- A preparation that was never generated before arrival is not a new duty.
   if stage_name='preparation' and (arrival<=now() or s.checked_in_at is not null) then continue;end if;
   select * into tpl from public.ops_templates where stage=stage_name and (property_id=s.property_id or property_id is null) order by property_id nulls last,version desc limit 1;
   if stage_name='preparation' then
    starts=greatest(arrival-interval '1 day',coalesce((previous.check_out+coalesce(p.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo',arrival-interval '1 day'));
    deadline=arrival-interval '30 minutes';conflict=starts+interval '2 hours'>deadline;
   else starts=departure;deadline=departure+interval '1 hour';conflict=false;end if;
   insert into public.ops_tasks(property_id,stay_id,stage,stay_version,title,scheduled_for,due_at,priority,window_conflict,previous_stay_id,template_id,template_version,checklist_snapshot)
    values(s.property_id,s.id,stage_name,s.version,case when stage_name='preparation' then 'Preparar · ' else 'Conferir saída · ' end||p.name,starts,deadline,case when conflict then 'urgent' when previous.check_out=s.check_in then 'high' else 'normal' end,conflict,case when stage_name='preparation' then previous.id end,tpl.id,tpl.version,tpl.items)
   on conflict(stay_id,stage,stay_version) do update set scheduled_for=excluded.scheduled_for,due_at=excluded.due_at,priority=excluded.priority,window_conflict=excluded.window_conflict,previous_stay_id=excluded.previous_stay_id
   where public.ops_tasks.status in ('pending','in_progress','blocked') and (public.ops_tasks.scheduled_for,public.ops_tasks.due_at,public.ops_tasks.window_conflict,public.ops_tasks.previous_stay_id) is distinct from (excluded.scheduled_for,excluded.due_at,excluded.window_conflict,excluded.previous_stay_id);
  end loop;
 end loop;
end $function$
;

-- Protect every creation/reopening path, including manual and external writers.
create or replace function ops_private.departure_checkin_guard()
returns trigger language plpgsql security invoker set search_path='' as $guard$
begin
 if new.stage='departure' and new.status not in ('cancelled','superseded') then
  if tg_op='UPDATE' then
   if (new.stage,new.stay_id,new.stay_version,new.property_id,new.status) is not distinct from
      (old.stage,old.stay_id,old.stay_version,old.property_id,old.status) then return new;end if;
   -- Retain historical completed work even if old attendance was never recorded.
   if old.status='approved' and new.status='approved' then return new;end if;
  end if;
  if not exists(select 1 from public.ops_stays s where s.id=new.stay_id
   and s.property_id=new.property_id and s.version=new.stay_version
   and s.checked_in_at is not null) then
   raise exception 'departure_requires_checkin';
  end if;
 end if;
 return new;
end $guard$;
revoke all on function ops_private.departure_checkin_guard() from public,anon,authenticated;
grant execute on function ops_private.departure_checkin_guard() to service_role;
create trigger ops_departure_checkin_guard before insert or update on public.ops_tasks
 for each row execute function ops_private.departure_checkin_guard();

-- Reconcile production and every existing stay with the same rule used by sync/check-in.
select public.ops_refresh_tasks();

