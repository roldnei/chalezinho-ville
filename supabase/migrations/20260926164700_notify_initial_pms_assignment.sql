-- Notify the operation when a task is created already assigned, not only on reassignment.

create or replace function private.enqueue_pms_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_type text;
  v_title text;
  v_message text;
  v_severity text := 'info';
  v_dedupe text;
begin
  if tg_table_name = 'pms_tasks' then
    v_reservation_id := new.reservation_id;
    if (tg_op = 'INSERT' and new.assigned_user_id is not null)
      or (tg_op = 'UPDATE' and old.assigned_user_id is distinct from new.assigned_user_id and new.assigned_user_id is not null) then
      v_type := 'housekeeping_assigned'; v_severity := 'info'; v_title := 'Tarefa designada';
      v_message := new.title || ' · ' || coalesce(new.assigned_name,'Equipe');
      v_dedupe := 'pms_task_assigned:' || new.id || ':' || new.assigned_user_id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'inspection' then
      v_type := 'housekeeping_inspection'; v_severity := 'warning'; v_title := 'Tarefa aguardando vistoria';
      v_message := new.title;
      v_dedupe := 'pms_task_inspection:' || new.id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'ready' then
      v_type := 'property_ready'; v_severity := 'success'; v_title := 'Imóvel liberado';
      v_message := new.title || ' concluída e vistoriada.';
      v_dedupe := 'pms_task_ready:' || new.id;
    else
      return new;
    end if;
  elsif tg_table_name = 'pms_issues' then
    v_reservation_id := new.reservation_id;
    if tg_op = 'INSERT' then
      v_type := 'pms_issue_opened';
      v_severity := case when new.severity='critical' then 'critical' else 'warning' end;
      v_title := 'Nova ocorrência operacional'; v_message := new.title;
      v_dedupe := 'pms_issue:' || new.id;
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.admin_notifications(notification_type,severity,title,message,reservation_id,entity_type,entity_id,dedupe_key,payload)
  values(v_type,v_severity,v_title,v_message,v_reservation_id,tg_table_name,new.id::text,v_dedupe,jsonb_build_object('property_id',new.property_id))
  on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_pms_notification() from public,anon,authenticated;

drop trigger if exists pms_tasks_admin_notification on public.pms_tasks;
create trigger pms_tasks_admin_notification
after insert or update of assigned_user_id,status on public.pms_tasks
for each row execute function private.enqueue_pms_notification();
