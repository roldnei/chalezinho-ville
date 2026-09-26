-- Professional PMS additions: reusable checklists, accountable assignments and evidence.
-- Reservation and financial state machines remain isolated and authoritative.

create table if not exists public.pms_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  property_id bigint references public.properties(id) on delete cascade,
  task_type text not null check (task_type in ('turnover','inspection','maintenance','setup','guest_request')),
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pms_checklist_templates(id) on delete cascade,
  label text not null,
  display_order integer not null default 0,
  required boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pms_tasks add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.pms_issues add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.pms_issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.pms_issues(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pms_template_property_type_idx on public.pms_checklist_templates(property_id,task_type,active);
create index if not exists pms_template_items_order_idx on public.pms_checklist_template_items(template_id,display_order);
create index if not exists pms_tasks_assigned_user_idx on public.pms_tasks(assigned_user_id) where assigned_user_id is not null;
create index if not exists pms_issues_assigned_user_idx on public.pms_issues(assigned_user_id) where assigned_user_id is not null;
create index if not exists pms_issue_attachments_issue_idx on public.pms_issue_attachments(issue_id,created_at);

alter table public.pms_checklist_templates enable row level security;
alter table public.pms_checklist_template_items enable row level security;
alter table public.pms_issue_attachments enable row level security;

revoke all on public.pms_checklist_templates,public.pms_checklist_template_items,public.pms_issue_attachments from public,anon,authenticated;
grant all on public.pms_checklist_templates,public.pms_checklist_template_items,public.pms_issue_attachments to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pms-evidence','pms-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

comment on table public.pms_checklist_templates is 'Reusable operational checklist definitions managed through the PMS service layer.';
comment on table public.pms_issue_attachments is 'Private evidence metadata; files live in the private pms-evidence bucket.';
