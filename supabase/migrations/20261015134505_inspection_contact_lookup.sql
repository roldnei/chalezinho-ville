create or replace function public.inspection_dispatch(p_actor uuid,p_hash text,p_action text,p jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare a uuid:=p_actor;is_admin boolean:=false;t public.ops_tasks;l public.ops_inspection_links;r jsonb;out jsonb;rule jsonb;i integer;ev public.ops_evidence;tpl public.ops_templates;v integer;contact public.ops_inspection_contacts;
begin
 if p_hash is not null then
  select * into l from public.ops_inspection_links where token_hash=p_hash;
  if l.id is null then raise exception 'access_unavailable';end if;
  select * into t from public.ops_tasks where id=l.task_id for update;
  select * into l from public.ops_inspection_links where id=l.id;
  if l.revoked_at is not null or l.expires_at<=now() or t.assigned_to is distinct from l.user_id or t.status not in ('pending','in_progress','blocked') then raise exception 'access_unavailable';end if;
  a=l.user_id;
 elsif a is null then raise exception 'access_unavailable';
 else
  select exists(select 1 from public.profiles where id=a and role='admin' and pms_access_status='active') into is_admin;
 end if;
 if exists(select 1 from public.profiles where id=a and pms_access_status in ('suspended','cancelled')) then raise exception 'access_unavailable';end if;
 if p_action in ('people','lookup','contact','assign','issue_link','reopen','template') and not is_admin then raise exception 'admin_required';end if;
 if p_action='people' then
  return jsonb_build_object('people',coalesce((select jsonb_agg(x) from (select pr.id,coalesce(c.name,pr.full_name,'Sem nome') name,c.phone from public.profiles pr left join public.ops_inspection_contacts c on c.user_id=pr.id where coalesce(c.name,pr.full_name,'') ilike '%'||left(coalesce(p->>'search',''),80)||'%' order by coalesce(c.name,pr.full_name) limit 100) x),'[]'));
 end if;
 if p_action='lookup' then
  return jsonb_build_object('id',(select user_id from public.ops_inspection_contacts where phone=p->>'phone' limit 1));
 end if;
 if p_action='contact' then
  insert into public.ops_inspection_contacts(user_id,name,phone,created_by) values((p->>'user_id')::uuid,left(p->>'name',120),p->>'phone',a)
   on conflict(user_id) do update set name=excluded.name,phone=excluded.phone returning * into contact;
  return to_jsonb(contact);
 end if;
 if p_action='profile' then
  if length(trim(coalesce(p->>'name','')))<2 then raise exception 'invalid_profile';end if;
  update public.ops_inspection_contacts set name=left(trim(p->>'name'),120),email=left(p->>'email',180),profile_completed_at=now() where user_id=a;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='list' then
  return jsonb_build_object('tasks',coalesce((select jsonb_agg(x order by x.scheduled_for) from (select task_row.id,t.stage,t.status,t.scheduled_for,t.due_at,pr.name property_name from public.ops_tasks task_row join public.properties pr on pr.id=task_row.property_id where task_row.assigned_to=a and task_row.cleaning_job_id is null and task_row.status in ('pending','in_progress','blocked') and (l.id is null or task_row.id=l.task_id)) x),'[]'));
 end if;
 if p_action='template' then
  if p->>'stage' not in ('preparation','departure') or jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items')=0 or jsonb_array_length(p->'items')>80 or jsonb_array_length(p->'rules')<>jsonb_array_length(p->'items') then raise exception 'invalid_checklist';end if;
  perform pg_advisory_xact_lock(hashtext('inspection_template:'||coalesce(p->>'property_id','')||(p->>'stage')));
  select coalesce(max(version),0)+1 into v from public.ops_templates where stage=p->>'stage' and property_id is not distinct from nullif(p->>'property_id','')::bigint;
  insert into public.ops_templates(property_id,stage,name,version,items,item_rules,created_by) values(nullif(p->>'property_id','')::bigint,p->>'stage',left(p->>'name',120),v,p->'items',p->'rules',a) returning * into tpl;
  return to_jsonb(tpl);
 end if;
 if t.id is null then select * into t from public.ops_tasks where id=(p->>'task_id')::uuid for update;end if;
 if t.id is null or (l.id is not null and t.id is distinct from (p->>'task_id')::uuid) or (not is_admin and t.assigned_to is distinct from a) then raise exception 'access_unavailable';end if;
 if t.cleaning_job_id is not null then raise exception 'cleaning_task_managed_in_platform';end if;
 if p_action='assign' then
  if nullif(p->>'user_id','') is not null and not exists(select 1 from public.profiles where id=(p->>'user_id')::uuid and pms_access_status is distinct from 'suspended') then raise exception 'invalid_assignee';end if;
  update public.ops_tasks set assigned_to=nullif(p->>'user_id','')::uuid,updated_by=a where id=t.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='issue_link' then
  if t.assigned_to is null or t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if not exists(select 1 from public.ops_inspection_contacts where user_id=t.assigned_to) then raise exception 'contact_required';end if;
  update public.ops_inspection_links set revoked_at=now() where task_id=t.id and revoked_at is null;
  insert into public.ops_inspection_links(task_id,user_id,token_hash,expires_at,created_by) values(t.id,t.assigned_to,p->>'hash',now()+interval '7 days',a);
  return (select jsonb_build_object('phone',phone,'name',name) from public.ops_inspection_contacts where user_id=t.assigned_to);
 end if;
 if p_action='reopen' then
  if length(trim(coalesce(p->>'reason','')))<5 or t.status not in ('inspection','approved','blocked') then raise exception 'reopen_reason_required';end if;
  insert into public.ops_history(entity,entity_id,actor_id,operation,after_value) values('ops_tasks',t.id::text,a,'reopened',jsonb_build_object('reason',left(p->>'reason',1000)));
  perform set_config('ops.reopen_reason',p->>'reason',true);
  update public.ops_tasks set status='pending',completed_at=null,approved_by=null,submitted_at=null,updated_by=a where id=t.id;
  -- Reopened access always requires a newly issued link.
  return jsonb_build_object('ok',true);
 end if;
 if p_action='detail' then
  select * into contact from public.ops_inspection_contacts where user_id=a;
  return jsonb_build_object('task',jsonb_build_object('id',t.id,'stage',t.stage,'status',t.status,'scheduled_for',t.scheduled_for,'due_at',t.due_at,'assigned_to',t.assigned_to,'property_id',t.property_id,'items',t.checklist_snapshot,'rules',t.item_rules_snapshot,'started_at',t.started_at,'submitted_at',t.submitted_at,'property_name',(select name from public.properties where id=t.property_id)),
   'profile',case when contact.user_id is not null then jsonb_build_object('name',contact.name,'phone',contact.phone,'completed',contact.profile_completed_at is not null) else null end,
   'results',coalesce((select jsonb_agg(x) from public.ops_task_results x where task_id=t.id),'[]'),
   'photos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'item_index',item_index)) from public.ops_evidence where task_id=t.id and status='ready'),'[]'),
   'history',case when is_admin then coalesce((select jsonb_agg(x order by created_at desc) from public.ops_history x where entity_id=t.id::text),'[]') else '[]'::jsonb end);
 end if;
 if p_action='photo_read' then
  select * into ev from public.ops_evidence where id=(p->>'photo_id')::uuid and task_id=t.id and status='ready';
  if ev.id is null then raise exception 'access_unavailable';end if;
  return to_jsonb(ev);
 end if;
 if not is_admin and t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
 if t.stage='departure' and t.scheduled_for>now() then raise exception 'departure_not_due';end if;
 if p_action in ('save','complete') then
  if p_action='complete' and t.status='inspection' and t.executed_by=a then return jsonb_build_object('ok',true);end if;
  if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if jsonb_typeof(p->'results') is distinct from 'array' then raise exception 'invalid_checklist';end if;
  for r in select value from jsonb_array_elements(p->'results') loop
   i=(r->>'item_index')::int;
   if i is null or i<0 or i>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;
   insert into public.ops_task_results(task_id,item_index,result,observation,actor_id) values(t.id,i,r->>'result',left(r->>'observation',2000),a)
   on conflict(task_id,item_index) do update set result=excluded.result,observation=excluded.observation,actor_id=a,updated_at=now();
  end loop;
  update public.ops_tasks set status=case when p_action='complete' then 'inspection' else 'in_progress' end,started_at=coalesce(started_at,now()),submitted_at=case when p_action='complete' then now() else submitted_at end,executed_by=case when p_action='complete' then a else executed_by end,updated_by=a where id=t.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='photo' then
  i=(p->>'item_index')::int;
  if t.status not in ('pending','in_progress','blocked') or i<0 or i>=jsonb_array_length(t.checklist_snapshot) then raise exception 'task_locked';end if;
  select * into ev from public.ops_evidence where id=(p->>'upload_id')::uuid;
  if ev.id is not null and (ev.task_id<>t.id or ev.item_index<>i or ev.author_id<>a or ev.sha256<>p->>'sha256') then raise exception 'upload_key_conflict';end if;
  insert into public.ops_evidence(id,task_id,property_id,stay_id,stage,item_index,storage_path,content_type,size_bytes,sha256,author_id)
  values((p->>'upload_id')::uuid,t.id,t.property_id,t.stay_id,t.stage,i,t.id::text||'/'||(p->>'upload_id'),p->>'content_type',(p->>'size_bytes')::int,p->>'sha256',a) on conflict(id) do nothing;
  if p->>'complete'='true' then
   if not exists(select 1 from storage.objects where bucket_id='operation-evidence' and name=t.id::text||'/'||(p->>'upload_id')) then raise exception 'upload_not_found';end if;
   update public.ops_evidence set status='ready',completed_at=coalesce(completed_at,now()) where id=(p->>'upload_id')::uuid;
  end if;
  select to_jsonb(x) into out from public.ops_evidence x where id=(p->>'upload_id')::uuid;return out;
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.inspection_dispatch(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.inspection_dispatch(uuid,text,text,jsonb) to service_role;
