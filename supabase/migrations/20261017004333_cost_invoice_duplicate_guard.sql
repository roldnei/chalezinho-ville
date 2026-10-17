-- Keep existing duplicates intact; serialize new claims through a unique key.
-- Archived expenses still reserve their invoice. Empty numbers are not invoices.
create function private.cost_invoice_key(issuer text, number text) returns text
language sql immutable set search_path='' as $$
 select case when regexp_replace(upper(number),'[^A-Z0-9]','','g')<>'' then
 regexp_replace(upper(issuer),'[^A-Z0-9]','','g')||':'||
 coalesce(nullif(ltrim(regexp_replace(upper(number),'[^A-Z0-9]','','g'),'0'),''),'0') end
$$;
revoke all on function private.cost_invoice_key(text,text) from public,anon,authenticated;
create table private.cost_invoice_claims (
 invoice_key text primary key,
 entry_count integer not null check(entry_count>=0)
);
alter table private.cost_invoice_claims enable row level security;
revoke all on private.cost_invoice_claims from public,anon,authenticated;
-- Lock the source until backfill and trigger installation complete atomically.
lock table public.cost_entries in share row exclusive mode;
insert into private.cost_invoice_claims(invoice_key,entry_count)
select private.cost_invoice_key(supplier_document,document_number),count(*)
from public.cost_entries where private.cost_invoice_key(supplier_document,document_number) is not null
group by 1;
create function private.guard_cost_invoice_duplicate() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_key text;new_key text;claims integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and pms_access_status='active') then
  raise exception 'cost_invoice_admin_required' using errcode='42501';
 end if;
 if TG_OP<>'INSERT' then old_key:=private.cost_invoice_key(old.supplier_document,old.document_number);end if;
 if TG_OP<>'DELETE' then new_key:=private.cost_invoice_key(new.supplier_document,new.document_number);end if;
 if new_key is not distinct from old_key then return null;end if;
 if new_key is not null then
  insert into private.cost_invoice_claims as c(invoice_key,entry_count) values(new_key,1)
  on conflict(invoice_key) do update set entry_count=c.entry_count+1
  returning entry_count into claims;
  if claims>1 then raise exception 'cost_invoice_duplicate' using errcode='23505',constraint='cost_invoice_duplicate';end if;
 end if;
 if old_key is not null then
  update private.cost_invoice_claims set entry_count=entry_count-1 where invoice_key=old_key;
 end if;
 return null;
end $$;
revoke all on function private.guard_cost_invoice_duplicate() from public,anon,authenticated;
create trigger cost_invoice_duplicate after insert or update or delete on public.cost_entries
for each row execute function private.guard_cost_invoice_duplicate();
