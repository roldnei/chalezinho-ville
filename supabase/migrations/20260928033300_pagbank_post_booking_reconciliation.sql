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
  if not found or c.amount_cents<>p.amount_cents or c.user_id<>p.user_id then raise exception 'charge_mismatch'; end if;
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
