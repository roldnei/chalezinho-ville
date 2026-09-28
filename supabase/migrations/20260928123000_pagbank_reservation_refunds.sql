-- A cancellation never releases inventory until every due refund is confirmed.
-- This schema is shared, but the refund endpoint is restricted to development.
create table if not exists public.reservation_cancellations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  actor_user_id uuid not null references auth.users(id),
  accepted_document_id uuid not null references public.policy_documents(id),
  accepted_version text not null,
  accepted_at timestamptz not null,
  reason text not null,
  calculation jsonb not null,
  refund_due_cents bigint not null check (refund_due_cents >= 0),
  status text not null default 'prepared'
    check (status in ('prepared','pending_provider','needs_review','confirmed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  confirmed_at timestamptz
);

create table if not exists public.reservation_refunds (
  id uuid primary key default gen_random_uuid(),
  cancellation_id uuid not null references public.reservation_cancellations(id),
  payment_id uuid not null references public.payments(id),
  charge_id text not null check (charge_id ~ '^CHAR_[A-Za-z0-9-]+$'),
  requested_cents bigint not null check (requested_cents > 0),
  confirmed_cents bigint not null default 0 check (confirmed_cents >= 0 and confirmed_cents <= requested_cents),
  idempotency_key text not null unique,
  state text not null default 'prepared'
    check (state in ('prepared','dispatching','uncertain','confirmed','failed')),
  provider_status text,
  provider_refund_id text,
  sent_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cancellation_id,payment_id)
);

create table if not exists public.reservation_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.reservation_refunds(id),
  event text not null check (event in ('claim','request_accepted','request_uncertain','provider_confirmed','provider_unknown','provider_failed')),
  provider_status text,
  created_at timestamptz not null default now()
);

create index if not exists reservation_refunds_payment_idx on public.reservation_refunds(payment_id);
create index if not exists reservation_refund_attempts_refund_idx on public.reservation_refund_attempts(refund_id,created_at);
alter table public.reservation_cancellations enable row level security;
alter table public.reservation_refunds enable row level security;
alter table public.reservation_refund_attempts enable row level security;
revoke all on public.reservation_cancellations,public.reservation_refunds,public.reservation_refund_attempts from anon,authenticated;
grant all on public.reservation_cancellations,public.reservation_refunds,public.reservation_refund_attempts to service_role;

-- This claim is the only gate to a POST at PagBank. A duplicate click, a
-- timeout or a repeated webhook can never claim the same attempt again.
create or replace function public.claim_reservation_refund(p_refund_id uuid)
returns table(charge_id text, requested_cents bigint, idempotency_key text)
language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found or v.state <> 'prepared' then return; end if;
  update public.reservation_refunds set state='dispatching',sent_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event) values(v.id,'claim');
  return query select v.charge_id,v.requested_cents,v.idempotency_key;
end $$;
revoke all on function public.claim_reservation_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_refund(uuid) to service_role;

-- A confirmed refund must be tied to its original captured payment. Amount
-- caps include both confirmed and in-flight refunds across cancellation IDs.
create or replace function public.reserve_reservation_refund(
  p_cancellation_id uuid,p_payment_id uuid,p_charge_id text,p_amount_cents bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; c public.reservation_cancellations%rowtype;
  v_reserved bigint; v_id uuid;
begin
  select * into p from public.payments where id=p_payment_id for update;
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or p.id is null or p.reservation_id<>c.reservation_id
     or p.provider<>'pagbank_sandbox' or p.status<>'paid'
     or p.provider_payment_id is distinct from p_charge_id
     or p_amount_cents<=0 then raise exception 'refund_payment_mismatch'; end if;
  select id into v_id from public.reservation_refunds
    where cancellation_id=c.id and payment_id=p.id;
  if found then return v_id; end if;
  select coalesce(sum(requested_cents),0) into v_reserved
    from public.reservation_refunds where payment_id=p.id and state<>'failed';
  if v_reserved+p_amount_cents>p.amount_cents then raise exception 'refund_exceeds_captured'; end if;
  insert into public.reservation_refunds(cancellation_id,payment_id,charge_id,requested_cents,idempotency_key)
  values(c.id,p.id,p_charge_id,p_amount_cents,'refund-'||gen_random_uuid()::text)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reserve_reservation_refund(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_reservation_refund(uuid,uuid,text,bigint) to service_role;

create or replace function public.confirm_reservation_refund(
  p_refund_id uuid,p_charge_id text,p_provider_status text,p_confirmed_cents bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  c public.reservation_cancellations%rowtype;
  v_confirmed bigint; v_due bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.charge_id is distinct from p_charge_id or p_provider_status<>'CANCELED'
     or p_confirmed_cents is distinct from v.requested_cents then
    raise exception 'provider_refund_unconfirmed';
  end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  if v.state not in ('dispatching','uncertain') then raise exception 'refund_not_sent'; end if;
  select * into p from public.payments where id=v.payment_id for update;
  select * into c from public.reservation_cancellations where id=v.cancellation_id for update;
  if p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from v.charge_id
     or p.amount_cents<v.requested_cents or c.reservation_id is distinct from p.reservation_id then
    raise exception 'refund_payment_mismatch';
  end if;
  update public.reservation_refunds set state='confirmed',confirmed_cents=p_confirmed_cents,
    provider_status=p_provider_status,checked_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event,provider_status)
    values(v.id,'provider_confirmed',p_provider_status);
  insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
    values(c.reservation_id,p.id,'refund',-p_confirmed_cents,'Estorno PagBank confirmado');
  if p_confirmed_cents=p.amount_cents then
    update public.payments set status='refunded',updated_at=now() where id=p.id;
  end if;
  select coalesce(sum(confirmed_cents),0) into v_confirmed from public.reservation_refunds where cancellation_id=c.id;
  select coalesce(sum(requested_cents),0) into v_due from public.reservation_refunds where cancellation_id=c.id;
  if v_confirmed=c.refund_due_cents and v_due=c.refund_due_cents
     and not exists(select 1 from public.reservation_refunds where cancellation_id=c.id and state<>'confirmed') then
    update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
    update public.reservations set status='cancelled',cancelled_at=now(),
      cancellation_actor='admin',cancellation_reason=c.reason,updated_at=now()
      where id=c.reservation_id and status='confirmed';
  end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_reservation_refund(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund(uuid,text,text,bigint) to service_role;

-- A policy may retain every captured cent. The cancellation still requires
-- explicit administrator approval and cannot be inferred from a table edit.
create or replace function public.confirm_zero_refund_cancellation(p_cancellation_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.reservation_cancellations%rowtype;
begin
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or c.refund_due_cents<>0 or c.status<>'pending_provider'
     or exists(select 1 from public.reservation_refunds where cancellation_id=c.id) then
    raise exception 'zero_refund_cancellation_invalid';
  end if;
  update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
  update public.reservations set status='cancelled',cancelled_at=now(),
    cancellation_actor='admin',cancellation_reason=c.reason,updated_at=now()
    where id=c.reservation_id and status='confirmed';
  if not found then raise exception 'reservation_changed'; end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_zero_refund_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.confirm_zero_refund_cancellation(uuid) to service_role;
