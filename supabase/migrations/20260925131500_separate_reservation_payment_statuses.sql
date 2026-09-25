-- Reserva e pagamento possuem ciclos de vida independentes.
-- Uma tentativa de pagamento que falhou nunca representa cancelamento de uma
-- reserva confirmada.

alter table public.reservations
  add column if not exists not_confirmed_at timestamptz,
  add column if not exists not_confirmed_reason text,
  add column if not exists cancellation_actor text,
  add column if not exists cancellation_reason text,
  add column if not exists no_show_at timestamptz;

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('hold','pending_payment','confirmed','cancelled','expired','not_confirmed','no_show'));

alter table public.reservations
  drop constraint if exists reservations_not_confirmed_reason_check;
alter table public.reservations
  add constraint reservations_not_confirmed_reason_check
  check (
    not_confirmed_reason is null or not_confirmed_reason in (
      'payment_refused','payment_expired','payment_cancelled','hold_expired',
      'checkout_abandoned','technical_failure'
    )
  );

alter table public.reservations
  drop constraint if exists reservations_cancellation_actor_check;
alter table public.reservations
  add constraint reservations_cancellation_actor_check
  check (cancellation_actor is null or cancellation_actor in ('guest','admin','system'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in (
    'awaiting_payment','action_required','processing','under_review','paid',
    'refused','cancelled','expired','partially_refunded','refunded','disputed','chargeback'
  ));

-- Corrige somente tentativas que nunca chegaram a ser reservas confirmadas.
update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.updated_at,now()),
    not_confirmed_reason=case
      when (select p0.status from public.payments p0 where p0.reservation_id=r.id order by p0.created_at desc limit 1)='refused' then 'payment_refused'
      when (select p0.status from public.payments p0 where p0.reservation_id=r.id order by p0.created_at desc limit 1)='expired' then 'payment_expired'
      else 'hold_expired'
    end,
    cancelled_at=null,
    cancellation_actor=null,
    cancellation_reason=null,
    updated_at=now()
where r.status='expired' and r.confirmed_at is null;

update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.cancelled_at,r.updated_at,now()),
    not_confirmed_reason='payment_cancelled',
    cancelled_at=null,
    cancellation_actor=null,
    cancellation_reason=null,
    updated_at=now()
where r.status='cancelled' and r.confirmed_at is null;

-- Registros antigos sem payment row também são tentativas não confirmadas.
update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.updated_at,now()),
    not_confirmed_reason='hold_expired',
    updated_at=now()
where r.status='expired' and r.confirmed_at is null;

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('hold','pending_payment','confirmed','cancelled','not_confirmed','no_show'));

create or replace function public.update_initial_payment_state_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid,
  p_outcome text
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
  v_guarantee bigint;
