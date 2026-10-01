create table public.provider_reconciliation_gates(
 charge_id text primary key,
 started_at timestamptz not null default clock_timestamp()
);
alter table public.provider_reconciliation_gates enable row level security;
revoke all on public.provider_reconciliation_gates from public,anon,authenticated;
grant select,insert,update on public.provider_reconciliation_gates to service_role;
create function public.claim_provider_reconciliation(p_charge_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed text;
begin
 -- An unsigned sandbox notification is only a lookup hint for an already
 -- registered charge. It cannot introduce a payment or authorization.
 if not exists(select 1 from public.payments where provider='pagbank_sandbox' and provider_payment_id=p_charge_id)
 and not exists(select 1 from public.guarantees where provider='pagbank_sandbox' and provider_authorization_id=p_charge_id)
 then return false; end if;
 insert into public.provider_reconciliation_gates(charge_id) values(p_charge_id)
 on conflict(charge_id) do update set started_at=clock_timestamp()
 where public.provider_reconciliation_gates.started_at<clock_timestamp()-interval '30 seconds'
 returning charge_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.claim_provider_reconciliation(text) from public,anon,authenticated;
grant execute on function public.claim_provider_reconciliation(text) to service_role;
