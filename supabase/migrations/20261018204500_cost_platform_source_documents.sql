-- Preserve one original platform statement for all fees imported from it.
-- Only an active administrator may read the private document. Imports are
-- service operations; browser users cannot create or replace this evidence.
create table public.cost_source_documents (
 id uuid primary key default gen_random_uuid(),
 original_name text not null check(length(original_name) between 1 and 240),
 mime_type text not null check(mime_type='text/csv'),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=10485760),
 content text not null,
 created_at timestamptz not null default now(),
 check(octet_length(content)=size_bytes)
);
create table public.cost_source_links (
 id uuid primary key default gen_random_uuid(),
 expense_id uuid not null unique references public.cost_entries(id),
 document_id uuid not null references public.cost_source_documents(id),
 created_at timestamptz not null default now()
);
create index cost_source_links_document_idx on public.cost_source_links(document_id);
alter table public.cost_source_documents enable row level security;
alter table public.cost_source_links enable row level security;
revoke all on public.cost_source_documents,public.cost_source_links from public,anon,authenticated;
grant select on public.cost_source_documents,public.cost_source_links to authenticated;
grant all on public.cost_source_documents,public.cost_source_links to service_role;
create policy cost_source_documents_admin_read on public.cost_source_documents
 for select to authenticated using(exists(select 1 from public.profiles
 where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy cost_source_links_admin_read on public.cost_source_links
 for select to authenticated using(exists(select 1 from public.profiles
 where id=(select auth.uid()) and role='admin' and pms_access_status='active'));

create or replace function public.guard_cost_entry() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  new.id:=old.id;new.created_by:=old.created_by;new.created_at:=old.created_at;
  if new.fiscal_status='confirmed' and not (
   exists(select 1 from public.cost_receipts where expense_id=new.id) or
   exists(select 1 from public.cost_source_links where expense_id=new.id)
  ) then raise exception 'cost_receipt_required';end if;
 elsif new.fiscal_status='confirmed' then raise exception 'cost_receipt_required';
 end if;
 if new.fiscal_status='confirmed' and (new.fiscal_month<date_trunc('month',new.paid_on)::date or extract(year from new.fiscal_month)<>extract(year from new.paid_on)) then raise exception 'cost_fiscal_month_invalid';end if;
 new.updated_by:=coalesce(auth.uid(),new.updated_by);new.updated_at:=now();return new;
end $$;
revoke all on function public.guard_cost_entry() from public,anon,authenticated;
