-- Atomic reservation modification and guarantee capture hardening.

CREATE OR REPLACE FUNCTION public.apply_modification_mock_atomic(p_request_id uuid, p_actor_user_id uuid)
 RETURNS TABLE(result_status text, result_payment_id uuid, result_total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.modification_requests%rowtype;
  r public.reservations%rowtype;
  v_amount bigint;
  v_payment_id uuid;
  v_existing public.payments%rowtype;
  v_total numeric(12,2);
  v_idem text;
begin
  select * into m
  from public.modification_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'modification_not_found';
  end if;
  if m.status <> 'accepted' then
    raise exception 'guest_acceptance_required';
  end if;

  select * into r
  from public.reservations
  where id=m.reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  v_amount := greatest(0,coalesce(m.admin_additional_amount_cents,0));
  v_total := round((coalesce(r.total_amount,0) + v_amount/100.0)::numeric,2);

  begin
    update public.reservations
       set property_id=coalesce(m.requested_property_id,r.property_id),
           check_in=coalesce(m.requested_check_in,r.check_in),
           check_out=coalesce(m.requested_check_out,r.check_out),
           total_amount=v_total,
           updated_at=now()
     where id=r.id;
  exception
    when exclusion_violation then
      raise exception 'dates_unavailable';
  end;

  if v_amount > 0 then
    v_idem := 'mod-'||m.id::text;

    select * into v_existing
    from public.payments
    where idempotency_key=v_idem
    for update;

    if found then
      if v_existing.status <> 'paid' then
        raise exception 'additional_payment_not_paid';
      end if;
      v_payment_id := v_existing.id;
    else
      insert into public.payments(
        reservation_id,user_id,provider,method,amount_cents,status,idempotency_key,metadata
      ) values (
        m.reservation_id,m.user_id,'mock','mock',v_amount,'paid',v_idem,
        jsonb_build_object('development',true,'kind','modification','modification_request_id',m.id)
      )
      returning id into v_payment_id;
    end if;

    if not exists (
      select 1 from public.financial_entries
      where payment_id=v_payment_id and entry_type='additional_charge'
    ) then
      insert into public.financial_entries(
        reservation_id,payment_id,entry_type,amount_cents,description
      ) values (
        m.reservation_id,v_payment_id,'additional_charge',v_amount,'Revisão de tarifa da alteração'
      );
    end if;
  end if;

  update public.modification_requests
     set status='applied',applied_at=now(),updated_at=now()
   where id=m.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values (
    m.reservation_id,m.id,'applied',to_jsonb(r),
    jsonb_build_object(
      'property_id',coalesce(m.requested_property_id,r.property_id),
      'check_in',coalesce(m.requested_check_in,r.check_in),
      'check_out',coalesce(m.requested_check_out,r.check_out),
      'total_amount',v_total
    ),
    v_amount,p_actor_user_id
  );

  return query select 'applied'::text,v_payment_id,v_total;
end;
$function$


revoke all on function public.apply_modification_mock_atomic(uuid,uuid) from public, anon, authenticated;

grant execute on function public.apply_modification_mock_atomic(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.capture_guarantee_mock_atomic(p_guarantee_id uuid, p_actor_user_id uuid, p_amount_cents bigint)
 RETURNS TABLE(result_status text, captured_amount_cents bigint, released_amount_cents bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g public.guarantees%rowtype;
  v_amount bigint;
  v_incident_id uuid;
begin
  select * into g
  from public.guarantees
  where id=p_guarantee_id
  for update;

  if not found then
    raise exception 'guarantee_not_found';
  end if;

  if g.status='captured' then
    return query select 'captured'::text,g.captured_amount_cents,g.amount_cents-g.captured_amount_cents;
    return;
  end if;

  if g.status not in ('incident_reported','capture_requested') then
    raise exception 'incident_required';
  end if;

  v_amount := greatest(0,coalesce(p_amount_cents,0));
  if v_amount > g.amount_cents then
    raise exception 'capture_exceeds_guarantee';
  end if;

  select id into v_incident_id
  from public.incidents
  where guarantee_id=g.id and status='open'
  order by created_at desc
  limit 1
  for update;

  if v_incident_id is null then
    raise exception 'incident_required';
  end if;

  update public.guarantees
     set status='captured',captured_amount_cents=v_amount,updated_at=now()
   where id=g.id;

  if v_amount>0 and not exists (
    select 1 from public.financial_entries
    where reservation_id=g.reservation_id
      and entry_type='guarantee_capture'
      and description='Captura parcial de garantia'
  ) then
    insert into public.financial_entries(
      reservation_id,entry_type,amount_cents,description
    ) values (
      g.reservation_id,'guarantee_capture',v_amount,'Captura parcial de garantia'
    );
  end if;

  update public.incidents
     set status='resolved',resolved_at=now()
   where guarantee_id=g.id and status='open';

  return query select 'captured'::text,v_amount,g.amount_cents-v_amount;
end;
$function$


revoke all on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) from public, anon, authenticated;

grant execute on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) to service_role;