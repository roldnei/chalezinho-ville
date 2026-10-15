-- A completed standalone preparation can later become the preparation of one real stay.
-- Keep the original task, checklist, assignee, execution, approval and storage objects.
alter table public.ops_tasks add column linked_at timestamptz;
alter table public.ops_tasks add column linked_by uuid references auth.users(id);
alter table public.ops_tasks add column superseded_by_task_id uuid references public.ops_tasks(id);
alter table public.ops_tasks add column superseded_stay_version integer;
create function public.ops_link_preparation(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles;t public.ops_tasks;s public.ops_stays;old_task public.ops_tasks;prop public.properties;arrival timestamptz;
begin
 select * into actor from public.profiles where id=p_actor;
 if actor.id is null or actor.role<>'admin' or actor.pms_access_status is distinct from 'active' then raise exception 'admin_required';end if;
 -- Same lock as synchronization: association and placeholder retirement are one transaction.
 perform pg_advisory_xact_lock(710122026);
 select * into t from public.ops_tasks where id=(p->>'task_id')::uuid for update;
 select * into s from public.ops_stays where id=(p->>'stay_id')::uuid for update;
 if t.id is null or s.id is null then raise exception 'link_target_unavailable';end if;
 if t.stage<>'preparation' or t.cleaning_job_id is not null then raise exception 'standalone_preparation_required';end if;
 if t.stay_id=s.id and t.stay_version=s.version and t.linked_at is not null then return to_jsonb(t);end if;
 if t.stay_id is not null or t.linked_at is not null then raise exception 'preparation_already_linked';end if;
 if t.status not in ('inspection','approved') or t.submitted_at is null or t.executed_by is null then raise exception 'preparation_not_submitted';end if;
 if s.version is distinct from (p->>'expected_version')::int then raise exception 'stay_changed_reload';end if;
 if s.property_id<>t.property_id then raise exception 'link_property_mismatch';end if;
 select * into prop from public.properties where id=s.property_id;
 arrival=(s.check_in+coalesce(prop.check_in_time,'15:00'::time)) at time zone 'America/Sao_Paulo';
 if s.is_test or s.status<>'confirmed' or s.checked_out_at is not null or s.departure_reported_on is not null or (s.check_out+coalesce(prop.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo'<=now() then raise exception 'link_target_unavailable';end if;
 if t.submitted_at>coalesce(s.checked_in_at,arrival) then raise exception 'preparation_after_arrival';end if;
 if exists(select 1 from public.ops_stays x where x.property_id=s.property_id and x.id<>s.id and x.status='confirmed' and not x.is_test and x.check_in<s.check_in and coalesce(x.checked_out_at,(x.check_out+coalesce(prop.check_out_time,'11:00'::time)) at time zone 'America/Sao_Paulo')>coalesce(t.started_at,t.scheduled_for)) then raise exception 'intervening_stay_requires_cleaning';end if;
 if exists(select 1 from public.ops_evidence e where e.task_id=t.id and (e.status='pending' or e.property_id<>t.property_id or e.stage<>'preparation')) then raise exception 'preparation_evidence_pending';end if;
 select * into old_task from public.ops_tasks where stay_id=s.id and stage='preparation' and stay_version=s.version for update;
 if old_task.id is not null then
  if old_task.status<>'pending' or old_task.assigned_to is not null or old_task.started_at is not null or old_task.submitted_at is not null or old_task.cleaning_job_id is not null or old_task.linked_at is not null or exists(select 1 from public.ops_task_results where task_id=old_task.id) or exists(select 1 from public.ops_evidence where task_id=old_task.id) then raise exception 'preparation_has_work';end if;
  -- Only an untouched automatic placeholder is retired. Its stay and original version remain recorded.
  update public.ops_tasks set status='superseded',superseded_stay_version=stay_version,stay_version=null,superseded_by_task_id=t.id,updated_by=actor.id,updated_at=now() where id=old_task.id;
 end if;
 update public.ops_tasks set stay_id=s.id,stay_version=s.version,linked_at=now(),linked_by=actor.id,updated_by=actor.id,updated_at=now() where id=t.id returning * into t;
 -- Metadata association only: no new photo, moved object or change to departure evidence.
 update public.ops_evidence set stay_id=s.id where task_id=t.id;
 insert into public.ops_history(entity,entity_id,actor_id,operation,after_value) values('ops_tasks',t.id::text,actor.id,'standalone_preparation_linked',jsonb_build_object('stay_id',s.id,'stay_version',s.version,'retired_placeholder',old_task.id,'reason',left(coalesce(p->>'reason','Limpeza avulsa vinculada à hospedagem pelo administrador.'),1000)));
 return to_jsonb(t);
end $$;
revoke all on function public.ops_link_preparation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ops_link_preparation(uuid,jsonb) to service_role;
