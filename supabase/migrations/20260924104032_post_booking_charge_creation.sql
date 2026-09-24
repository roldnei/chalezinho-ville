CREATE OR REPLACE FUNCTION public.start_payment_hold(p_quote_id uuid, p_quote_option_id uuid, p_user_id uuid, p_guest_name text, p_guest_email text, p_guest_phone text, p_guests integer)
 RETURNS TABLE(reservation_id uuid, confirmation_code text, hold_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotes%rowtype;
  o public.quote_options%rowtype;
  v_id uuid;
  v_code text;
  v_expires timestamptz;
  v_experience numeric(12,2);
  v_stay numeric(12,2);
begin
  perform public.expire_stale_reservations();

  select * into q
  from public.quotes
  where id=p_quote_id and status='active' and expires_at>now()
  for update;
  if not found then raise exception 'quote_expired'; end if;

  select * into o
  from public.quote_options
  where id=p_quote_option_id and quote_id=q.id;
  if not found then raise exception 'invalid_quote_option'; end if;

  perform 1 from public.properties where id=q.property_id for update;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.kind='modification'
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.target_property_id=q.property_id
      and daterange(c.target_check_in,c.target_check_out,'[)') && daterange(q.check_in,q.check_out,'[)')
  ) then
    raise exception 'dates_unavailable';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_expires := now() + interval '15 minutes';
  v_experience := greatest(0,(o.total_amount_cents-o.accommodation_amount_cents-o.cleaning_fee_cents)/100.0);
  v_stay := (o.accommodation_amount_cents+o.cleaning_fee_cents)/100.0;

  insert into public.reservations(
    property_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,
    accommodation_amount,cleaning_fee,stay_amount,experience_amount,total_amount,
    hold_expires_at,user_id,quote_id,quote_option_id,rate_plan_code,confirmation_code
  )
  select q.property_id,q.check_in,q.check_out,'pending_payment','direct',p_guests,p_guest_name,p_guest_email,p_guest_phone,
    o.accommodation_amount_cents/100.0,o.cleaning_fee_cents/100.0,v_stay,v_experience,o.total_amount_cents/100.0,
    v_expires,p_user_id,q.id,o.id,rp.code,v_code
  from public.rate_plans rp where rp.id=o.rate_plan_id
  returning id into v_id;

  update public.quotes set status='consumed' where id=q.id;

  return query select v_id,v_code,v_expires;
exception
  when exclusion_violation then
    raise exception 'dates_unavailable';
end;
$function$

