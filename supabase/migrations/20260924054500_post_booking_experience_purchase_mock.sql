create or replace function public.purchase_post_booking_experience_mock_atomic(
  p_reservation_id uuid,
  p_user_id uuid,
  p_variant_id uuid
)
returns table(
  result_order_id uuid,
  result_item_id uuid,
  result_payment_id uuid,
  result_amount_cents bigint,
  result_total_amount numeric
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  p public.experience_products%rowtype;
  v_order_id uuid;
  v_item_id uuid;
  v_payment_id uuid;
  v_count integer;
  v_total numeric(12,2);
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;

  if not found or r.status <> 'confirmed' then
    raise exception 'reservation_not_available';
  end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;

  if not found then
    raise exception 'experience_unavailable';
  end if;

  select * into p
  from public.experience_products
  where id=v.product_id
  for update;

  if not found or p.status <> 'active' then
    raise exception 'experience_unavailable';
  end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=p.id and e.property_id=r.property_id
  ) then
    raise exception 'experience_unavailable';
  end if;

  if ((r.check_in::text || ' 15:00:00-03')::timestamptz - now()) < make_interval(hours=>p.minimum_lead_hours) then
    raise exception 'experience_lead_time';
  end if;

  if p.inventory is not null and p.inventory <= 0 then
    raise exception 'experience_out_of_stock';
  end if;

  if exists (
    select 1
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    where o.reservation_id=r.id
      and i.product_id=p.id
      and i.status='active'
      and o.status in ('pending','active')
  ) then
    raise exception 'experience_already_added';
  end if;

  if p.daily_capacity is not null then
    select count(*)::int into v_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=p.id
      and i.status='active'
      and o.status in ('pending','active')
      and rr.status in ('confirmed','pending_payment')
      and rr.check_in=r.check_in;

    if v_count >= p.daily_capacity then
      raise exception 'experience_capacity_reached';
    end if;
  end if;

  insert into public.experience_orders(reservation_id,user_id,status)
  values(r.id,p_user_id,'active')
  returning id into v_order_id;

  insert into public.experience_order_items(
    order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,
    unit_price_cents,quantity,status
  ) values (
    v_order_id,p.id,v.id,p.name,
    case when v.code='package' then null else v.name end,
    v.price_cents,1,'active'
  )
  returning id into v_item_id;

  insert into public.payments(
    reservation_id,user_id,provider,method,amount_cents,status,idempotency_key,metadata
  ) values (
    r.id,p_user_id,'mock','mock',v.price_cents,'paid',
    'postexp-'||v_item_id::text,
    jsonb_build_object(
      'development',true,
      'kind','post_booking_experience',
      'experience_order_id',v_order_id,
      'experience_order_item_id',v_item_id
    )
  )
  returning id into v_payment_id;

  insert into public.financial_entries(
    reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,description
  ) values (
    r.id,v_payment_id,v_item_id,'experience',v.price_cents,p.name
  );

  v_total := round((coalesce(r.total_amount,0) + v.price_cents/100.0)::numeric,2);

  update public.reservations
  set experience_amount=round((coalesce(experience_amount,0)+v.price_cents/100.0)::numeric,2),
      total_amount=v_total,
      updated_at=now()
  where id=r.id;

  return query select v_order_id,v_item_id,v_payment_id,v.price_cents,v_total;
end;
$function$;

revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from public;
revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from anon;
revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from authenticated;
grant execute on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) to service_role;
