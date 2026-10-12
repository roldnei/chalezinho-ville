-- Additive operational ledger. No OTA payment is inserted in reservations/payments.
create schema if not exists ops_private;
revoke all on schema ops_private from public,anon,authenticated;
create table public.ops_stays (
 id uuid primary key default gen_random_uuid(), property_id bigint not null references public.properties(id),
 reservation_id uuid unique references public.reservations(id), channel text not null check(channel in ('airbnb','booking','site','direct','other')),
 external_id text, origin text not null check(origin in ('calendar','manual','reservation')), status text not null default 'confirmed' check(status in ('confirmed','cancelled','no_show')),
 check_in date not null, check_out date not null check(check_out>check_in), guest_name text, guest_phone text, guests integer check(guests>0),
 payment_origin text not null check(payment_origin in ('external_channel','site','not_recorded')),
 checked_in_at timestamptz, checked_out_at timestamptz, version integer not null default 1,
 needs_review text, notes text, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(property_id,channel,external_id)
);
create table public.ops_calendar_events (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.property_calendar_sources(id), uid text not null,
 property_id bigint not null references public.properties(id), kind text not null check(kind in ('stay','block','maintenance','ambiguous')),
 classification_by uuid references auth.users(id), classification_at timestamptz, stay_id uuid references public.ops_stays(id),
 start_date date, end_date date, summary text, provider_sequence integer not null default 0, cancelled boolean not null default false,
 missing_count integer not null default 0, divergence text, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 unique(source_id,uid)
);
create table public.ops_sync_state (
 source_id uuid primary key references public.property_calendar_sources(id), lease_id uuid, lease_until timestamptz,
 last_attempt_at timestamptz,last_success_at timestamptz,last_error text,consecutive_failures integer not null default 0
);
create table public.ops_sync_runs (
 id uuid primary key,source_id uuid not null references public.property_calendar_sources(id), started_at timestamptz not null default now(),
 finished_at timestamptz,status text not null default 'running',attempts integer not null default 0,event_count integer,error text
);
create table public.ops_templates (
 id uuid primary key default gen_random_uuid(), property_id bigint references public.properties(id), stage text not null check(stage in ('preparation','departure')),
 name text not null, version integer not null, items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
 created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create unique index ops_template_version on public.ops_templates(coalesce(property_id,0),stage,version);
insert into public.ops_templates(stage,name,version,items) values
 ('preparation','Preparação antes da entrada',1,'["Cama e enxoval","Toalhas","Banheiro e ralos","Hidro / spa","Taças e utensílios","Área externa"]'),
 ('departure','Conferência após a saída',1,'["Estado geral e itens esquecidos","Enxoval e toalhas","Banheiro e hidro / spa","Utensílios e equipamentos","Área externa e acessos"]');
create table public.ops_tasks (
 id uuid primary key default gen_random_uuid(),property_id bigint not null references public.properties(id),stay_id uuid references public.ops_stays(id),
 stage text not null check(stage in ('preparation','departure')),stay_version integer, title text not null,
 status text not null default 'pending' check(status in ('pending','in_progress','inspection','approved','blocked','cancelled','superseded')),
 scheduled_for timestamptz not null,due_at timestamptz not null,priority text not null default 'normal',window_conflict boolean not null default false,
 previous_stay_id uuid references public.ops_stays(id), assigned_to uuid references auth.users(id),
 template_id uuid not null references public.ops_templates(id),template_version integer not null,checklist_snapshot jsonb not null,
 started_at timestamptz,submitted_at timestamptz,completed_at timestamptz,executed_by uuid references auth.users(id),approved_by uuid references auth.users(id),
 notes text,created_by uuid references auth.users(id),updated_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(stay_id,stage,stay_version)
);
create table public.ops_task_results (
 task_id uuid not null references public.ops_tasks(id),item_index integer not null,result text not null check(result in ('ok','issue','not_applicable')),
 observation text,actor_id uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(task_id,item_index)
);
create table public.ops_evidence (
 id uuid primary key,task_id uuid not null references public.ops_tasks(id),property_id bigint not null references public.properties(id),stay_id uuid references public.ops_stays(id),
 stage text not null,item_index integer not null,storage_path text not null unique,content_type text not null check(content_type in ('image/jpeg','image/webp')),
 size_bytes integer not null check(size_bytes between 12 and 524288),sha256 text not null,status text not null default 'pending' check(status in ('pending','ready')),
 author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),completed_at timestamptz
);
create table public.ops_history (
 id bigint generated always as identity primary key,entity text not null,entity_id text not null,actor_id uuid,operation text not null,
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
create index ops_stays_dates on public.ops_stays(property_id,check_in,check_out);
create index ops_tasks_pending on public.ops_tasks(property_id,status,due_at);
create index ops_tasks_assigned on public.ops_tasks(assigned_to,status);
create index ops_event_stay on public.ops_calendar_events(stay_id);
create index ops_evidence_task on public.ops_evidence(task_id,item_index,status);
create index ops_history_entity on public.ops_history(entity,entity_id,created_at);
create index ops_runs_source on public.ops_sync_runs(source_id,started_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('operation-evidence','operation-evidence',false,524288,array['image/jpeg','image/webp']) on conflict(id) do nothing;

-- All reads/writes use the authenticated, property-scoped Edge service. No direct REST/storage access.
do $$ declare t text;begin foreach t in array array['ops_stays','ops_calendar_events','ops_sync_state','ops_sync_runs','ops_templates','ops_tasks','ops_task_results','ops_evidence','ops_history'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end $$;
grant usage,select on sequence public.ops_history_id_seq to service_role;

create function ops_private.audit() returns trigger language plpgsql set search_path='' as $$
begin
 insert into public.ops_history(entity,entity_id,actor_id,operation,before_value,after_value)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'task_id'),nullif(coalesce(to_jsonb(new)->>'updated_by',to_jsonb(new)->>'actor_id',to_jsonb(new)->>'author_id',to_jsonb(new)->>'created_by'),'')::uuid,tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
do $$ declare t text;begin foreach t in array array['ops_stays','ops_calendar_events','ops_templates','ops_tasks','ops_task_results','ops_evidence'] loop
 execute format('create trigger ops_audit after insert or update on public.%I for each row execute function ops_private.audit()',t);
 end loop;end $$;
create function ops_private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'history_is_immutable';end $$;
create trigger ops_history_immutable before update or delete on public.ops_history for each row execute function ops_private.immutable();
create trigger ops_templates_immutable before update or delete on public.ops_templates for each row execute function ops_private.immutable();
create trigger ops_evidence_no_delete before delete on public.ops_evidence for each row execute function ops_private.immutable();

create function ops_private.task_guard() returns trigger language plpgsql set search_path='' as $$
declare missing integer;t public.ops_tasks;
begin
 if tg_table_name='ops_task_results' then
  select * into t from public.ops_tasks where id=new.task_id for update;
  if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if new.item_index<0 or new.item_index>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;
  return new;
 end if;
 if new.status in ('inspection','approved') and old.status is distinct from new.status then
  if new.stage='departure' and new.scheduled_for>now() then raise exception 'departure_not_due';end if;
  select count(*) into missing from generate_series(0,jsonb_array_length(new.checklist_snapshot)-1) i
   where not exists(select 1 from public.ops_task_results r where r.task_id=new.id and r.item_index=i)
   or not exists(select 1 from public.ops_evidence e where e.task_id=new.id and e.item_index=i and e.status='ready');
  if missing>0 then raise exception 'checklist_and_photos_required';end if;
  if new.status='approved' and (old.status<>'inspection' or new.approved_by is null) then raise exception 'inspection_required';end if;
 end if;
 return new;
end $$;
create trigger ops_result_guard before insert or update on public.ops_task_results for each row execute function ops_private.task_guard();
create trigger ops_task_guard before update on public.ops_tasks for each row execute function ops_private.task_guard();

create function public.ops_refresh_tasks(p_property bigint default null) returns void language plpgsql set search_path='' as $$
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
create function ops_private.stay_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_when='BEFORE' then
  if (new.property_id,new.check_in,new.check_out) is distinct from (old.property_id,old.check_in,old.check_out) then new.version=old.version+1;end if;
  new.updated_at=now();return new;
 end if;
 perform public.ops_refresh_tasks(new.property_id);
 if tg_op='UPDATE' and new.property_id<>old.property_id then perform public.ops_refresh_tasks(old.property_id);end if;
 return new;
end $$;
create trigger ops_stay_version before update on public.ops_stays for each row execute function ops_private.stay_changed();
create trigger ops_stay_tasks after insert or update on public.ops_stays for each row execute function ops_private.stay_changed();

create function ops_private.reservation_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status not in ('confirmed','cancelled','no_show') then return new;end if;
 if new.status<>'confirmed' and not exists(select 1 from public.ops_stays where reservation_id=new.id) then return new;end if;
 insert into public.ops_stays(property_id,reservation_id,channel,origin,status,check_in,check_out,guest_name,guest_phone,guests,payment_origin,checked_in_at,checked_out_at)
 values(new.property_id,new.id,case when new.source in ('airbnb','booking') then new.source when new.source='direct' and new.quote_id is null then 'direct' else 'site' end,'reservation',new.status,new.check_in,new.check_out,new.guest_name,new.guest_phone,new.guests,case when new.source in ('airbnb','booking') then 'external_channel' else 'site' end,new.checked_in_at,new.checked_out_at)
 on conflict(reservation_id) do update set property_id=excluded.property_id,status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,guest_name=excluded.guest_name,guest_phone=excluded.guest_phone,guests=excluded.guests,checked_in_at=excluded.checked_in_at,checked_out_at=excluded.checked_out_at;
 return new;
end $$;
create trigger ops_native_reservation after insert or update of status,property_id,check_in,check_out,guest_name,guest_phone,guests,checked_in_at,checked_out_at on public.reservations for each row execute function ops_private.reservation_changed();
-- Backfill is deliberately only confirmed reservations, never quotes/holds.
insert into public.ops_stays(property_id,reservation_id,channel,origin,status,check_in,check_out,guest_name,guest_phone,guests,payment_origin,checked_in_at,checked_out_at)
 select property_id,id,case when source in ('airbnb','booking') then source when source='direct' and quote_id is null then 'direct' else 'site' end,'reservation',status,check_in,check_out,guest_name,guest_phone,guests,case when source in ('airbnb','booking') then 'external_channel' else 'site' end,checked_in_at,checked_out_at from public.reservations where status='confirmed';

create function public.ops_claim_sync(p_source uuid) returns uuid language plpgsql set search_path='' as $$
declare token uuid=gen_random_uuid();result uuid;
begin
 insert into public.ops_sync_state(source_id) values(p_source) on conflict do nothing;
 update public.ops_sync_state set lease_id=token,lease_until=now()+interval '3 minutes',last_attempt_at=now() where source_id=p_source and (lease_until is null or lease_until<now()) returning lease_id into result;
 if result is not null then
  update public.ops_sync_runs set status='abandoned',finished_at=now(),error='lease_expired' where source_id=p_source and status='running';
  insert into public.ops_sync_runs(id,source_id) values(result,p_source);
 end if;return result;
end $$;
create function public.ops_apply_sync(p_source uuid,p_token uuid,p_config_updated timestamptz,p_events jsonb,p_error text default null,p_attempts integer default 1) returns void language plpgsql set search_path='' as $$
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
   if stored.id is not null and coalesce((ev->>'sequence')::int,0)<stored.provider_sequence then continue;end if;
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
     select count(*) into conflicts from public.ops_stays where property_id=src.property_id and status='confirmed' and check_in<(ev->>'end')::date and check_out>(ev->>'start')::date;
     if conflicts>0 then update public.ops_calendar_events set divergence='possible_existing_stay_link_required' where id=stored.id;continue;end if;
     insert into public.ops_stays(property_id,channel,external_id,origin,check_in,check_out,payment_origin)
      values(src.property_id,case when src.provider in ('airbnb','booking') then src.provider else 'other' end,ev->>'uid','calendar',(ev->>'start')::date,(ev->>'end')::date,'external_channel') returning id into sid;
    else
     select * into stay from public.ops_stays where id=sid;
     if stay.reservation_id is null then
      update public.ops_stays set check_in=(ev->>'start')::date,check_out=(ev->>'end')::date,needs_review=case when status='cancelled' then 'calendar_reappeared_after_cancellation' else null end where id=sid;
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

-- Atomic checklist editing, classification, linking, attendance and task transitions.
create function public.ops_mutate(p_actor uuid,p_action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
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
  if p->>'id' is not null then select * into s from public.ops_stays where id=(p->>'id')::uuid for update;if s.id is null or s.reservation_id is not null then raise exception 'use_reservation_flow';end if;end if;
  pid=(p->>'property_id')::bigint;
  if exists(select 1 from public.ops_stays where property_id=pid and status='confirmed' and id is distinct from s.id and check_in<(p->>'check_out')::date and check_out>(p->>'check_in')::date) then raise exception 'existing_stay_link_required';end if;
  if s.id is null then
   insert into public.ops_stays(property_id,channel,external_id,origin,check_in,check_out,guest_name,guest_phone,guests,payment_origin,notes,created_by,updated_by)
    values(pid,p->>'channel',nullif(p->>'external_id',''),'manual',(p->>'check_in')::date,(p->>'check_out')::date,nullif(p->>'guest_name',''),nullif(p->>'guest_phone',''),nullif(p->>'guests','')::int,case when p->>'channel' in ('airbnb','booking') then 'external_channel' else 'not_recorded' end,p->>'notes',actor.id,actor.id) returning * into s;
  else
   update public.ops_stays set check_in=(p->>'check_in')::date,check_out=(p->>'check_out')::date,guest_name=nullif(p->>'guest_name',''),guest_phone=nullif(p->>'guest_phone',''),guests=nullif(p->>'guests','')::int,notes=p->>'notes',updated_by=actor.id where id=s.id returning * into s;
  end if;return to_jsonb(s);
 end if;
 if p_action='classify' then
  select * into e from public.ops_calendar_events where id=(p->>'event_id')::uuid for update;
  if e.id is null then raise exception 'event_not_found';end if;
  if e.stay_id is not null and e.stay_id::text is distinct from p->>'stay_id' then raise exception 'already_linked';end if;
  if p->>'kind'='stay' then
   select * into s from public.ops_stays where id=nullif(p->>'stay_id','')::uuid;
   if s.id is null then
    if e.start_date is null or e.end_date is null then raise exception 'manual_dates_required';end if;
    if exists(select 1 from public.ops_stays where property_id=e.property_id and status='confirmed' and check_in<e.end_date and check_out>e.start_date) then raise exception 'existing_stay_link_required';end if;
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
revoke all on all functions in schema ops_private from public,anon,authenticated;
revoke all on function public.ops_refresh_tasks(bigint),public.ops_claim_sync(uuid),public.ops_apply_sync(uuid,uuid,timestamptz,jsonb,text,integer),public.ops_mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ops_refresh_tasks(bigint),public.ops_claim_sync(uuid),public.ops_apply_sync(uuid,uuid,timestamptz,jsonb,text,integer),public.ops_mutate(uuid,text,jsonb) to service_role;

-- Serialize external/manual inventory against the preserved native reservation flow.
create function ops_private.guard_inventory() returns trigger language plpgsql set search_path='' as $$
declare pid bigint;starts date;ends date;own_id uuid;
begin
 perform pg_advisory_xact_lock(710122026);
 if tg_table_name='ops_stays' then
  if new.status<>'confirmed' or new.reservation_id is not null then return new;end if;
  pid=new.property_id;starts=new.check_in;ends=new.check_out;
  perform 1 from public.properties where id=pid for update;
  if new.origin='manual' and (
   exists(select 1 from public.reservations where property_id=pid and status in ('confirmed','hold','pending_payment') and check_in<ends and check_out>starts and (status='confirmed' or hold_expires_at is null or hold_expires_at>now()))
   or exists(select 1 from public.pms_calendar_blocks where property_id=pid and status='active' and start_date<ends and end_date>starts)
  ) then raise exception 'existing_stay_link_required';end if;
  return new;
 elsif tg_table_name='reservations' then
  if new.status not in ('confirmed','hold','pending_payment') then return new;end if;
  pid=new.property_id;starts=new.check_in;ends=new.check_out;own_id=new.id;
 elsif tg_table_name='pms_calendar_blocks' then
  if new.status<>'active' then return new;end if;pid=new.property_id;starts=new.start_date;ends=new.end_date;
 else
  if new.kind<>'modification' or new.status not in ('awaiting_payment','processing','paid') or new.expires_at<=now() then return new;end if;
  pid=new.target_property_id;starts=new.target_check_in;ends=new.target_check_out;own_id=new.reservation_id;
 end if;
 perform 1 from public.properties where id=pid for update;
 if exists(select 1 from public.ops_stays where property_id=pid and reservation_id is null and status='confirmed' and check_in<ends and check_out>starts) then raise exception 'operational_period_occupied';end if;
 return new;
end $$;
create trigger aa_ops_inventory before insert or update of property_id,check_in,check_out,status on public.ops_stays for each row execute function ops_private.guard_inventory();
create trigger aa_ops_inventory before insert or update of property_id,check_in,check_out,status on public.reservations for each row execute function ops_private.guard_inventory();
create trigger aa_ops_inventory before insert or update of property_id,start_date,end_date,status on public.pms_calendar_blocks for each row execute function ops_private.guard_inventory();
create trigger aa_ops_inventory before insert or update of target_property_id,target_check_in,target_check_out,status,expires_at on public.post_booking_charges for each row execute function ops_private.guard_inventory();
revoke all on function ops_private.guard_inventory() from public,anon,authenticated;

-- In-app notices only. No email/WhatsApp outbox or financial action is created.
create function ops_private.notify_task() returns trigger language plpgsql set search_path='' as $$
declare notice_type text;caption text;
begin
 if new.status is distinct from old.status and new.status='inspection' then notice_type='housekeeping_inspection';caption='Conferir tarefa multicanal';
 elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then notice_type='housekeeping_assigned';caption='Tarefa multicanal atribuída';
 else return new;end if;
 insert into public.admin_notifications(notification_type,severity,title,message,entity_type,entity_id,dedupe_key,payload)
 values(notice_type,'info',caption,new.title,'ops_tasks',new.id::text,'ops:'||new.id||':'||notice_type||':'||new.updated_at,jsonb_build_object('property_id',new.property_id,'assigned_user_id',new.assigned_to)) on conflict(dedupe_key) do nothing;
 return new;
end $$;
create trigger ops_task_notice after update of status,assigned_to on public.ops_tasks for each row execute function ops_private.notify_task();
revoke all on function ops_private.notify_task() from public,anon,authenticated;
