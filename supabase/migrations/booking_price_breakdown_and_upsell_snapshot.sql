-- booking_price_breakdown_and_upsell_snapshot.sql
alter table public.reservations
  add column if not exists experience_amount numeric(12,2) not null default 0;

update public.reservations
set experience_amount = greatest(0,coalesce(total_amount,0)-coalesce(accommodation_amount,0)-coalesce(cleaning_fee,0))
where experience_amount=0
  and coalesce(total_amount,0) > coalesce(accommodation_amount,0)+coalesce(cleaning_fee,0);

update public.experience_products
set price_cents=54900, upsell_enabled=false, updated_at=now()
where code='noite_romantica_6a7d18';

update public.experience_products
set price_cents=59900, upsell_enabled=true, updated_at=now()
where code='uplm';

with first_variant as (
  select distinct on (product_id) id,product_id
  from public.experience_variants
  where active=true
  order by product_id,display_order,created_at
)
update public.experience_variants v
set price_cents=p.price_cents
from first_variant f
join public.experience_products p on p.id=f.product_id
where v.id=f.id and p.code in ('noite_romantica_6a7d18','uplm');

create or replace function public.start_payment_hold(
  p_quote_id uuid,
  p_quote_option_id uuid,
  p_user_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guests integer
)
returns table(reservation_id uuid, confirmation_code text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  q public.quotes%rowtype;
  o public.quote_options%rowtype;
  v_id uuid;
  v_code text;
  v_expires timestamptz;
  v_experience numeric(12,2);
begin
  perform public.expire_stale_reservations();
  select * into q from public.quotes where id=p_quote_id and status='active' and expires_at>now() for update;
  if not found then raise exception 'quote_expired'; end if;
  select * into o from public.quote_options where id=p_quote_option_id and quote_id=q.id;
  if not found then raise exception 'invalid_quote_option'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_expires := now() + interval '15 minutes';
  v_experience := greatest(0,(o.total_amount_cents-o.accommodation_amount_cents-o.cleaning_fee_cents)/100.0);
  insert into public.reservations(
    property_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,
    accommodation_amount,cleaning_fee,experience_amount,total_amount,hold_expires_at,user_id,quote_id,quote_option_id,
    rate_plan_code,confirmation_code
  )
  select q.property_id,q.check_in,q.check_out,'pending_payment','direct',p_guests,p_guest_name,p_guest_email,p_guest_phone,
    o.accommodation_amount_cents/100.0,o.cleaning_fee_cents/100.0,v_experience,o.total_amount_cents/100.0,
    v_expires,p_user_id,q.id,o.id,rp.code,v_code
  from public.rate_plans rp where rp.id=o.rate_plan_id
  returning id into v_id;
  update public.quotes set status='consumed' where id=q.id;
  return query select v_id,v_code,v_expires;
exception when exclusion_violation then raise exception 'dates_unavailable';
end;
$function$;
