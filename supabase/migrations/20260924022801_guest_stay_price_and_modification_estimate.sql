-- 20260924022801_guest_stay_price_and_modification_estimate.sql
alter table public.reservations add column if not exists stay_amount numeric(12,2);
update public.reservations
set stay_amount = coalesce(accommodation_amount,0) + coalesce(cleaning_fee,0)
where stay_amount is null;
alter table public.reservations alter column stay_amount set default 0;
alter table public.reservations alter column stay_amount set not null;
alter table public.modification_requests add column if not exists estimated_additional_amount_cents bigint;

with selected_ref as (
  select distinct on (m.id)
    m.id,
    round((coalesce(r.accommodation_amount,0)+coalesce(r.cleaning_fee,0))*100)::bigint as original_stay_cents,
    (qo.accommodation_amount_cents+qo.cleaning_fee_cents)::bigint as reference_stay_cents
  from public.modification_requests m
  join public.reservations r on r.id=m.reservation_id
  join public.quote_options qo on qo.quote_id=m.reference_quote_id
  join public.rate_plans rp on rp.id=qo.rate_plan_id
  where m.status in ('requested','quoted','awaiting_guest_acceptance','accepted')
  order by m.id,
    case when rp.code=r.rate_plan_code then 0 when rp.code='non_refundable' then 1 else 2 end
)
update public.modification_requests m
set original_amount_cents=s.original_stay_cents,
    reference_amount_cents=s.reference_stay_cents,
    estimated_additional_amount_cents=greatest(0,s.reference_stay_cents-s.original_stay_cents),
    updated_at=now()
from selected_ref s
where m.id=s.id;
