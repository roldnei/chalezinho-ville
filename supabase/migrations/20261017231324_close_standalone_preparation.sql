-- Approval records the work; closure ends any future association with a stay.
alter table public.ops_tasks
 add column closed_without_stay_at timestamptz,
 add column closed_without_stay_by uuid references auth.users(id),
 add column closed_without_stay_reason text,
 add constraint ops_standalone_closure_complete check (
  (closed_without_stay_at is null and closed_without_stay_by is null and closed_without_stay_reason is null)
  or (closed_without_stay_at is not null and closed_without_stay_by is not null
   and closed_without_stay_reason is not null and length(closed_without_stay_reason) between 1 and 1000
   and stage='preparation' and stay_id is null and linked_at is null and cleaning_job_id is null and status='approved')
 );

create function ops_private.guard_standalone_closure() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.closed_without_stay_at is not null
  and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
  raise exception 'preparation_closed';
 end if;
 return new;
end $$;
revoke all on function ops_private.guard_standalone_closure() from public,anon,authenticated;
create trigger ops_standalone_closure_guard before update on public.ops_tasks
 for each row execute function ops_private.guard_standalone_closure();

create function public.ops_close_preparation(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles;t public.ops_tasks;reason text;
begin
 select * into actor from public.profiles where id=p_actor;
 if actor.id is null or actor.role is distinct from 'admin' or actor.pms_access_status is distinct from 'active' then
  raise exception 'admin_required';
 end if;
 perform pg_advisory_xact_lock(710122026);
 select * into t from public.ops_tasks where id=(p->>'task_id')::uuid for update;
 if t.id is null then raise exception 'task_not_found';end if;
 if t.stage<>'preparation' or t.cleaning_job_id is not null then raise exception 'standalone_preparation_required';end if;
 if t.stay_id is not null or t.linked_at is not null then raise exception 'preparation_already_linked';end if;
 if t.closed_without_stay_at is not null then return to_jsonb(t);end if;
 if t.status<>'approved' or t.submitted_at is null or t.executed_by is null then raise exception 'preparation_not_approved';end if;
 if exists(select 1 from public.ops_evidence where task_id=t.id and status='pending') then raise exception 'preparation_evidence_pending';end if;
 reason=coalesce(nullif(btrim(p->>'reason'),''),'Limpeza avulsa encerrada sem hospedagem.');
 if length(reason)>1000 then raise exception 'invalid_closure_reason';end if;
 update public.ops_tasks set closed_without_stay_at=now(),closed_without_stay_by=actor.id,
  closed_without_stay_reason=reason,updated_by=actor.id,updated_at=now()
  where id=t.id returning * into t;
 insert into public.ops_history(entity,entity_id,actor_id,operation,after_value)
  values('ops_tasks',t.id::text,actor.id,'standalone_preparation_closed',
   jsonb_build_object('reason',reason,'completed_at',t.completed_at,'closed_without_stay_at',t.closed_without_stay_at));
 return to_jsonb(t);
end $$;
revoke all on function public.ops_close_preparation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ops_close_preparation(uuid,jsonb) to service_role;
