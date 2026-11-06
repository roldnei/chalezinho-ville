create function public.reject_expired_pix_refund(p_refund_id uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  refund public.reservation_refunds%rowtype;
  payment public.payments%rowtype;
  refund_case public.reservation_cancellations%rowtype;
  rejection public.reservation_refund_provider_observations%rowtype;
  observation public.reservation_refund_provider_observations%rowtype;
  prior_refunded bigint;
begin
  select * into refund from public.reservation_refunds where id=p_refund_id for update;
  if not found or refund.state<>'uncertain' or refund.sent_at is null then return false; end if;

  select * into payment from public.payments where id=refund.payment_id for update;
  select * into refund_case from public.reservation_cancellations where id=refund.cancellation_id for update;
  if payment.provider<>'pagbank_sandbox' or payment.method<>'pix' or payment.status<>'paid'
     or payment.provider_payment_id is distinct from refund.charge_id
     or payment.reservation_id is distinct from refund_case.reservation_id
     or refund_case.kind<>'voluntary_refund' or refund_case.status<>'pending_provider'
     or refund_case.calculation->>'reason'='unprovided_experience'
     or exists (select 1 from public.reservation_refunds where cancellation_id=refund_case.id and id<>refund.id)
  then return false; end if;

  select * into rejection from public.reservation_refund_provider_observations
    where refund_id=refund.id and phase='post' and observed_at>=refund.sent_at
    order by observed_at desc limit 1;
  if not found or rejection.http_status is distinct from 400 or rejection.error_code is distinct from '40007'
  then return false; end if;

  select * into observation from public.reservation_refund_provider_observations
    where refund_id=refund.id and phase='get' and observed_at>=rejection.observed_at
    order by observed_at desc limit 1;
  if not found then return false; end if;
  select coalesce(sum(confirmed_cents),0) into prior_refunded from public.reservation_refunds
    where payment_id=payment.id and state='confirmed';
  if observation.http_status is distinct from 200 or observation.charge_status is distinct from 'PAID'
     or observation.charge_id is distinct from refund.charge_id
     or observation.amount_value is distinct from payment.amount_cents
     or observation.summary_paid is distinct from payment.amount_cents
     or observation.summary_refunded is distinct from prior_refunded
  then return false; end if;

  update public.reservation_refunds set state='failed',provider_status='REFUND_DEADLINE_REACHED',
    provider_paid_cents=observation.summary_paid,provider_refunded_cents=observation.summary_refunded,checked_at=now()
    where id=refund.id;
  update public.reservation_cancellations set status='needs_review' where id=refund_case.id;
  insert into public.reservation_refund_attempts(refund_id,event,provider_status)
    values(refund.id,'provider_failed','REFUND_DEADLINE_REACHED');
  return true;
end $$;
revoke all on function public.reject_expired_pix_refund(uuid) from public, anon, authenticated;
grant execute on function public.reject_expired_pix_refund(uuid) to service_role;
