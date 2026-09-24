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

  if p.status='cancelled' and r.status='cancelled' then
    return query select p.status,r.status,r.id;
    return;
  end if;

  if p.status<>'awaiting_payment' or r.status<>'pending_payment' then
    raise exception 'payment_not_cancellable';
  end if;

  update public.payments set status='cancelled',updated_at=now() where id=p.id;
  update public.reservations set status='cancelled',hold_expires_at=now(),updated_at=now() where id=r.id;
  update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';

  return query select 'cancelled'::text,'cancelled'::text,r.id;
end;
$function$;

revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from public;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from anon;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from authenticated;
grant execute on function public.cancel_pending_payment_mock_atomic(uuid,uuid) to service_role;
