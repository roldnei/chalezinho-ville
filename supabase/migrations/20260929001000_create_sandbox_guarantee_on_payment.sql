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
    -- A confirmed booking must have a guarantee row for the token scheduler.
    -- This also repairs an idempotent PAID callback that ran before the row existed.
    insert into public.guarantees(reservation_id,provider,amount_cents,status)
      select r.id,'pagbank_sandbox',pr.guarantee_amount_cents,'pending'
      from public.reservations confirmed
      join public.properties pr on pr.id=confirmed.property_id
      where confirmed.id=r.id and confirmed.status='confirmed'
        and pr.guarantee_amount_cents>0
      on conflict (reservation_id) do nothing;
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

-- Restore already confirmed sandbox bookings with a vault token, without
-- authorizing cards or modifying existing guarantee lifecycles.
insert into public.guarantees(reservation_id,provider,amount_cents,status)
  select r.id,'pagbank_sandbox',pr.guarantee_amount_cents,'pending'
  from public.reservations r
  join public.properties pr on pr.id=r.property_id
  join public.guarantee_card_tokens t on t.reservation_id=r.id and t.user_id=r.user_id
  where r.status='confirmed' and pr.guarantee_amount_cents>0
    and exists (select 1 from public.payments p where p.reservation_id=r.id
      and p.provider='pagbank_sandbox' and p.status='paid')
  on conflict (reservation_id) do nothing;
