-- Private expense register. Fiscal exclusions are deliberately reviewed, never inferred
-- from operating profit. RFB Perguntas e Respostas IRPF 2026, questions 209,445-449.
create table public.cost_entries (
 id uuid primary key default gen_random_uuid(),
 property_id bigint references public.properties(id),
 category text not null check(category in ('pool','pool_service','cleaning','energy','water','cleaning_products','laundry','maintenance','equipment','platform_commission','administration','property_tax','condominium','sublease','other')),
 description text not null check(length(btrim(description)) between 2 and 240),
 supplier text not null default '' check(length(supplier)<=160),
 supplier_document text not null default '' check(length(supplier_document)<=30),
 document_number text not null default '' check(length(document_number)<=100),
 document_date date not null,
 competence date not null check(extract(day from competence)=1),
 paid_on date,
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=1000000000),
 notes text not null default '' check(length(notes)<=2000),
 fiscal_status text not null default 'operational' check(fiscal_status in ('operational','review','confirmed')),
 exclusion_cents bigint not null default 0 check(exclusion_cents>=0 and exclusion_cents<=amount_cents),
 fiscal_month date check(extract(day from fiscal_month)=1),
 owner_borne boolean not null default false,
 fiscal_note text not null default '' check(length(fiscal_note)<=1000),
 archived_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),
 updated_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(fiscal_status='confirmed' or (exclusion_cents=0 and fiscal_month is null)),
 check(fiscal_status<>'confirmed' or (property_id is not null and owner_borne and paid_on is not null and fiscal_month is not null and exclusion_cents>0 and length(btrim(fiscal_note))>=5 and category in ('platform_commission','administration','property_tax','condominium','sublease')))
);
create index cost_entries_month_idx on public.cost_entries(competence,property_id) where archived_at is null;
create index cost_entries_fiscal_idx on public.cost_entries(fiscal_month) where archived_at is null and fiscal_status='confirmed';
create index cost_entries_property_idx on public.cost_entries(property_id);
create index cost_entries_creator_idx on public.cost_entries(created_by);
create index cost_entries_editor_idx on public.cost_entries(updated_by);

create table public.cost_receipts (
 id uuid primary key default gen_random_uuid(),
 expense_id uuid not null references public.cost_entries(id),
 object_path text not null unique,
 original_name text not null check(length(original_name) between 1 and 240),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=10485760),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check(object_path=expense_id::text||'/'||id::text||case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end)
);
create index cost_receipts_expense_idx on public.cost_receipts(expense_id);
create index cost_receipts_creator_idx on public.cost_receipts(created_by);
create table public.cost_history (
 id bigint generated always as identity primary key,
 expense_id uuid not null references public.cost_entries(id),
 actor_id uuid references auth.users(id),
 operation text not null,
 previous jsonb,
 current_value jsonb not null,
 recorded_at timestamptz not null default now()
);
create index cost_history_expense_idx on public.cost_history(expense_id,recorded_at);
create index cost_history_actor_idx on public.cost_history(actor_id);

alter table public.cost_entries enable row level security;
alter table public.cost_receipts enable row level security;
alter table public.cost_history enable row level security;
revoke all on public.cost_entries,public.cost_receipts,public.cost_history from public,anon,authenticated;
grant select,insert,update on public.cost_entries to authenticated;
grant select,insert on public.cost_receipts to authenticated;
grant select on public.cost_history to authenticated;
grant all on public.cost_entries,public.cost_receipts,public.cost_history to service_role;
create policy costs_admin_read on public.cost_entries for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_admin_insert on public.cost_entries for insert to authenticated with check(created_by=(select auth.uid()) and updated_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_admin_update on public.cost_entries for update to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active')) with check(updated_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_receipts_read on public.cost_receipts for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_receipts_insert on public.cost_receipts for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_history_read on public.cost_history for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));

create or replace function public.guard_cost_entry() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  new.id:=old.id;new.created_by:=old.created_by;new.created_at:=old.created_at;
  if new.fiscal_status='confirmed' and not exists(select 1 from public.cost_receipts where expense_id=new.id) then raise exception 'cost_receipt_required';end if;
 elsif new.fiscal_status='confirmed' then raise exception 'cost_receipt_required';
 end if;
 if new.fiscal_status='confirmed' and (new.fiscal_month<date_trunc('month',new.paid_on)::date or extract(year from new.fiscal_month)<>extract(year from new.paid_on)) then raise exception 'cost_fiscal_month_invalid';end if;
 new.updated_by:=auth.uid();new.updated_at:=now();return new;
end $$;
revoke all on function public.guard_cost_entry() from public,anon,authenticated;
create trigger guard_cost_entry before insert or update on public.cost_entries for each row execute function public.guard_cost_entry();

create or replace function public.guard_cost_receipt() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from storage.objects where bucket_id='cost-receipts' and name=new.object_path) then raise exception 'cost_uploaded_object_required';end if;
 if exists(select 1 from public.cost_entries where id=new.expense_id and archived_at is not null) then raise exception 'cost_archived';end if;
 return new;
end $$;
revoke all on function public.guard_cost_receipt() from public,anon,authenticated;
create trigger guard_cost_receipt before insert on public.cost_receipts for each row execute function public.guard_cost_receipt();

create schema if not exists private;
create or replace function private.audit_cost_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.cost_history(expense_id,actor_id,operation,previous,current_value) values(new.id,auth.uid(),TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) end,to_jsonb(new));return new;
end $$;
revoke all on function private.audit_cost_entry() from public,anon,authenticated;
create trigger audit_cost_entry after insert or update on public.cost_entries for each row execute function private.audit_cost_entry();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cost-receipts','cost-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy costs_storage_read on storage.objects for select to authenticated using(bucket_id='cost-receipts' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy costs_storage_insert on storage.objects for insert to authenticated with check(bucket_id='cost-receipts' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active') and exists(select 1 from public.cost_entries where id::text=(storage.foldername(name))[1] and archived_at is null));
-- No delete/update permission: originals and fiscal history are retained. Archive
-- the expense to remove it from totals without erasing documentary evidence.
