-- Preserve the latest native guided preparation/departure rules; delegate only linked cleaning contracts.
create or replace function ops_private.task_guard() returns trigger language plpgsql set search_path='' as $$
declare missing integer;t public.ops_tasks;j public.cleaning_jobs;
begin
 if tg_table_name='ops_task_results' then
  select * into t from public.ops_tasks where id=new.task_id for update;
  if t.cleaning_job_id is not null then raise exception 'cleaning_task_managed_in_platform';end if;
  if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if new.item_index<0 or new.item_index>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;
  return new;
 end if;
 if new.cleaning_job_id is not null then
  select * into j from public.cleaning_jobs where id=new.cleaning_job_id;
  if coalesce(current_setting('cleaning.projection',true),'0')='1' and j.id is not null then return new;end if;
  if new.status in ('inspection','approved') and old.status is distinct from new.status then raise exception 'cleaning_task_managed_in_platform';end if;return new;
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

