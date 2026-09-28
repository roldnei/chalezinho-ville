-- A failed read before dispatch is distinguishable from a request with
-- uncertain delivery. Neither event confirms that money moved.
alter table public.reservation_refund_attempts
  drop constraint if exists reservation_refund_attempts_event_check;
alter table public.reservation_refund_attempts
  add constraint reservation_refund_attempts_event_check
  check(event in ('claim','precheck_failed','request_accepted','request_uncertain',
    'provider_confirmed','provider_unknown','provider_failed'));

create or replace function public.refund_precheck_failed(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set state='prepared',sent_at=null
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_precheck_state_changed'; end if;
  insert into public.reservation_refund_attempts(refund_id,event)
    values(p_refund_id,'precheck_failed');
end $$;
revoke all on function public.refund_precheck_failed(uuid) from public,anon,authenticated;
grant execute on function public.refund_precheck_failed(uuid) to service_role;