begin
  if p_outcome not in ('paid','refused','under_review','expired') then
    raise exception 'invalid_outcome';
  end if;

  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.user_id<>p_user_id then raise exception 'not_found'; end if;
  if coalesce(p.metadata->>'kind','')='post_booking_charge' then
    raise exception 'invalid_payment_kind';
  end if;

  select * into r from public.reservations where id=p.reservation_id for update;
  if not found or r.user_id<>p_user_id then raise exception 'not_found'; end if;

  if p.status=p_outcome and (
    (p_outcome='paid' and r.status='confirmed') or
    (p_outcome='under_review' and r.status='pending_payment') or
    (p_outcome='refused' and r.status='not_confirmed' and r.not_confirmed_reason='payment_refused') or
    (p_outcome='expired' and r.status='not_confirmed' and r.not_confirmed_reason='payment_expired')
  ) then
    return query select p.status,r.status,r.id;
    return;
  end if;

  if p.status not in ('awaiting_payment','processing','under_review')
     or r.status not in ('hold','pending_payment') then
    raise exception 'payment_state_final';
  end if;

  if p_outcome='paid' then
    update public.payments set status='paid',updated_at=now() where id=p.id;
    update public.reservations
       set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),hold_expires_at=null,
           not_confirmed_at=null,not_confirmed_reason=null,updated_at=now()
     where id=r.id;
    update public.experience_orders set status='active'
     where reservation_id=r.id and status='pending';

    select coalesce(pr.guarantee_amount_cents,0) into v_guarantee
      from public.properties pr where pr.id=r.property_id;
    if v_guarantee>0 and not exists (
      select 1 from public.guarantees g where g.reservation_id=r.id
    ) then
      insert into public.guarantees(reservation_id,provider,amount_cents,status)
      values(r.id,'mock',v_guarantee,'pending');
    end if;
  elsif p_outcome='under_review' then
    update public.payments set status='under_review',updated_at=now() where id=p.id;
    -- Uma transação em análise mantém a unidade protegida até a decisão do provider.
    update public.reservations
       set status='pending_payment',hold_expires_at=null,updated_at=now()
     where id=r.id;
  else
    update public.payments set status=p_outcome,updated_at=now() where id=p.id;
    update public.reservations
       set status='not_confirmed',hold_expires_at=now(),not_confirmed_at=now(),
           not_confirmed_reason=case when p_outcome='refused' then 'payment_refused' else 'payment_expired' end,
           updated_at=now()
     where id=r.id;
    update public.experience_orders set status='cancelled'
     where reservation_id=r.id and status='pending';
  end if;

  return query select p_outcome,
    case when p_outcome='paid' then 'confirmed'
         when p_outcome='under_review' then 'pending_payment'
         else 'not_confirmed' end,
    r.id;
end;
$function$;

revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from public;
revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from anon;
revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from authenticated;
grant execute on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) to service_role;

create or replace function public.cancel_pending_payment_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.user_id<>p_user_id then raise exception 'not_found'; end if;
  select * into r from public.reservations where id=p.reservation_id for update;

  if p.status='cancelled' and r.status='not_confirmed' and r.not_confirmed_reason='payment_cancelled' then
    return query select p.status,r.status,r.id;
    return;
  end if;
  if p.status<>'awaiting_payment' or r.status not in ('hold','pending_payment') then
    raise exception 'payment_not_cancellable';
  end if;

  update public.payments set status='cancelled',updated_at=now() where id=p.id;
  update public.reservations
     set status='not_confirmed',hold_expires_at=now(),not_confirmed_at=now(),
         not_confirmed_reason='payment_cancelled',updated_at=now()
   where id=r.id;
  update public.experience_orders set status='cancelled'
   where reservation_id=r.id and status='pending';

  return query select 'cancelled'::text,'not_confirmed'::text,r.id;
end;
$function$;

revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from public;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from anon;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from authenticated;
grant execute on function public.cancel_pending_payment_mock_atomic(uuid,uuid) to service_role;

create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path='public'
as $function$
declare v_count integer;
begin
  with due as (
    select r.id
    from public.reservations r
    where r.status in ('hold','pending_payment')
      and r.hold_expires_at is not null
      and r.hold_expires_at<=now()
      and not exists (
        select 1 from public.payments p
        where p.reservation_id=r.id and p.status='under_review'
      )
    for update
  )
  update public.payments p
     set status='expired',updated_at=now()
   where p.reservation_id in (select id from due)
     and p.status in ('awaiting_payment','action_required','processing');

  update public.reservations r
     set status='not_confirmed',not_confirmed_at=now(),
         not_confirmed_reason=case
           when exists(select 1 from public.payments p where p.reservation_id=r.id) then 'payment_expired'
           else 'hold_expired'
         end,
         updated_at=now()
   where r.status in ('hold','pending_payment')
     and r.hold_expires_at is not null
     and r.hold_expires_at<=now()
     and not exists (
       select 1 from public.payments p
       where p.reservation_id=r.id and p.status='under_review'
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.expire_stale_reservations() from public;
revoke all on function public.expire_stale_reservations() from anon;
revoke all on function public.expire_stale_reservations() from authenticated;
grant execute on function public.expire_stale_reservations() to service_role;

create index if not exists reservations_status_created_idx
  on public.reservations(status,created_at desc);
