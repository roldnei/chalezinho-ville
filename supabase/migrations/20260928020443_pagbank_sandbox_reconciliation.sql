-- Credentials never live in Postgres. Only the Edge Functions read the sandbox token.
create or replace function public.guest_payment_identity(p_user_id uuid)
returns table(document_type text, document_number text)
language sql stable security definer set search_path = '' as $$
  select g.document_type, g.document_number
  from private.guest_identities g where g.user_id=p_user_id
$$;
revoke all on function public.guest_payment_identity(uuid) from public, anon, authenticated;
grant execute on function public.guest_payment_identity(uuid) to service_role;

create unique index if not exists payments_provider_charge_unique
on public.payments(provider,provider_payment_id) where provider_payment_id is not null;

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
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
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
