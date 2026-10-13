create or replace function ops_private.task_guard() returns trigger language plpgsql set search_path='' as $$
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
   or ((new.stage='preparation' or exists(select 1 from public.ops_task_results r where r.task_id=new.id and r.item_index=i and r.result='issue')) and not exists(select 1 from public.ops_evidence e where e.task_id=new.id and e.item_index=i and e.status='ready'))
   or (new.stage='departure' and exists(select 1 from public.ops_task_results r where r.task_id=new.id and r.item_index=i and r.result='issue' and length(trim(coalesce(r.observation,'')))=0));
  if missing>0 then raise exception 'checklist_and_photos_required';end if;
  if new.status='approved' and (old.status<>'inspection' or new.approved_by is null) then raise exception 'inspection_required';end if;
 end if;
 return new;
end $$;

-- Final submission is atomic; the existing mutation service enforces per-task access.
create or replace function public.ops_complete_task(p_actor uuid,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare t public.ops_tasks;a public.profiles;r jsonb;n integer;
begin
 select * into a from public.profiles where id=p_actor;
 if a.id is null or a.pms_access_status<>'active' or a.role not in ('admin','host','staff','service_provider') then raise exception 'permission_denied';end if;
 select * into t from public.ops_tasks where id=(p->>'task_id')::uuid for update;
 if t.id is null or (a.role<>'admin' and (not coalesce(t.property_id=any(a.pms_property_ids),false) or not coalesce((a.pms_permissions->>'housekeeping')::boolean,false) or t.assigned_to is distinct from a.id)) then raise exception 'task_not_found';end if;
 if t.status='inspection' and t.executed_by=a.id then return to_jsonb(t);end if;
 if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
 n=jsonb_array_length(t.checklist_snapshot);
 if jsonb_typeof(p->'results') is distinct from 'array' or jsonb_array_length(p->'results')<>n then raise exception 'invalid_checklist';end if;
 if (select count(distinct (x->>'item_index')::int) from jsonb_array_elements(p->'results') x)<>n then raise exception 'invalid_checklist';end if;
 for r in select value from jsonb_array_elements(p->'results') loop
  if (r->>'item_index')::int not between 0 and n-1 or r->>'result' is null or r->>'result' not in ('ok','issue','not_applicable') then raise exception 'invalid_checklist';end if;
  perform public.ops_mutate(p_actor,'result',r||jsonb_build_object('task_id',t.id));
 end loop;
 return public.ops_mutate(p_actor,'status',jsonb_build_object('task_id',t.id,'status','inspection'));
end $$;
revoke all on function public.ops_complete_task(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ops_complete_task(uuid,jsonb) to service_role;
