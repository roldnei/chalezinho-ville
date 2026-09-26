-- Complete Phase 1 PMS cycle: operational blocks, staff scope, housekeeping timing and audit.

alter table public.profiles
  add column if not exists pms_property_ids bigint[] not null default '{}'::bigint[],
  add column if not exists pms_permissions jsonb not null default '{"reservations":false,"housekeeping":false,"maintenance":false,"finance":false,"manage_team":false}'::jsonb;

alter table public.pms_tasks
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz;

create table if not exists public.pms_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  block_type text not null default 'maintenance' check (block_type in ('maintenance','owner_use','operational','other')),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);

create index if not exists pms_calendar_blocks_property_dates_idx
  on public.pms_calendar_blocks(property_id,start_date,end_date) where status='active';
create index if not exists pms_tasks_reservation_idx
  on public.pms_tasks(reservation_id,scheduled_for) where reservation_id is not null;

alter table public.pms_calendar_blocks enable row level security;
revoke all on public.pms_calendar_blocks from public,anon,authenticated;
grant all on public.pms_calendar_blocks to service_role;

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
    if tg_op = 'UPDATE' and old.assigned_user_id is distinct from new.assigned_user_id and new.assigned_user_id is not null then
      v_type := 'housekeeping_assigned'; v_severity := 'info'; v_title := 'Limpeza designada';
      v_message := new.title || ' · ' || coalesce(new.assigned_name,'Equipe');
      v_dedupe := 'pms_task_assigned:' || new.id || ':' || new.assigned_user_id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'inspection' then
      v_type := 'housekeeping_inspection'; v_severity := 'warning'; v_title := 'Limpeza aguardando vistoria';
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
after update of assigned_user_id,status on public.pms_tasks
for each row execute function private.enqueue_pms_notification();

drop trigger if exists pms_issues_admin_notification on public.pms_issues;
create trigger pms_issues_admin_notification
after insert on public.pms_issues
for each row execute function private.enqueue_pms_notification();

comment on table public.pms_calendar_blocks is 'Manual operational availability blocks. Read and written only through the PMS service layer.';
