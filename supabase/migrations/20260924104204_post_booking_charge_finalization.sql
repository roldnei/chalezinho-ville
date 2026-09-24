CREATE OR REPLACE FUNCTION public.finalize_post_booking_charge_atomic(p_payment_id uuid, p_user_id uuid)
 RETURNS TABLE(result_charge_id uuid, result_kind text, result_status text, result_amount_cents bigint, result_total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.payments%rowtype;
  c public.post_booking_charges%rowtype;
  r public.reservations%rowtype;
  m public.modification_requests%rowtype;
  v_total numeric(12,2);
  v_order_id uuid;
  v_item_id uuid;
  v_target_product uuid;
  v_target_variant uuid;
  v_source_item uuid;
  v_target_name text;
  v_package_type text;
  v_mode text;
  v_target_price bigint;
  v_existing_same_type integer;
begin
  select * into p
  from public.payments
  where id=p_payment_id and user_id=p_user_id
  for update;
  if not found then raise exception 'payment_not_found'; end if;

  select * into c
  from public.post_booking_charges
  where payment_id=p.id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if c.status='applied' and p.status='paid' then
    select total_amount into v_total from public.reservations where id=c.reservation_id;
    return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
    return;
  end if;

  if c.status in ('cancelled','expired') or c.expires_at<=now() then
    raise exception 'charge_expired';
  end if;

  if p.status not in ('awaiting_payment','under_review','processing') then
    raise exception 'payment_state_final';
  end if;

  select * into r
  from public.reservations
  where id=c.reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  if c.kind='modification' then
    select * into m
    from public.modification_requests
    where id=c.modification_request_id
    for update;
    if not found or m.status<>'awaiting_payment' then raise exception 'modification_not_payable'; end if;

    perform 1 from public.properties where id=c.target_property_id for update;
    perform public.expire_stale_reservations();

    if exists (
      select 1
      from public.reservations x
      where x.property_id=c.target_property_id
        and x.id<>r.id
        and (
          x.status='confirmed'
          or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
        )
        and daterange(x.check_in,x.check_out,'[)') && daterange(c.target_check_in,c.target_check_out,'[)')
    ) then raise exception 'dates_unavailable'; end if;

    update public.payments set status='paid',updated_at=now() where id=p.id;

    v_total:=round((coalesce(r.total_amount,0)+c.amount_cents/100.0)::numeric,2);
    begin
      update public.reservations
      set property_id=c.target_property_id,
          check_in=c.target_check_in,
          check_out=c.target_check_out,
          total_amount=v_total,
          updated_at=now()
      where id=r.id;
    exception when exclusion_violation then
      raise exception 'dates_unavailable';
    end;

    if c.amount_cents>0 then
      insert into public.financial_entries(
        reservation_id,payment_id,entry_type,amount_cents,description
      ) values(
        r.id,p.id,'additional_charge',c.amount_cents,'Revisão de tarifa da alteração'
      );
    end if;

    update public.modification_requests
    set status='applied',
        guest_accepted_at=coalesce(guest_accepted_at,now()),
        applied_at=now(),
        updated_at=now()
    where id=m.id;

    update public.post_booking_charges
    set status='applied',applied_at=now(),updated_at=now()
    where id=c.id;

    insert into public.reservation_change_events(
      reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
    ) values(
      r.id,m.id,'paid_and_applied',to_jsonb(r),
      jsonb_build_object(
        'property_id',c.target_property_id,
        'check_in',c.target_check_in,
        'check_out',c.target_check_out,
        'total_amount',v_total
      ),
      c.amount_cents,p_user_id
    );

    update public.notification_outbox
    set status='cancelled'
    where charge_id=c.id and status='queued' and template_code='modification_payment_reminder';

    return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
    return;
  end if;

  v_target_product:=(c.snapshot->>'target_product_id')::uuid;
  v_target_variant:=c.target_variant_id;
  v_source_item:=nullif(c.snapshot->>'source_item_id','')::uuid;
  v_target_name:=c.snapshot->>'target_name';
  v_package_type:=c.snapshot->>'package_type';
  v_mode:=c.snapshot->>'purchase_mode';
  v_target_price:=coalesce((c.snapshot->>'target_price_cents')::bigint,c.amount_cents);

  if v_mode='upgrade' then
    if v_source_item is null then raise exception 'experience_upgrade_not_available'; end if;
    perform 1 from public.experience_order_items
      where id=v_source_item and status='active'
      for update;
    if not found then raise exception 'experience_upgrade_not_available'; end if;
  else
    select count(*)::int into v_existing_same_type
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.experience_products ep on ep.id=i.product_id
    where o.reservation_id=r.id
      and o.status='active'
      and i.status='active'
      and ep.package_type=v_package_type;
    if v_existing_same_type>0 then raise exception 'experience_category_conflict'; end if;
  end if;

  update public.payments set status='paid',updated_at=now() where id=p.id;

  if v_mode='upgrade' then
    update public.experience_order_items set status='upgraded' where id=v_source_item;
  end if;

  insert into public.experience_orders(reservation_id,user_id,status)
  values(r.id,p_user_id,'active')
  returning id into v_order_id;

  insert into public.experience_order_items(
    order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,
    unit_price_cents,quantity,status
  ) values(
    v_order_id,v_target_product,v_target_variant,v_target_name,null,
    v_target_price,1,'active'
  )
  returning id into v_item_id;

  insert into public.financial_entries(
    reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,description
  ) values(
    r.id,p.id,v_item_id,
    case when v_mode='upgrade' then 'upgrade' else 'experience' end,
    c.amount_cents,c.description
  );

  v_total:=round((coalesce(r.total_amount,0)+c.amount_cents/100.0)::numeric,2);
  update public.reservations
  set experience_amount=round((coalesce(experience_amount,0)+c.amount_cents/100.0)::numeric,2),
      total_amount=v_total,
      updated_at=now()
  where id=r.id;

  update public.post_booking_charges
  set status='applied',applied_at=now(),updated_at=now()
  where id=c.id;

  return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
end;
$function$

CREATE OR REPLACE FUNCTION public.confirm_free_post_booking_charge_atomic(p_charge_id uuid, p_user_id uuid)
 RETURNS TABLE(result_charge_id uuid, result_status text, result_total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.post_booking_charges%rowtype;
  r public.reservations%rowtype;
  m public.modification_requests%rowtype;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;
  if c.kind<>'modification' or c.amount_cents<>0 then raise exception 'payment_required'; end if;
  if c.status='applied' then
    select total_amount into result_total_amount from public.reservations where id=c.reservation_id;
    return query select c.id,'applied'::text,result_total_amount;
    return;
  end if;
  if c.status in ('cancelled','expired') or c.expires_at<=now() then raise exception 'charge_expired'; end if;

  select * into r from public.reservations
  where id=c.reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into m from public.modification_requests
  where id=c.modification_request_id
  for update;
  if not found or m.status<>'awaiting_payment' then raise exception 'modification_not_payable'; end if;

  perform 1 from public.properties where id=c.target_property_id for update;
  perform public.expire_stale_reservations();

  if exists (
    select 1 from public.reservations x
    where x.property_id=c.target_property_id
      and x.id<>r.id
      and (
        x.status='confirmed'
        or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
      )
      and daterange(x.check_in,x.check_out,'[)') && daterange(c.target_check_in,c.target_check_out,'[)')
  ) then raise exception 'dates_unavailable'; end if;

  begin
    update public.reservations
    set property_id=c.target_property_id,
        check_in=c.target_check_in,
        check_out=c.target_check_out,
        updated_at=now()
    where id=r.id;
  exception when exclusion_violation then
    raise exception 'dates_unavailable';
  end;

  update public.modification_requests
  set status='applied',guest_accepted_at=now(),applied_at=now(),updated_at=now()
  where id=m.id;

  update public.post_booking_charges
  set status='applied',applied_at=now(),updated_at=now()
  where id=c.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values(
    r.id,m.id,'confirmed_without_charge',to_jsonb(r),
    jsonb_build_object('property_id',c.target_property_id,'check_in',c.target_check_in,'check_out',c.target_check_out),
    0,p_user_id
  );

  update public.notification_outbox
  set status='cancelled'
  where charge_id=c.id and status='queued' and template_code='modification_payment_reminder';

  return query select c.id,'applied'::text,r.total_amount;
end;
$function$

CREATE OR REPLACE FUNCTION public.update_post_booking_payment_state_atomic(p_payment_id uuid, p_user_id uuid, p_outcome text)
 RETURNS TABLE(result_payment_status text, result_charge_status text, result_charge_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.payments%rowtype;
  c public.post_booking_charges%rowtype;
begin
  select * into p
  from public.payments
  where id=p_payment_id and user_id=p_user_id
  for update;
  if not found then raise exception 'payment_not_found'; end if;

  select * into c
  from public.post_booking_charges
  where payment_id=p.id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if p.status='paid' or c.status='applied' then raise exception 'payment_state_final'; end if;
  if p_outcome not in ('under_review','refused','expired') then raise exception 'invalid_outcome'; end if;

  if p_outcome='under_review' then
    update public.payments set status='under_review',updated_at=now() where id=p.id;
    update public.post_booking_charges set status='processing',updated_at=now() where id=c.id;
    return query select 'under_review'::text,'processing'::text,c.id;
    return;
  end if;

  update public.payments
  set status=case when p_outcome='refused' then 'refused' else 'expired' end,
      updated_at=now()
  where id=p.id;

  if c.expires_at<=now() then
    update public.post_booking_charges
    set status='expired',updated_at=now()
    where id=c.id;

    if c.kind='modification' then
      update public.modification_requests
      set status='payment_expired',updated_at=now()
      where id=c.modification_request_id and status='awaiting_payment';

      insert into public.notification_outbox(
        user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
      ) values(
        c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_cancelled_unpaid',now(),
        jsonb_build_object('amount_cents',c.amount_cents,'expired_at',now()),
        'mod-unpaid-cancelled-'||c.modification_request_id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;

    return query select
      case when p_outcome='refused' then 'refused' else 'expired' end,
      'expired'::text,c.id;
    return;
  end if;

  update public.post_booking_charges
  set status='awaiting_payment',payment_id=null,updated_at=now()
  where id=c.id;

  return query select
    case when p_outcome='refused' then 'refused' else 'expired' end,
    'awaiting_payment'::text,c.id;
end;
$function$

CREATE OR REPLACE FUNCTION public.cancel_post_booking_charge_atomic(p_charge_id uuid, p_user_id uuid)
 RETURNS TABLE(result_charge_status text, result_modification_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.post_booking_charges%rowtype;
  p public.payments%rowtype;
  v_mod_status text;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if c.status='applied' then raise exception 'charge_already_applied'; end if;
  if c.status in ('cancelled','expired') then
    if c.modification_request_id is not null then
      select status into v_mod_status from public.modification_requests where id=c.modification_request_id;
    end if;
    return query select c.status,v_mod_status;
    return;
  end if;

  if c.payment_id is not null then
    select * into p from public.payments where id=c.payment_id for update;
    if found and p.status='under_review' then raise exception 'payment_processing'; end if;
    if found and p.status='paid' then raise exception 'charge_already_paid'; end if;
    if found and p.status in ('awaiting_payment','processing') then
      update public.payments set status='cancelled',updated_at=now() where id=p.id;
    end if;
  end if;

  update public.post_booking_charges
  set status='cancelled',updated_at=now()
  where id=c.id;

  if c.kind='modification' then
    update public.modification_requests
    set status='cancelled',updated_at=now()
    where id=c.modification_request_id and status='awaiting_payment'
    returning status into v_mod_status;

    insert into public.reservation_change_events(
      reservation_id,modification_request_id,event_type,amount_cents,actor_user_id
    ) values(c.reservation_id,c.modification_request_id,'cancelled_before_payment',c.amount_cents,p_user_id);
  end if;

  return query select 'cancelled'::text,v_mod_status;
end;
$function$

CREATE OR REPLACE FUNCTION public.process_post_booking_deadlines()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.post_booking_charges%rowtype;
  v_count integer:=0;
begin
  for c in
    select * from public.post_booking_charges
    where kind='modification'
      and status in ('awaiting_payment','processing')
      and reminder_at is not null
      and reminder_at<=now()
      and reminder_sent_at is null
      and expires_at>now()
    for update skip locked
  loop
    insert into public.notification_outbox(
      user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
    ) values(
      c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_payment_reminder',now(),
      jsonb_build_object(
        'amount_cents',c.amount_cents,
        'payment_due_at',c.expires_at,
        'action_path','/conta.html?charge='||c.id::text
      ),
      'mod-payment-reminder-'||c.modification_request_id::text
    )
    on conflict (dedupe_key) do nothing;

    update public.post_booking_charges
    set reminder_sent_at=now(),updated_at=now()
    where id=c.id;
  end loop;

  for c in
    select * from public.post_booking_charges
    where status in ('awaiting_payment','processing')
      and expires_at<=now()
    for update skip locked
  loop
    if c.payment_id is not null then
      update public.payments
      set status='expired',updated_at=now()
      where id=c.payment_id and status in ('awaiting_payment','under_review','processing');
    end if;

    update public.post_booking_charges
    set status='expired',updated_at=now()
    where id=c.id;

    if c.kind='modification' then
      update public.modification_requests
      set status='payment_expired',updated_at=now()
      where id=c.modification_request_id and status='awaiting_payment';

      insert into public.notification_outbox(
        user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
      ) values(
        c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_cancelled_unpaid',now(),
        jsonb_build_object('amount_cents',c.amount_cents,'expired_at',now()),
        'mod-unpaid-cancelled-'||c.modification_request_id::text
      )
      on conflict (dedupe_key) do nothing;

      insert into public.reservation_change_events(
        reservation_id,modification_request_id,event_type,amount_cents
      ) values(c.reservation_id,c.modification_request_id,'payment_expired',c.amount_cents);
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$

revoke all on function public.finalize_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_free_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_post_booking_payment_state_atomic(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_post_booking_deadlines() from public,anon,authenticated;
grant execute on function public.finalize_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.confirm_free_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.update_post_booking_payment_state_atomic(uuid,uuid,text) to service_role;
grant execute on function public.cancel_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.process_post_booking_deadlines() to service_role;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='process-post-booking-deadlines' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'process-post-booking-deadlines',
    '*/5 * * * *',
    'select public.process_post_booking_deadlines();'
  );
end $$;
