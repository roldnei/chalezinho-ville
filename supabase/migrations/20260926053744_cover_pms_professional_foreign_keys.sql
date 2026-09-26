create index if not exists pms_templates_created_by_idx
  on public.pms_checklist_templates(created_by) where created_by is not null;

create index if not exists pms_issue_attachments_uploaded_by_idx
  on public.pms_issue_attachments(uploaded_by) where uploaded_by is not null;
