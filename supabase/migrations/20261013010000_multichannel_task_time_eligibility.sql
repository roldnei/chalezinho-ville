-- Additive eligibility repair; does not delete or bulk-archive existing work.
select pg_advisory_xact_lock(710122026);
alter table public.ops_stays add column departure_reported_on date;
alter table public.ops_stays add column departure_report_note text;
comment on column public.ops_stays.departure_reported_on is 'Dated departure evidence reported by the owner; not an invented precise checkout timestamp.';

create or replace function public.ops_refresh_tasks(p_property bigint default null) returns void language plpgsql set search_path='' as $$
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
  select * into p from public.properties where id=s.property_id;
  arrival=(s.check_in+coalesce(p.check_in_time,'15:00'::time)) at time zone 'America/Sao_Paulo';
  departure=(s.check_out+coalesce(p.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo';
  -- Predicted occupancy is not attendance. Never backfill after the departure
  -- boundary or an owner's dated departure report. Existing work is retained.
  if s.checked_out_at is not null or s.departure_reported_on is not null or departure<=now() then continue;end if;
  select * into previous from public.ops_stays x where x.property_id=s.property_id and x.id<>s.id and x.status='confirmed' and not x.is_test and x.check_in<s.check_in order by x.check_out desc limit 1;
  foreach stage_name in array array['preparation','departure'] loop
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
end $$;


-- Explicit fixtures must not obstruct real calendar reconciliation.
-- Additive continuation: preserve prior migrations and all historical evidence.
create or replace function public.ops_apply_sync(p_source uuid,p_token uuid,p_config_updated timestamptz,p_events jsonb,p_error text default null,p_attempts integer default 1) returns void language plpgsql set search_path='' as $$
declare src public.property_calendar_sources;ev jsonb;stored public.ops_calendar_events;stay public.ops_stays;sid uuid;kind text;conflicts integer;
begin
 perform pg_advisory_xact_lock(710122026);
 perform 1 from public.ops_sync_state where source_id=p_source and lease_id=p_token and lease_until>now() for update;
 if not found then raise exception 'sync_lease_expired';end if;
 select * into src from public.property_calendar_sources where id=p_source;
 if src.updated_at is distinct from p_config_updated or not src.enabled or src.deleted_at is not null then raise exception 'source_changed';end if;
 if p_error is null then
  if jsonb_typeof(p_events)<>'array' then raise exception 'invalid_events';end if;
  for ev in select value from jsonb_array_elements(p_events) loop
   select * into stored from public.ops_calendar_events where source_id=p_source and uid=ev->>'uid' for update;
   if stored.id is not null and coalesce((ev->>'sequence')::int,0)<stored.provider_sequence then
    update public.ops_calendar_events set last_seen_at=now(),missing_count=0,divergence='stale_provider_sequence' where id=stored.id;
    continue;
   end if;
   kind=case when stored.classification_by is not null then stored.kind else ev->>'kind' end;sid=stored.stay_id;
   insert into public.ops_calendar_events(source_id,uid,property_id,kind,start_date,end_date,summary,provider_sequence,cancelled)
    values(src.id,ev->>'uid',src.property_id,kind,(ev->>'start')::date,(ev->>'end')::date,ev->>'summary',(ev->>'sequence')::int,(ev->>'cancelled')::boolean)
   on conflict(source_id,uid) do update set kind=excluded.kind,start_date=excluded.start_date,end_date=excluded.end_date,summary=excluded.summary,provider_sequence=excluded.provider_sequence,cancelled=excluded.cancelled,last_seen_at=now(),missing_count=0,divergence=null returning * into stored;
   if (ev->>'cancelled')::boolean then
    if sid is not null then update public.ops_stays set status='cancelled',needs_review='explicit_calendar_cancellation' where id=sid and reservation_id is null;end if;
   elsif kind='stay' and ev->>'start' is not null and ev->>'end' is not null then
    if sid is null then
     select * into stay from public.ops_stays where property_id=src.property_id and channel=src.provider and external_id=ev->>'uid';
     sid=stay.id;
    end if;
    if sid is null then
     -- A matching manual/native stay is a review candidate, never an automatic guess.
     select count(*) into conflicts from public.ops_stays where property_id=src.property_id and status='confirmed' and not is_test and check_in<(ev->>'end')::date and check_out>(ev->>'start')::date;
     if conflicts>0 then update public.ops_calendar_events set divergence='possible_existing_stay_link_required' where id=stored.id;continue;end if;
     insert into public.ops_stays(property_id,channel,external_id,origin,check_in,check_out,payment_origin)
      values(src.property_id,case when src.provider in ('airbnb','booking') then src.provider else 'other' end,ev->>'uid','calendar',(ev->>'start')::date,(ev->>'end')::date,'external_channel') returning id into sid;
    else
     select * into stay from public.ops_stays where id=sid;
     if stay.reservation_id is null and exists(select 1 from public.ops_stays x where x.id<>sid and x.property_id=src.property_id and x.status='confirmed' and not x.is_test and x.check_in<(ev->>'end')::date and x.check_out>(ev->>'start')::date) then
      update public.ops_calendar_events set divergence='date_change_overlap_review_required' where id=stored.id;
      update public.ops_stays set needs_review='date_change_overlap_review_required' where id=sid and needs_review is distinct from 'date_change_overlap_review_required';
     elsif stay.reservation_id is null then
      update public.ops_stays set check_in=(ev->>'start')::date,check_out=(ev->>'end')::date,needs_review=case when status='cancelled' then 'calendar_reappeared_after_cancellation' else null end where id=sid and (check_in,check_out,needs_review) is distinct from ((ev->>'start')::date,(ev->>'end')::date,case when status='cancelled' then 'calendar_reappeared_after_cancellation' else null end);
     elsif (stay.check_in,stay.check_out) is distinct from ((ev->>'start')::date,(ev->>'end')::date) then
      update public.ops_calendar_events set divergence='linked_reservation_dates_differ' where id=stored.id;
     end if;
    end if;
    update public.ops_calendar_events set stay_id=sid where id=stored.id and stay_id is distinct from sid;
   elsif sid is not null then
    update public.ops_calendar_events set divergence='classification_changed_review_required' where id=stored.id;
   end if;
  end loop;
  update public.ops_calendar_events set missing_count=missing_count+1,divergence='missing_from_feed_review_required' where source_id=p_source and not exists(select 1 from jsonb_array_elements(p_events) e where e->>'uid'=uid);
  -- Missing events only create a divergence. No cancellation or deletion.
  update public.ops_sync_state set last_success_at=now(),last_error=null,consecutive_failures=0 where source_id=p_source;
 else
  update public.ops_sync_state set last_error=p_error,consecutive_failures=consecutive_failures+1 where source_id=p_source;
 end if;
 update public.ops_sync_runs set status=case when p_error is null then 'success' else 'failed' end,finished_at=now(),attempts=p_attempts,event_count=case when p_error is null then jsonb_array_length(p_events) end,error=p_error where id=p_token;
 update public.ops_sync_state set lease_id=null,lease_until=null where source_id=p_source;
end $$;

create or replace function public.ops_mutate(p_actor uuid,p_action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare actor public.profiles;t public.ops_tasks;s public.ops_stays;e public.ops_calendar_events;tpl public.ops_templates;pid bigint;result jsonb;item integer;next_status text;token uuid;v integer;member public.profiles;
begin
 perform pg_advisory_xact_lock(710122026);
 select * into actor from public.profiles where id=p_actor;
 if actor.id is null or actor.pms_access_status<>'active' or actor.role not in ('admin','host','staff','service_provider') then raise exception 'permission_denied';end if;
 if p_action in ('save_stay','classify','template','manual_task') and actor.role<>'admin' then raise exception 'admin_required';end if;
 if p_action='template' then
  pid=nullif(p->>'property_id','')::bigint;
  if p->>'stage' not in ('preparation','departure') or jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 50 or exists(select 1 from jsonb_array_elements(p->'items') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 180) then raise exception 'invalid_checklist';end if;
  select coalesce(max(version),0)+1 into v from public.ops_templates where property_id is not distinct from pid and stage=p->>'stage';
  insert into public.ops_templates(property_id,stage,name,version,items,created_by) values(pid,p->>'stage',left(p->>'name',120),v,p->'items',actor.id) returning to_jsonb(ops_templates.*) into result;return result;
 end if;
 if p_action='save_stay' then
  if p->>'id' is not null then select * into s from public.ops_stays where id=(p->>'id')::uuid for update;if s.id is null or s.is_test or s.reservation_id is not null then raise exception 'use_reservation_flow';end if;end if;
  pid=(p->>'property_id')::bigint;
  if s.id is not null and p ? 'expected_version' and (p->>'expected_version')::int<>s.version then raise exception 'stay_changed_reload';end if;
  if s.id is not null and exists(select 1 from public.ops_calendar_events where stay_id=s.id) and
   (pid,p->>'channel',nullif(p->>'external_id','')) is distinct from (s.property_id,s.channel,s.external_id) then raise exception 'linked_identity_locked';end if;
  if exists(select 1 from public.ops_stays where property_id=pid and status='confirmed' and not is_test and id is distinct from s.id and check_in<(p->>'check_out')::date and check_out>(p->>'check_in')::date) then raise exception 'existing_stay_link_required';end if;
  if s.id is null then
   insert into public.ops_stays(property_id,channel,external_id,origin,check_in,check_out,guest_name,guest_phone,guests,payment_origin,notes,created_by,updated_by)
    values(pid,p->>'channel',nullif(p->>'external_id',''),'manual',(p->>'check_in')::date,(p->>'check_out')::date,nullif(p->>'guest_name',''),nullif(p->>'guest_phone',''),nullif(p->>'guests','')::int,case when p->>'channel' in ('airbnb','booking') then 'external_channel' else 'not_recorded' end,p->>'notes',actor.id,actor.id) returning * into s;
  else
   update public.ops_stays set property_id=pid,channel=p->>'channel',external_id=nullif(p->>'external_id',''),payment_origin=case when p->>'channel' in ('airbnb','booking') then 'external_channel' else 'not_recorded' end,check_in=(p->>'check_in')::date,check_out=(p->>'check_out')::date,guest_name=nullif(p->>'guest_name',''),guest_phone=nullif(p->>'guest_phone',''),guests=nullif(p->>'guests','')::int,notes=p->>'notes',updated_by=actor.id where id=s.id returning * into s;
  end if;return to_jsonb(s);
 end if;
 if p_action='classify' then
  select * into e from public.ops_calendar_events where id=(p->>'event_id')::uuid for update;
  if e.id is null then raise exception 'event_not_found';end if;
  if e.stay_id is not null and e.stay_id::text is distinct from p->>'stay_id' then raise exception 'already_linked';end if;
  if p->>'kind'='stay' then
   select * into s from public.ops_stays where id=nullif(p->>'stay_id','')::uuid and not is_test;
   if s.id is null then
    if e.start_date is null or e.end_date is null then raise exception 'manual_dates_required';end if;
    if exists(select 1 from public.ops_stays where property_id=e.property_id and status='confirmed' and not is_test and check_in<e.end_date and check_out>e.start_date) then raise exception 'existing_stay_link_required';end if;
    insert into public.ops_stays(property_id,channel,external_id,origin,check_in,check_out,payment_origin,created_by,updated_by)
    select e.property_id,case when provider in ('airbnb','booking') then provider else 'other' end,e.uid,'calendar',e.start_date,e.end_date,'external_channel',actor.id,actor.id from public.property_calendar_sources where id=e.source_id returning * into s;
   end if;
   if s.property_id<>e.property_id or s.check_in<>e.start_date or s.check_out<>e.end_date then raise exception 'link_dates_or_property_differ';end if;
   update public.ops_calendar_events set stay_id=s.id,kind='stay',classification_by=actor.id,classification_at=now(),divergence=null where id=e.id returning to_jsonb(ops_calendar_events.*) into result;
  else
   if e.stay_id is not null then raise exception 'already_linked';end if;
   update public.ops_calendar_events set kind=p->>'kind',classification_by=actor.id,classification_at=now(),divergence=null where id=e.id returning to_jsonb(ops_calendar_events.*) into result;
  end if;return result;
 end if;
 if p_action='attendance' then
  select * into s from public.ops_stays where id=(p->>'stay_id')::uuid for update;
  if actor.role<>'admin' or s.id is null then raise exception 'admin_required';end if;
  if s.reservation_id is not null then raise exception 'use_reservation_flow';end if;
  if p->>'operation'='cancel' then update public.ops_stays set status='cancelled',updated_by=actor.id where id=s.id returning to_jsonb(ops_stays.*) into result;
  elsif p->>'operation'='check_in' and s.status='confirmed' and s.checked_in_at is null and (now() at time zone 'America/Sao_Paulo')::date between s.check_in and s.check_out then
   update public.ops_stays set checked_in_at=now(),updated_by=actor.id where id=s.id returning to_jsonb(ops_stays.*) into result;
  elsif p->>'operation'='check_out' and s.status='confirmed' and s.checked_out_at is null and (now() at time zone 'America/Sao_Paulo')::date>=s.check_in and length(coalesce(p->>'note',''))>=5 then
   update public.ops_stays set checked_out_at=now(),notes=concat_ws(E'\n',notes,p->>'note'),updated_by=actor.id where id=s.id returning to_jsonb(ops_stays.*) into result;
  else raise exception 'attendance_not_allowed';end if;return result;
 end if;
 if p_action='manual_task' then
  if (p->>'scheduled_for')::timestamptz >= (p->>'due_at')::timestamptz then raise exception 'invalid_task_window';end if;
  select * into tpl from public.ops_templates where stage=p->>'stage' and (property_id=(p->>'property_id')::bigint or property_id is null) order by property_id nulls last,version desc limit 1;
  insert into public.ops_tasks(property_id,stage,title,scheduled_for,due_at,template_id,template_version,checklist_snapshot,notes,created_by)
   values((p->>'property_id')::bigint,p->>'stage',left(p->>'title',180),(p->>'scheduled_for')::timestamptz,(p->>'due_at')::timestamptz,tpl.id,tpl.version,tpl.items,p->>'notes',actor.id) returning to_jsonb(ops_tasks.*) into result;return result;
 end if;
 select * into t from public.ops_tasks where id=(p->>'task_id')::uuid for update;
 if t.id is null or (actor.role<>'admin' and (not coalesce(t.property_id=any(actor.pms_property_ids),false) or not coalesce((actor.pms_permissions->>'housekeeping')::boolean,false) or t.assigned_to is distinct from actor.id)) then raise exception 'task_not_found';end if;
 if p_action='assign' then
  if actor.role<>'admin' then raise exception 'admin_required';end if;
  if nullif(p->>'assigned_to','') is not null then
   select * into member from public.profiles where id=(p->>'assigned_to')::uuid;
   if member.id is null or member.pms_access_status<>'active' or member.role not in ('admin','host','staff','service_provider') or (member.role<>'admin' and (not coalesce(t.property_id=any(member.pms_property_ids),false) or not coalesce((member.pms_permissions->>'housekeeping')::boolean,false))) then raise exception 'invalid_assignee';end if;
  end if;
  update public.ops_tasks set assigned_to=nullif(p->>'assigned_to','')::uuid,updated_by=actor.id where id=t.id returning to_jsonb(ops_tasks.*) into result;
 elsif p_action='result' then
  if t.stage='departure' and t.scheduled_for>now() then raise exception 'departure_not_due';end if;
  insert into public.ops_task_results(task_id,item_index,result,observation,actor_id) values(t.id,(p->>'item_index')::int,p->>'result',left(p->>'observation',2000),actor.id)
   on conflict(task_id,item_index) do update set result=excluded.result,observation=excluded.observation,actor_id=excluded.actor_id,updated_at=now() returning to_jsonb(ops_task_results.*) into result;
 elsif p_action='status' then
  next_status=p->>'status';
  if next_status not in ('in_progress','inspection','approved','blocked','pending') then raise exception 'invalid_status';end if;
  if (next_status in ('approved','pending') or t.status in ('inspection','approved','cancelled','superseded')) and actor.role<>'admin' then raise exception 'admin_required';end if;
  if t.status in ('cancelled','superseded') then raise exception 'task_locked';end if;
  if t.stage='departure' and t.scheduled_for>now() then raise exception 'departure_not_due';end if;
  update public.ops_tasks set status=next_status,updated_by=actor.id,updated_at=now(),
   started_at=case when next_status='in_progress' then coalesce(started_at,now()) else started_at end,
   submitted_at=case when next_status='inspection' then now() else submitted_at end,
   executed_by=case when next_status='inspection' then actor.id else executed_by end,
   completed_at=case when next_status='approved' then now() when next_status='pending' then null else completed_at end,
   approved_by=case when next_status='approved' then actor.id when next_status='pending' then null else approved_by end where id=t.id returning to_jsonb(ops_tasks.*) into result;
 elsif p_action='photo' then
  if t.stage='departure' and t.scheduled_for>now() then raise exception 'departure_not_due';end if;
  token=(p->>'upload_id')::uuid;item=(p->>'item_index')::int;
  if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if item<0 or item>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;
  if exists(select 1 from public.ops_evidence where id=token and (task_id<>t.id or item_index<>item or sha256<>p->>'sha256' or author_id<>actor.id)) then raise exception 'upload_key_conflict';end if;
  insert into public.ops_evidence(id,task_id,property_id,stay_id,stage,item_index,storage_path,content_type,size_bytes,sha256,author_id)
   values(token,t.id,t.property_id,t.stay_id,t.stage,item,t.id::text||'/'||token::text, p->>'content_type',(p->>'size_bytes')::int,p->>'sha256',actor.id) on conflict(id) do nothing;
  if p->>'complete'='true' then
   if not exists(select 1 from storage.objects where bucket_id='operation-evidence' and name=t.id::text||'/'||token::text) then raise exception 'upload_not_found';end if;
   update public.ops_evidence set status='ready',completed_at=coalesce(completed_at,now()) where id=token;
  end if;
  select to_jsonb(x) into result from public.ops_evidence x where id=token;
 else raise exception 'invalid_action';end if;
 return result;
end $$;

-- Record reconciliation failures without releasing a newer worker's fenced lease.
create or replace function public.ops_fail_sync(p_source uuid,p_token uuid,p_error text) returns void language plpgsql set search_path='' as $$
begin
 update public.ops_sync_state set last_error=left(p_error,180),consecutive_failures=consecutive_failures+1,lease_id=null,lease_until=null where source_id=p_source and lease_id=p_token;
 if found then update public.ops_sync_runs set status='failed',error=left(p_error,180),finished_at=now() where id=p_token and status='running';end if;
end $$;
revoke all on function public.ops_fail_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ops_fail_sync(uuid,uuid,text) to service_role;
