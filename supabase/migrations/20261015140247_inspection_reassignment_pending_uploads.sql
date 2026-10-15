-- Preserve unfinished uploads as audit evidence, without blocking the new assignee.
alter table public.ops_evidence drop constraint ops_evidence_status_check;
alter table public.ops_evidence add constraint ops_evidence_status_check check(status in ('pending','ready','abandoned'));
create or replace function ops_private.inspection_task() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  select item_rules into new.item_rules_snapshot from public.ops_templates where id=new.template_id;
 else
  if new.assigned_to is distinct from old.assigned_to then
   update public.ops_evidence set status='abandoned' where task_id=new.id and status='pending';
  end if;
  if new.assigned_to is distinct from old.assigned_to or new.status in ('inspection','approved','cancelled','superseded') then
   update public.ops_inspection_links set revoked_at=coalesce(revoked_at,now()) where task_id=new.id and revoked_at is null;
  end if;
 end if;
 return new;
end $$;
