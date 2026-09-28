-- PagBank installment interest is part of the captured amount and refund allocation.
create or replace function public.reconcile_pagbank_sandbox_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_reservation_status text, result_reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype; v_status text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents then
    raise exception 'payment_mismatch';
  end if;
  select * into r from public.reservations where id=p.reservation_id for update;
  if not found then raise exception 'reservation_missing'; end if;
  v_status:=case p_status
    when 'PAID' then 'paid' when 'WAITING' then 'awaiting_payment'
    when 'IN_ANALYSIS' then 'under_review' when 'AUTHORIZED' then 'processing'
    when 'DECLINED' then 'refused' when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired'
    else null end;
  if v_status is null then raise exception 'unknown_provider_status'; end if;
  if p.status in ('refunded','partially_refunded','disputed','chargeback') then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status='paid' and v_status<>'paid' then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status in ('refused','cancelled','expired') and v_status not in ('paid') then
    return query select p.status,r.status,r.id; return;
  end if;
  if v_status='paid' then
    if coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)>0
       and coalesce((p.metadata->>'buyer_fee_applied')::boolean,false)=false then
      update public.reservations set total_amount=round((total_amount+
        (p.metadata->>'buyer_interest_cents')::bigint/100.0)::numeric,2),updated_at=now()
        where id=r.id;
      update public.payments set metadata=metadata||'{"buyer_fee_applied":true}'::jsonb where id=p.id;
    end if;
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status='confirmed' then
      update public.payments set metadata=metadata-'manual_review' where id=p.id;
    elsif r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
        update public.payments set metadata=metadata-'manual_review' where id=p.id;
      exception when exclusion_violation then
        update public.payments set metadata=metadata||'{"manual_review":"paid_dates_unavailable"}'::jsonb where id=p.id;
      end;
    else
      update public.payments set metadata=metadata||'{"manual_review":"paid_after_hold"}'::jsonb where id=p.id;
    end if;
  elsif v_status in ('refused','cancelled','expired') then
    if p.status not in ('paid','refused','cancelled','expired') then
      update public.payments set status=v_status,updated_at=now() where id=p.id;
      if r.status in ('pending_payment','hold') then
        update public.reservations set status='not_confirmed',not_confirmed_at=now(),
          not_confirmed_reason=case when v_status='refused' then 'payment_refused'
            when v_status='expired' then 'payment_expired' else 'payment_cancelled' end,
          hold_expires_at=now(),updated_at=now() where id=r.id;
        update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';
      end if;
    end if;
  elsif p.status in ('awaiting_payment','processing','under_review') then
    update public.payments set status=v_status,updated_at=now() where id=p.id;
    if v_status='under_review' and r.status='pending_payment' then
      update public.reservations set hold_expires_at=null,updated_at=now() where id=r.id;
    end if;
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.reservations where id=r.id),r.id;
end $$;
revoke all on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) to service_role;

-- Reconcile a post-booking charge only after a server-authenticated PagBank lookup.
create or replace function public.reconcile_pagbank_post_booking_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_charge_status text)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; c public.post_booking_charges%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents
     or p.metadata->>'kind'<>'post_booking_charge' then raise exception 'payment_mismatch'; end if;
  select * into c from public.post_booking_charges where payment_id=p.id for update;
  if not found or c.amount_cents<>coalesce((p.metadata->>'base_amount_cents')::bigint,p.amount_cents)
     or p.amount_cents<>c.amount_cents+coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)
     or c.user_id<>p.user_id then raise exception 'charge_mismatch'; end if;
  if p_status='PAID' then
    if c.status='applied' and p.status='paid' then
      return query select p.status,c.status; return;
    end if;
    if c.status in ('cancelled','expired') or c.expires_at<=now()
       or p.status in ('refused','expired','cancelled') then
      update public.payments set status='paid',
        metadata=metadata||'{"manual_review":"post_booking_paid_after_deadline"}'::jsonb,
        updated_at=now() where id=p.id;
    else
      begin
        perform public.finalize_post_booking_charge_atomic(p.id,p.user_id);
        if coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)>0 then
          insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
            values(c.reservation_id,p.id,
              case when c.kind='modification' then 'additional_charge'
                   when c.snapshot->>'purchase_mode'='upgrade' then 'upgrade'
                   else 'experience' end,
              (p.metadata->>'buyer_interest_cents')::bigint,'Juros do parcelamento assumidos pelo hóspede');
          update public.reservations set total_amount=round((total_amount+
            (p.metadata->>'buyer_interest_cents')::bigint/100.0)::numeric,2),
            updated_at=now() where id=c.reservation_id;
        end if;
      exception when others then
        update public.payments set status='paid',
          metadata=metadata||'{"manual_review":"post_booking_apply_failed"}'::jsonb,
          updated_at=now() where id=p.id;
      end;
    end if;
  elsif p.status='paid' or p.status in ('refused','cancelled','expired') then
    null;
  elsif p_status in ('DECLINED','CANCELED','CANCELLED','EXPIRED') then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,
        case when p_status='DECLINED' then 'refused' else 'expired' end);
    end if;
  elsif p_status='IN_ANALYSIS' then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,'under_review');
    end if;
  elsif p_status='AUTHORIZED' then
    update public.payments set status='processing',updated_at=now() where id=p.id;
  elsif p_status<>'WAITING' then
    raise exception 'unknown_provider_status';
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.post_booking_charges where id=c.id);
end $$;
revoke all on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) to service_role;