CREATE OR REPLACE FUNCTION public.create_modification_charge_atomic(p_request_id uuid, p_admin_id uuid, p_amount_cents bigint, p_deadline_hours integer, p_admin_note text DEFAULT NULL::text)
 RETURNS TABLE(charge_id uuid, amount_cents bigint, expires_at timestamp with time zone, reminder_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.modification_requests%rowtype;
  r public.reservations%rowtype;
  v_property_id bigint;
  v_check_in date;
  v_check_out date;
  v_checkin_at timestamptz;
  v_deadline timestamptz;
  v_reminder timestamptz;
  v_charge_id uuid;
  v_amount bigint;
begin
  select * into m
  from public.modification_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'modification_not_found'; end if;
  if m.status not in ('requested','quoted') then raise exception 'modification_not_approvable'; end if;

  select * into r
  from public.reservations
  where id=m.reservation_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_changeable'; end if;

  v_property_id:=coalesce(m.requested_property_id,r.property_id);
  v_check_in:=coalesce(m.requested_check_in,r.check_in);
  v_check_out:=coalesce(m.requested_check_out,r.check_out);
  if v_check_out<=v_check_in then raise exception 'invalid_dates'; end if;

  v_checkin_at:=make_timestamptz(
    extract(year from v_check_in)::int,
    extract(month from v_check_in)::int,
    extract(day from v_check_in)::int,
    15,0,0,'America/Sao_Paulo'
  );
  v_deadline:=least(
    now()+make_interval(hours=>greatest(1,coalesce(p_deadline_hours,24))),
    v_checkin_at
  );
  if v_deadline<=now() then raise exception 'modification_payment_deadline_passed'; end if;
  v_reminder:=now()+((v_deadline-now())*0.5);
  v_amount:=greatest(0,coalesce(p_amount_cents,0));

  perform 1 from public.properties where id=v_property_id for update;
  perform public.expire_stale_reservations();

  if exists (
    select 1
    from public.reservations x
    where x.property_id=v_property_id
      and x.id<>r.id
      and (
        x.status='confirmed'
        or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
      )
      and daterange(x.check_in,x.check_out,'[)') && daterange(v_check_in,v_check_out,'[)')
  ) then
    raise exception 'dates_unavailable';
  end if;

  begin
    insert into public.post_booking_charges(
      reservation_id,user_id,kind,status,amount_cents,modification_request_id,
      target_property_id,target_check_in,target_check_out,description,snapshot,
      expires_at,reminder_at
    ) values(
      r.id,m.user_id,'modification','awaiting_payment',v_amount,m.id,
      v_property_id,v_check_in,v_check_out,'Revisão de tarifa da alteração',
      jsonb_build_object(
        'original_property_id',r.property_id,
        'original_check_in',r.check_in,
        'original_check_out',r.check_out,
        'requested_property_id',v_property_id,
        'requested_check_in',v_check_in,
        'requested_check_out',v_check_out
      ),
      v_deadline,v_reminder
    )
    returning id into v_charge_id;
  exception when exclusion_violation then
    raise exception 'dates_unavailable';
  end;

  update public.modification_requests
  set status='awaiting_payment',
      admin_additional_amount_cents=v_amount,
      admin_note=p_admin_note,
      decided_at=now(),
      payment_charge_id=v_charge_id,
      payment_due_at=v_deadline,
      updated_at=now()
  where id=m.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values(
    r.id,m.id,'approved_payment_required',to_jsonb(r),
    jsonb_build_object(
      'property_id',v_property_id,
      'check_in',v_check_in,
      'check_out',v_check_out,
      'payment_due_at',v_deadline
    ),
    v_amount,p_admin_id
  );

  insert into public.notification_outbox(
    user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
  ) values(
    m.user_id,r.id,m.id,v_charge_id,'modification_payment_required',now(),
    jsonb_build_object(
      'amount_cents',v_amount,
      'payment_due_at',v_deadline,
      'requested_check_in',v_check_in,
      'requested_check_out',v_check_out,
      'action_path','/conta.html?charge='||v_charge_id::text
    ),
    'mod-payment-required-'||m.id::text
  )
  on conflict (dedupe_key) do nothing;

  return query select v_charge_id,v_amount,v_deadline,v_reminder;
end;
$function$

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

    select p.id as product_id,p.name,p.price_cents,p.upsell_enabled
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
       or next_rec.upsell_enabled is not true
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
$function$

CREATE OR REPLACE FUNCTION public.start_post_booking_payment_atomic(p_charge_id uuid, p_user_id uuid, p_provider text, p_method text, p_installments integer)
 RETURNS TABLE(payment_id uuid, payment_status text, amount_cents bigint, charge_status text, charge_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.post_booking_charges%rowtype;
  p public.payments%rowtype;
  v_payment_id uuid;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;

  if not found then raise exception 'charge_not_found'; end if;
  if c.status='applied' then raise exception 'charge_already_applied'; end if;
  if c.status in ('cancelled','expired') or c.expires_at<=now() then raise exception 'charge_expired'; end if;
  if c.amount_cents<=0 then raise exception 'payment_not_required'; end if;

  if c.payment_id is not null then
    select * into p from public.payments where id=c.payment_id for update;
    if found and p.status in ('awaiting_payment','under_review','processing') then
      return query select p.id,p.status,p.amount_cents,c.status,c.expires_at;
      return;
    end if;
    if found and p.status='paid' then
      return query select p.id,p.status,p.amount_cents,c.status,c.expires_at;
      return;
    end if;
  end if;

  insert into public.payments(
    reservation_id,user_id,provider,method,installments,amount_cents,status,idempotency_key,metadata
  ) values(
    c.reservation_id,p_user_id,p_provider,p_method,
    case when p_method='card' then greatest(1,coalesce(p_installments,1)) else null end,
    c.amount_cents,'awaiting_payment',
    'postcharge-'||c.id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
    jsonb_build_object(
      'development',p_provider='mock',
      'kind','post_booking_charge',
      'post_booking_charge_id',c.id,
      'charge_kind',c.kind
    )
  )
  returning id into v_payment_id;

  update public.post_booking_charges
  set payment_id=v_payment_id,status='processing',updated_at=now()
  where id=c.id;

  return query select v_payment_id,'awaiting_payment'::text,c.amount_cents,'processing'::text,c.expires_at;
end;
$function$

revoke all on function public.create_modification_charge_atomic(uuid,uuid,bigint,integer,text) from public,anon,authenticated;
revoke all on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.start_post_booking_payment_atomic(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.create_modification_charge_atomic(uuid,uuid,bigint,integer,text) to service_role;
grant execute on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.start_post_booking_payment_atomic(uuid,uuid,text,text,integer) to service_role;
