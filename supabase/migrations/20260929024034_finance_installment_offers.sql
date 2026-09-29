-- Immutable quote terms, bound to authenticated owner and the exact payable source.
create table public.installment_offers (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 quote_option_id uuid references public.quote_options(id),post_booking_charge_id uuid references public.post_booking_charges(id),
 base_amount_cents bigint not null check(base_amount_cents>0),provider text not null,
 plans jsonb not null check(jsonb_typeof(plans)='array' and jsonb_array_length(plans)>0),
 terms jsonb not null,expires_at timestamptz not null,created_at timestamptz not null default now(),
 check(num_nonnulls(quote_option_id,post_booking_charge_id)=1)
);
alter table public.installment_offers enable row level security;
revoke all on public.installment_offers from public,anon,authenticated;
grant select,insert on public.installment_offers to service_role;
create trigger installment_offers_immutable before update or delete on public.installment_offers
for each row execute function public.finance_immutable();
