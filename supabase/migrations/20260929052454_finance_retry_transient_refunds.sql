-- Retry only an explicit temporary rejection, never an unknown HTTP outcome.
-- The caller supplies balances from a fresh authenticated provider GET.
alter table public.guarantee_refunds add column last_dispatch_at timestamptz;
create or replace function public.claim_guarantee_refund(p_refund_id uuid)
returns setof public.guarantee_refunds language sql security definer set search_path='' as $$
 update public.guarantee_refunds set state='dispatching',last_dispatch_at=now(),provider_error_code=null
 where id=p_refund_id and state='prepared' returning *;
$$;
create function public.retry_transient_refund(p_kind text,p_refund_id uuid,p_actor uuid,p_paid bigint,p_refunded bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare gr public.guarantee_refunds%rowtype; g public.guarantees%rowtype;
 rr public.reservation_refunds%rowtype; p public.payments%rowtype;
 observation public.reservation_refund_provider_observations%rowtype;
 prior bigint; parent_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 if p_kind='guarantee' then
  select guarantee_id into parent_id from public.guarantee_refunds where id=p_refund_id;
  select * into g from public.guarantees where id=parent_id for update;
  select * into gr from public.guarantee_refunds where id=p_refund_id for update;
  if gr.id is null or gr.state<>'uncertain' or gr.provider_error_code is distinct from '40008'
    or coalesce(gr.last_dispatch_at,gr.created_at)>now()-interval '60 seconds' then return false; end if;
  if p_paid is distinct from g.captured_amount_cents or p_refunded is distinct from gr.prior_refunded_cents
    or p_refunded is distinct from g.refunded_amount_cents then raise exception 'refund_provider_balance_mismatch'; end if;
  update public.guarantee_refunds set state='prepared',provider_error_code=null where id=gr.id;
 elsif p_kind='reservation' then
  select payment_id into parent_id from public.reservation_refunds where id=p_refund_id;
  select * into p from public.payments where id=parent_id for update;
  select * into rr from public.reservation_refunds where id=p_refund_id for update;
  select * into observation from public.reservation_refund_provider_observations
    where refund_id=rr.id and phase='post' order by observed_at desc limit 1;
  if rr.id is null or rr.state<>'uncertain' or rr.sent_at is null
    or observation.error_code is distinct from '40008' or observation.http_status is distinct from 400
    or observation.observed_at<rr.sent_at or observation.observed_at>now()-interval '60 seconds' then return false; end if;
  select coalesce(sum(confirmed_cents),0) into prior from public.reservation_refunds where payment_id=p.id and state='confirmed';
  if p_paid is distinct from p.amount_cents or p_refunded is distinct from prior then raise exception 'refund_provider_balance_mismatch'; end if;
  update public.reservation_refunds set state='prepared',sent_at=null where id=rr.id;
 else raise exception 'invalid_refund_kind'; end if;
 return true;
end $$;
revoke all on function public.retry_transient_refund(text,uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.retry_transient_refund(text,uuid,uuid,bigint,bigint) to service_role;
