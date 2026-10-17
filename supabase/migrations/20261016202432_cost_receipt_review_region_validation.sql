-- Explicit JSON null must not bypass the source validation.
create or replace function public.check_cost_receipt_review() returns trigger language plpgsql set search_path='' as $$
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
   or coalesce(r->>'source','') not in ('automatic','manual')
   or jsonb_typeof(r->'page')<>'number' or (r->>'page')::numeric not between 1 and 6 or (r->>'page')::numeric<>trunc((r->>'page')::numeric)
   or jsonb_typeof(r->'x')<>'number' or jsonb_typeof(r->'y')<>'number' or jsonb_typeof(r->'width')<>'number' or jsonb_typeof(r->'height')<>'number'
   or (r->>'x')::numeric<0 or (r->>'y')::numeric<0 or (r->>'width')::numeric<=0 or (r->>'height')::numeric<=0
   or (r->>'x')::numeric+(r->>'width')::numeric>1.001 or (r->>'y')::numeric+(r->>'height')::numeric>1.001
   then raise exception 'cost_review_invalid_region'; end if;
 end loop;
 return new;
end $$;
