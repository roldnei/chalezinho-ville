CREATE OR REPLACE FUNCTION public.reconcile_pagbank_post_booking_payment(p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint)
 RETURNS TABLE(result_payment_status text, result_charge_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.payments%rowtype; c public.post_booking_charges%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents
     or p.metadata->>'kind'<>'post_booking_charge' then raise exception 'payment_mismatch'; end if;
  select * into c from public.post_booking_charges
    where id=(p.metadata->>'post_booking_charge_id')::uuid for update;
  if not found or c.amount_cents<>coalesce((p.metadata->>'base_amount_cents')::bigint,p.amount_cents)
     or p.amount_cents<>c.amount_cents+coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)
     or c.user_id<>p.user_id or c.reservation_id<>p.reservation_id then raise exception 'charge_mismatch'; end if;
  -- A newer attempt can replace this payment after a definitive refusal.
  -- Old notifications must not apply the charge again or cause endless retries.
  if c.payment_id is distinct from p.id then
    if p_status='PAID' and p.status not in ('paid','refunded') then
      update public.payments set status='paid',
        metadata=metadata||'{"manual_review":"post_booking_superseded_paid"}'::jsonb,
        updated_at=now() where id=p.id;
    end if;
    return query select (select status from public.payments where id=p.id),c.status;
    return;
  end if;
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
end $function$
