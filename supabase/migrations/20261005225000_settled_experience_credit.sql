-- Settled unrelated additions are not pending charges. Keep refund and
-- ambiguous attribution safeguards; never rewrite prior financial entries.
create or replace function public.prepare_experience_credit(p_reservation uuid,p_item uuid,p_actor uuid,p_reason text,p_key uuid,p_not_provided boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype; i public.experience_order_items%rowtype;
 e public.experience_credits%rowtype; a public.reservation_policy_acceptances%rowtype;
 v_amount bigint; v_case uuid; v_allocations jsonb; x record;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 if p_key is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 or p_not_provided is distinct from true then
  raise exception 'service_review_required'; end if;
 select * into r from public.reservations where id=p_reservation for update;
 if not found then raise exception 'reservation_not_changeable'; end if;
 select * into e from public.experience_credits where operation_key=p_key;
 if found then
  if e.reservation_id is distinct from p_reservation or e.experience_order_item_id is distinct from p_item or e.actor_user_id is distinct from p_actor or e.reason is distinct from p_reason then
   raise exception 'idempotency_conflict'; end if;
  return e.cancellation_id;
 end if;
 if r.status<>'confirmed' or r.checked_in_at is not null or
    now()>=(r.check_in::text||' 15:00:00 America/Sao_Paulo')::timestamptz then raise exception 'reservation_not_changeable'; end if;
 select it.* into i from public.experience_order_items it join public.experience_orders o on o.id=it.order_id
 where it.id=p_item and o.reservation_id=r.id and o.status='active' for update of it;
 if not found or i.status<>'active' then raise exception 'experience_not_active'; end if;
 if exists(select 1 from public.experience_credits where experience_order_item_id=i.id) then raise exception 'experience_credit_already_exists'; end if;
 -- Never infer fulfilment, legacy item attribution or an upgrade's original payment.
 -- Ambiguous upgraded items need an explicit allocation review, not a guessed refund.
 if exists(select 1 from public.financial_entries where experience_order_item_id=i.id and entry_type='upgrade') then
  raise exception 'experience_credit_review_required'; end if;
 if exists(select 1 from public.post_booking_charges where reservation_id=r.id and status in ('awaiting_payment','processing')) or
    exists(select 1 from public.reservation_cancellations where reservation_id=r.id and status<>'confirmed') then
  raise exception 'previous_refund_pending'; end if;
 select * into a from public.reservation_policy_acceptances where reservation_id=r.id and document_code=r.rate_plan_code||'_v1'
 order by accepted_at limit 1;
 if a.id is null or not exists(select 1 from public.cancellation_policy_rules where document_id=a.document_id and rate_plan_code=r.rate_plan_code) then
  raise exception 'accepted_policy_rule_missing'; end if;
 -- Credit only the original item principal. Buyer interest requires separate review.
 select sum(f.amount_cents) into v_amount from public.financial_entries f
 where f.reservation_id=r.id and f.experience_order_item_id=i.id and f.entry_type='experience';
 if v_amount is null or v_amount<=0 or v_amount<>i.unit_price_cents*i.quantity or
    exists(select 1 from public.financial_entries where experience_order_item_id=i.id and
      (reservation_id<>r.id or payment_id is null or entry_type<>'experience' or amount_cents<=0)) then
  raise exception 'experience_credit_review_required'; end if;
 -- Acquire payments in a stable order and reserve every allocation in this transaction.
 for x in select p.id from public.payments p where p.id in
  (select payment_id from public.financial_entries where experience_order_item_id=i.id) order by p.id for update
 loop
  if exists(select 1 from public.reservation_refunds where payment_id=x.id and state<>'failed') then
   raise exception 'experience_credit_review_required'; end if;
 end loop;
 select jsonb_agg(jsonb_build_object('payment_id',q.payment_id,'charge_id',q.charge_id,'captured_cents',q.captured_cents,
  'refund_cents',q.amount,'calculation',jsonb_build_object('reason','unprovided_experience')) order by q.payment_id)
 into v_allocations from (
  select f.payment_id,p.provider_payment_id charge_id,p.amount_cents captured_cents,sum(f.amount_cents) amount
  from public.financial_entries f join public.payments p on p.id=f.payment_id and p.reservation_id=r.id
  where f.experience_order_item_id=i.id and f.entry_type='experience' and p.status='paid' and p.provider='pagbank_sandbox'
  group by f.payment_id,p.provider_payment_id,p.amount_cents
 ) q;
 if v_allocations is null or (select sum((j->>'refund_cents')::bigint) from jsonb_array_elements(v_allocations) j)<>v_amount then
  raise exception 'experience_credit_review_required'; end if;
 insert into public.reservation_cancellations(reservation_id,actor_user_id,accepted_document_id,accepted_version,accepted_at,
  reason,kind,operation_key,refund_due_cents,calculation)
 values(r.id,p_actor,a.document_id,a.document_version,a.accepted_at,p_reason,'voluntary_refund',p_key,v_amount,
  jsonb_build_object('allocations',v_allocations,'reason','unprovided_experience','experience_order_item_id',i.id)) returning id into v_case;
 insert into public.experience_credits(reservation_id,experience_order_item_id,cancellation_id,actor_user_id,amount_cents,reason,service_not_provided,operation_key)
 values(r.id,i.id,v_case,p_actor,v_amount,p_reason,true,p_key);
 for x in select value j from jsonb_array_elements(v_allocations) loop
  perform public.reserve_reservation_refund(v_case,(x.j->>'payment_id')::uuid,x.j->>'charge_id',(x.j->>'refund_cents')::bigint);
 end loop;
 return v_case;
end $$;
