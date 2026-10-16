-- Reviewed receipt examples remain private, append-only and linked to originals.
-- These examples do not automatically change the running OCR model.
create table public.cost_receipt_reviews (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null references public.cost_receipts(id),
 predicted_fields jsonb not null check(jsonb_typeof(predicted_fields)='object' and octet_length(predicted_fields::text)<=4000),
 reviewed_fields jsonb not null check(jsonb_typeof(reviewed_fields)='object' and octet_length(reviewed_fields::text)<=4000),
 regions jsonb not null default '{}' check(jsonb_typeof(regions)='object' and octet_length(regions::text)<=4000),
 engine text not null check(engine='tesseract-por-1+receipt-v2'),
 reviewed_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index cost_receipt_reviews_receipt_idx on public.cost_receipt_reviews(receipt_id,created_at);
create index cost_receipt_reviews_reviewer_idx on public.cost_receipt_reviews(reviewed_by);
alter table public.cost_receipt_reviews enable row level security;
revoke all on public.cost_receipt_reviews from public,anon,authenticated;
grant select,insert on public.cost_receipt_reviews to authenticated;
grant all on public.cost_receipt_reviews to service_role;
create policy cost_receipt_reviews_read on public.cost_receipt_reviews for select to authenticated
 using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create policy cost_receipt_reviews_insert on public.cost_receipt_reviews for insert to authenticated
 with check(reviewed_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
create function public.check_cost_receipt_review() returns trigger language plpgsql set search_path='' as $$
declare expected jsonb; pair record; r jsonb;
begin
 select jsonb_build_object('supplier',e.supplier,'supplier_document',e.supplier_document,'amount_cents',e.amount_cents,'document_date',e.document_date::text,'document_number',e.document_number)
 into expected from public.cost_receipts f join public.cost_entries e on e.id=f.expense_id
 where f.id=new.receipt_id and e.archived_at is null;
 if expected is null or new.reviewed_fields<>expected then raise exception 'cost_review_must_match_saved_receipt'; end if;
 if exists(select 1 from jsonb_object_keys(new.predicted_fields) k where k not in ('supplier','supplier_document','amount_cents','document_date','document_number')) then raise exception 'cost_review_unknown_field'; end if;
 for pair in select * from jsonb_each(new.regions) loop
  r:=pair.value;
  if pair.key not in ('supplier','supplier_document','amount','document_date','document_number') or jsonb_typeof(r)<>'object'
   or not (r ?& array['page','x','y','width','height','source'])
   or r->>'source' not in ('automatic','manual')
   or jsonb_typeof(r->'page')<>'number' or (r->>'page')::numeric not between 1 and 6 or (r->>'page')::numeric<>trunc((r->>'page')::numeric)
   or jsonb_typeof(r->'x')<>'number' or jsonb_typeof(r->'y')<>'number' or jsonb_typeof(r->'width')<>'number' or jsonb_typeof(r->'height')<>'number'
   or (r->>'x')::numeric<0 or (r->>'y')::numeric<0 or (r->>'width')::numeric<=0 or (r->>'height')::numeric<=0
   or (r->>'x')::numeric+(r->>'width')::numeric>1.001 or (r->>'y')::numeric+(r->>'height')::numeric>1.001
   then raise exception 'cost_review_invalid_region'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.check_cost_receipt_review() from public,anon,authenticated;
create trigger cost_receipt_review_check before insert on public.cost_receipt_reviews for each row execute function public.check_cost_receipt_review();
