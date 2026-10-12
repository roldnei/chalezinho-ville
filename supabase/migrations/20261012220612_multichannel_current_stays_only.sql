-- No historical task backfill. Existing evidence/results/history are retained.
-- Serialize with generation so cleanup cannot race an in-flight refresh.
select pg_advisory_xact_lock(710122026);

create or replace function public.ops_refresh_tasks(p_property bigint default null) returns void language plpgsql set search_path='' as $$
declare s public.ops_stays;p public.properties;tpl public.ops_templates;stage_name text;arrival timestamptz;departure timestamptz;previous public.ops_stays;starts timestamptz;deadline timestamptz;conflict boolean;
begin
 perform pg_advisory_xact_lock(710122026);
 for s in select * from public.ops_stays where p_property is null or property_id=p_property loop
  update public.ops_tasks set status=case when status='approved' then 'superseded' else 'cancelled' end,updated_at=now()
   where stay_id=s.id and stay_version<>s.version and status not in ('superseded','cancelled');
  if s.status<>'confirmed' then
   update public.ops_tasks set status='cancelled',updated_at=now() where stay_id=s.id and status in ('pending','in_progress','blocked','inspection') and scheduled_for>=now();
   continue;
  end if;
  -- Only generate for current/upcoming stays without a recorded checkout.
  -- A date cutoff is an eligibility rule, never proof of actual attendance.
  -- Keep tasks already generated while active: departure inspection still needs
  -- to be completed after checkout and must not disappear on tomorrow's sync.
  if s.checked_out_at is not null
     or s.check_out < (now() at time zone 'America/Sao_Paulo')::date then
   continue;
  end if;
  select * into p from public.properties where id=s.property_id;
  arrival=(s.check_in+coalesce(p.check_in_time,'15:00'::time)) at time zone 'America/Sao_Paulo';
  departure=(s.check_out+coalesce(p.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo';
  select * into previous from public.ops_stays x where x.property_id=s.property_id and x.id<>s.id and x.status='confirmed' and x.check_in<s.check_in order by x.check_out desc limit 1;
  foreach stage_name in array array['preparation','departure'] loop
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
end $$;

-- One-time repair of historical pending work created by the original backfill.
-- Do not touch manual tasks, completed tasks, attendance or source reservations.
update public.ops_tasks t
set status='superseded',
    notes=concat_ws(E'\n',nullif(t.notes,''),'Arquivada: geração retroativa para hospedagem com saída anterior à implantação ou checkout já registrado.'),
    updated_at=now()
from public.ops_stays s
where t.stay_id=s.id
  and t.status in ('pending','in_progress','inspection','blocked')
  and (s.checked_out_at is not null
       or s.check_out < (now() at time zone 'America/Sao_Paulo')::date);
