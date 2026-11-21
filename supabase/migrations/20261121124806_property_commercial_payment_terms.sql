-- Public sales conditions managed in PMS. No default commercial fee or installment count.
create table if not exists public.property_commercial_payment_terms (
 property_id bigint primary key references public.properties(id) on delete cascade,
 credit_fee_bps integer not null check (credit_fee_bps between 0 and 10000),
 installments_count integer not null check (installments_count between 1 and 12),
 cash_price_source text not null check (cash_price_source='quote'),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.property_commercial_payment_terms enable row level security;
grant select on public.property_commercial_payment_terms to anon,authenticated;
grant insert,update on public.property_commercial_payment_terms to authenticated;
grant all on public.property_commercial_payment_terms to service_role;
drop policy if exists commercial_terms_read on public.property_commercial_payment_terms;
create policy commercial_terms_read on public.property_commercial_payment_terms for select to anon,authenticated using (true);
drop policy if exists commercial_terms_insert on public.property_commercial_payment_terms;
create policy commercial_terms_insert on public.property_commercial_payment_terms for insert to authenticated with check (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.pms_access_status='active')
);
drop policy if exists commercial_terms_update on public.property_commercial_payment_terms;
create policy commercial_terms_update on public.property_commercial_payment_terms for update to authenticated using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.pms_access_status='active')
) with check (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.pms_access_status='active')
);
create schema if not exists pricing_internal;
create or replace function pricing_internal.audit_commercial_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare max_count integer;
begin
 if tg_op='UPDATE' and new.property_id<>old.property_id then raise exception 'property_id_immutable'; end if;
 select coalesce((p.features->'payment_terms'->>'max_installments')::integer,12)
 into max_count from public.properties p where p.id=new.property_id;
 if max_count is null or new.installments_count>max_count then raise exception 'installments_exceed_property_limit'; end if;
 new.updated_at=clock_timestamp();
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,old_value,new_value)
 values(auth.uid(),'commercial_payment_terms_'||lower(tg_op),'property',new.property_id::text,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function pricing_internal.audit_commercial_terms() from public,anon,authenticated;
drop trigger if exists commercial_terms_audit on public.property_commercial_payment_terms;
create trigger commercial_terms_audit before insert or update on public.property_commercial_payment_terms
 for each row execute function pricing_internal.audit_commercial_terms();
