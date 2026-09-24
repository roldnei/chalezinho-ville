CREATE OR REPLACE FUNCTION public.create_experience_charge_atomic(p_reservation_id uuid, p_user_id uuid, p_variant_id uuid, p_expires_minutes integer)
 RETURNS TABLE(charge_id uuid, purchase_mode text, amount_cents bigint, description text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_deadline timestamptz;
  v_available_until timestamptz;
  v_charge_id uuid;
  v_capacity_count integer;
  v_pending_count integer;
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target
  from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(
    extract(year from r.check_in)::int,
    extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,
    15,0,0,'America/Sao_Paulo'
  )-make_interval(hours=>target.minimum_lead_hours);

  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id as item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
         cp.name as current_name,cp.price_cents as current_product_price
  into current_rec
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status='active'
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;

    select p.id as product_id,p.name,p.price_cents
    into next_rec
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_rec.product_id is null
       or next_rec.product_id<>target.id
    then raise exception 'experience_upgrade_not_available'; end if;

    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.reservation_id=r.id
      and c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'package_type'=target.package_type
  ) then raise exception 'experience_payment_already_pending'; end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_capacity_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status='active'
      and rr.status='confirmed'
      and rr.check_in=r.check_in;

    select count(*)::int into v_pending_count
    from public.post_booking_charges c
    join public.reservations rr on rr.id=c.reservation_id
    where c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'target_product_id'=target.id::text
      and rr.check_in=r.check_in;

    if coalesce(v_capacity_count,0)+coalesce(v_pending_count,0)>=target.daily_capacity
    then raise exception 'experience_capacity_reached'; end if;
  end if;

  v_deadline:=least(
    now()+make_interval(mins=>greatest(5,coalesce(p_expires_minutes,15))),
    v_available_until
  );
  if v_deadline<=now() then raise exception 'experience_lead_time'; end if;

  insert into public.post_booking_charges(
    reservation_id,user_id,kind,status,amount_cents,target_variant_id,source_experience_item_id,
    description,snapshot,expires_at
  ) values(
    r.id,p_user_id,
    case when v_mode='upgrade' then 'experience_upgrade' else 'experience_add' end,
    'awaiting_payment',v_amount,v.id,
    case when v_mode='upgrade' then current_rec.item_id else null end,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    jsonb_build_object(
      'purchase_mode',v_mode,
      'package_type',target.package_type,
      'target_product_id',target.id,
      'target_variant_id',v.id,
      'target_name',target.name,
      'target_price_cents',target.price_cents,
      'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
      'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
      'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
      'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end
    ),
    v_deadline
  )
  returning id into v_charge_id;

  return query select
    v_charge_id,
    v_mode,
    v_amount,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    v_deadline;
end;
$function$;
revoke all on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) to service_role;
