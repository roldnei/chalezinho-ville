-- Guest requests and discretionary refunds share one auditable refund ledger.
create table if not exists public.reservation_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  guest_user_id uuid not null references auth.users(id),
  reason text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'requested' check(status in ('requested','rejected','approved','processing','completed')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  cancellation_id uuid references public.reservation_cancellations(id)
);
create unique index if not exists reservation_cancel_requests_active_idx
  on public.reservation_cancel_requests(reservation_id)
  where status in ('requested','approved','processing');
alter table public.reservation_cancel_requests enable row level security;
revoke all on public.reservation_cancel_requests from anon,authenticated;
grant all on public.reservation_cancel_requests to service_role;

alter table public.reservation_cancellations
  add column if not exists kind text not null default 'policy_cancellation'
    check(kind in ('policy_cancellation','voluntary_refund')),
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists guest_request_id uuid references public.reservation_cancel_requests(id),
  add column if not exists operation_key uuid unique;
alter table public.reservation_cancellations
  drop constraint if exists reservation_cancellations_reservation_id_key;
create unique index if not exists reservation_policy_cancellation_once_idx
  on public.reservation_cancellations(reservation_id) where kind='policy_cancellation';
create unique index if not exists reservation_cancellation_guest_request_idx
  on public.reservation_cancellations(guest_request_id) where guest_request_id is not null;

alter table public.reservation_refunds
  add column if not exists provider_refunded_cents bigint
    check(provider_refunded_cents>=0),
  add column if not exists provider_paid_cents bigint
    check(provider_paid_cents>=0);

-- Only one claim against a charge can be in flight. The original key is
-- retained through timeouts; a second click cannot create a new request.
create or replace function public.claim_reservation_refund(p_refund_id uuid)
returns table(charge_id text, requested_cents bigint, idempotency_key text)
language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found or v.state<>'prepared' then return; end if;
  perform 1 from public.payments where id=v.payment_id for update;
  if exists(select 1 from public.reservation_refunds x where x.payment_id=v.payment_id
    and x.id<>v.id and x.state in ('dispatching','uncertain')) then return; end if;
  update public.reservation_refunds set state='dispatching',sent_at=null where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event) values(v.id,'claim');
  return query select v.charge_id,v.requested_cents,v.idempotency_key;
end $$;
revoke all on function public.claim_reservation_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_refund(uuid) to service_role;

-- This is called only before the HTTP POST. No provider request was made, so
-- the same intent may be claimed again after the problem is fixed.
create or replace function public.refund_precheck_failed(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set state='prepared',sent_at=null
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_precheck_state_changed'; end if;
  insert into public.reservation_refund_attempts(refund_id,event)
    values(p_refund_id,'provider_unknown');
end $$;
revoke all on function public.refund_precheck_failed(uuid) from public,anon,authenticated;
grant execute on function public.refund_precheck_failed(uuid) to service_role;

-- The call boundary is persisted before contacting PagBank. A timeout after
-- this point remains uncertain and must never cause an automatic new POST.
create or replace function public.mark_refund_dispatch(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set sent_at=now()
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_dispatch_state_changed'; end if;
end $$;
revoke all on function public.mark_refund_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.mark_refund_dispatch(uuid) to service_role;

drop function if exists public.confirm_reservation_refund(uuid,text,text,bigint);
create function public.confirm_reservation_refund(
  p_refund_id uuid,p_charge_id text,p_provider_status text,
  p_provider_paid_cents bigint,p_provider_refunded_cents bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  c public.reservation_cancellations%rowtype;
  v_prior bigint; v_case_confirmed bigint; v_case_due bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  if v.state not in ('dispatching','uncertain') or v.sent_at is null or
     v.charge_id is distinct from p_charge_id or p_provider_status not in ('PAID','CANCELED') then
    raise exception 'provider_refund_unconfirmed';
  end if;
  select * into p from public.payments where id=v.payment_id for update;
  select * into c from public.reservation_cancellations where id=v.cancellation_id for update;
  if p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from v.charge_id
     or p.reservation_id is distinct from c.reservation_id
     or p_provider_paid_cents is distinct from p.amount_cents then
    raise exception 'refund_payment_mismatch';
  end if;
  select coalesce(sum(confirmed_cents),0) into v_prior from public.reservation_refunds
    where payment_id=p.id and id<>v.id and state='confirmed';
  -- Exact cumulative provider total is the receipt for this intent. A larger
  -- total may reflect an external refund and therefore needs manual review.
  if p_provider_refunded_cents is distinct from v_prior+v.requested_cents
     or p_provider_refunded_cents>p.amount_cents then
    raise exception 'provider_refund_amount_mismatch';
  end if;
  update public.reservation_refunds set state='confirmed',confirmed_cents=v.requested_cents,
    provider_status=p_provider_status,provider_paid_cents=p_provider_paid_cents,
    provider_refunded_cents=p_provider_refunded_cents,checked_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event,provider_status)
    values(v.id,'provider_confirmed',p_provider_status);
  insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
    values(c.reservation_id,p.id,'refund',-v.requested_cents,'Estorno PagBank confirmado');
  if p_provider_refunded_cents=p.amount_cents then
    update public.payments set status='refunded',updated_at=now() where id=p.id;
  end if;
  select coalesce(sum(confirmed_cents),0),coalesce(sum(requested_cents),0)
    into v_case_confirmed,v_case_due from public.reservation_refunds where cancellation_id=c.id;
  if v_case_confirmed=c.refund_due_cents and v_case_due=c.refund_due_cents and
     not exists(select 1 from public.reservation_refunds where cancellation_id=c.id and state<>'confirmed') then
    update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
    if c.kind='policy_cancellation' then
      update public.reservations set status='cancelled',cancelled_at=now(),
        cancellation_actor=case when c.guest_request_id is null then 'admin' else 'guest' end,
        cancellation_reason=c.reason,updated_at=now()
        where id=c.reservation_id and status='confirmed';
      if not found then raise exception 'reservation_changed'; end if;
      update public.reservation_cancel_requests set status='completed'
        where id=c.guest_request_id and status in ('approved','processing');
      update public.experience_order_items set status='cancelled'
        where order_id in (select id from public.experience_orders where reservation_id=c.reservation_id)
          and status='active';
      update public.experience_orders set status='cancelled'
        where reservation_id=c.reservation_id and status='active';
    end if;
  end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_reservation_refund(uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund(uuid,text,text,bigint,bigint) to service_role;

create or replace function public.confirm_zero_refund_cancellation(p_cancellation_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.reservation_cancellations%rowtype;
begin
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or c.kind<>'policy_cancellation' or c.refund_due_cents<>0
    or c.status<>'pending_provider'
    or exists(select 1 from public.reservation_refunds where cancellation_id=c.id) then
    raise exception 'zero_refund_cancellation_invalid';
  end if;
  update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
  update public.reservations set status='cancelled',cancelled_at=now(),
    cancellation_actor=case when c.guest_request_id is null then 'admin' else 'guest' end,
    cancellation_reason=c.reason,updated_at=now()
    where id=c.reservation_id and status='confirmed';
  if not found then raise exception 'reservation_changed'; end if;
  update public.reservation_cancel_requests set status='completed' where id=c.guest_request_id;
  update public.experience_order_items set status='cancelled'
    where order_id in (select id from public.experience_orders where reservation_id=c.reservation_id)
      and status='active';
  update public.experience_orders set status='cancelled'
    where reservation_id=c.reservation_id and status='active';
  return 'confirmed';
end $$;
revoke all on function public.confirm_zero_refund_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.confirm_zero_refund_cancellation(uuid) to service_role;
