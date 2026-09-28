-- Only provider identifiers, numeric charge totals and response codes are kept.
-- Never persist raw provider bodies, Authorization headers or card details.
create table if not exists public.reservation_refund_provider_observations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.reservation_refunds(id),
  phase text not null check (phase in ('post','get')),
  source text not null check (source in ('charge','order')),
  charge_id text not null check (charge_id ~ '^CHAR_[A-Za-z0-9-]+$'),
  http_status integer check (http_status between 100 and 599),
  error_code text check (error_code ~ '^[a-zA-Z0-9_]{1,40}$'),
  charge_status text check (charge_status ~ '^[A-Z_]{1,40}$'),
  amount_value bigint check (amount_value >= 0),
  summary_total bigint check (summary_total >= 0),
  summary_paid bigint check (summary_paid >= 0),
  summary_refunded bigint check (summary_refunded >= 0),
  observed_at timestamptz not null default now()
);
create index if not exists refund_observations_refund_idx
  on public.reservation_refund_provider_observations(refund_id,observed_at desc);
alter table public.reservation_refund_provider_observations enable row level security;
revoke all on public.reservation_refund_provider_observations from anon,authenticated;
grant all on public.reservation_refund_provider_observations to service_role;

-- Receipt fallback is intentionally narrower than GET confirmation: a
-- validated POST receipt AND a later GET of the identical paid charge are
-- required. Any conflicting provider summary prevents this path.
create or replace function public.confirm_reservation_refund_from_receipt(
  p_refund_id uuid,p_charge_id text,p_get_status text,p_get_amount bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  v_post public.reservation_refund_provider_observations%rowtype;
  v_get public.reservation_refund_provider_observations%rowtype;
  v_prior bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  select * into p from public.payments where id=v.payment_id;
  select * into v_post from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='post' and http_status between 200 and 299
      and source='charge' and charge_id=v.charge_id
      and amount_value=p.amount_cents and summary_total=p.amount_cents
      and summary_paid=p.amount_cents
      and summary_refunded=v.provider_refunded_cents
    order by observed_at desc limit 1;
  select * into v_get from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='get' and source='charge' and charge_id=v.charge_id
      and charge_status=p_get_status and amount_value=p_get_amount
      and observed_at>v_post.observed_at
    order by observed_at desc limit 1;
  select coalesce(sum(confirmed_cents),0) into v_prior
    from public.reservation_refunds where payment_id=p.id and id<>v.id and state='confirmed';
  if v.state not in ('dispatching','uncertain') or v.sent_at is null
    or v.charge_id is distinct from p_charge_id
    or p.provider<>'pagbank_sandbox' or p.status not in ('paid','refunded')
    or p.provider_payment_id is distinct from v.charge_id
    or v_post.id is null or v_get.id is null or v_get.http_status<>200
    or v_get.summary_refunded is not null or v_get.summary_paid is not null
    or p_get_status not in ('PAID','CANCELED') or p_get_amount<>p.amount_cents
    or v.provider_paid_cents is distinct from p.amount_cents
    or v.provider_refunded_cents is distinct from v_prior+v.requested_cents
    or v.provider_refunded_cents>p.amount_cents
    or not exists(select 1 from public.reservation_refund_attempts
      where refund_id=v.id and event='request_accepted') then
    raise exception 'provider_receipt_not_reconciled';
  end if;
  return public.confirm_reservation_refund(v.id,v.charge_id,p_get_status,
    v.provider_paid_cents,v.provider_refunded_cents);
end $$;
revoke all on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  to service_role;
