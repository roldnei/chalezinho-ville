-- Independent operational layer for housekeeping, inspections and maintenance.
-- It deliberately does not alter booking or financial state machines.

create table if not exists public.pms_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  task_type text not null check (task_type in ('turnover','inspection','maintenance','setup','guest_request')),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','inspection','ready','blocked','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  scheduled_for timestamptz not null,
  due_at timestamptz,
  assigned_name text,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pms_tasks(id) on delete cascade,
  label text not null,
  display_order integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pms_issues (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  title text not null,
  description text,
  area text,
  severity text not null default 'normal' check (severity in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','scheduled','in_progress','resolved','cancelled')),
  assigned_name text,
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_activity_events (
  id bigint generated always as identity primary key,
  task_id uuid references public.pms_tasks(id) on delete cascade,
  issue_id uuid references public.pms_issues(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((task_id is not null) <> (issue_id is not null))
);

create index if not exists pms_tasks_schedule_idx on public.pms_tasks(scheduled_for,status);
create index if not exists pms_tasks_property_idx on public.pms_tasks(property_id,scheduled_for);
create unique index if not exists pms_turnover_per_reservation_idx on public.pms_tasks(reservation_id,task_type) where reservation_id is not null;
create index if not exists pms_task_checklist_task_idx on public.pms_task_checklist_items(task_id,display_order);
create index if not exists pms_issues_open_idx on public.pms_issues(property_id,status,created_at desc);
create index if not exists pms_activity_task_idx on public.pms_activity_events(task_id,created_at desc);
create index if not exists pms_activity_issue_idx on public.pms_activity_events(issue_id,created_at desc);
create index if not exists pms_tasks_created_by_idx on public.pms_tasks(created_by) where created_by is not null;
create index if not exists pms_checklist_completed_by_idx on public.pms_task_checklist_items(completed_by) where completed_by is not null;
create index if not exists pms_issues_reservation_idx on public.pms_issues(reservation_id) where reservation_id is not null;
create index if not exists pms_issues_created_by_idx on public.pms_issues(created_by) where created_by is not null;
create index if not exists pms_activity_actor_idx on public.pms_activity_events(actor_user_id) where actor_user_id is not null;

alter table public.pms_tasks enable row level security;
alter table public.pms_task_checklist_items enable row level security;
alter table public.pms_issues enable row level security;
alter table public.pms_activity_events enable row level security;

revoke all on public.pms_tasks,public.pms_task_checklist_items,public.pms_issues,public.pms_activity_events from public,anon,authenticated;
grant all on public.pms_tasks,public.pms_task_checklist_items,public.pms_issues,public.pms_activity_events to service_role;
revoke all on sequence public.pms_activity_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.pms_activity_events_id_seq to service_role;

comment on table public.pms_tasks is 'Operational PMS tasks. Financial and reservation lifecycle state remain authoritative in their own modules.';
