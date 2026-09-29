-- Optional goodwill refunds must not depend on an unrelated cancellation policy.
alter table public.reservation_cancellations
  alter column accepted_document_id drop not null,
  alter column accepted_version drop not null,
  alter column accepted_at drop not null;
alter table public.reservation_cancellations add constraint policy_cancellation_requires_acceptance
  check(kind<>'policy_cancellation' or
    (accepted_document_id is not null and accepted_version is not null and accepted_at is not null));

-- Persist the case and ALL allocations in one transaction. A failed allocation
-- rolls back the case as well, allowing a clean retry with the same operation key.
create function public.prepare_reservation_refund_case(p_actor uuid,p_case jsonb)
returns public.reservation_cancellations language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype; c public.reservation_cancellations%rowtype;
  x jsonb; v_kind text:=p_case->>'kind'; v_key uuid:=(p_case->>'operation_key')::uuid;
  v_due bigint:=(p_case->>'refund_due_cents')::bigint; v_sum bigint:=0;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 select * into r from public.reservations where id=(p_case->>'reservation_id')::uuid for update;
 if not found then raise exception 'reservation_not_found'; end if;
 if v_kind is null or v_kind not in ('policy_cancellation','voluntary_refund') or v_due is null or v_due<0
   or nullif(trim(p_case->>'reason'),'') is null or jsonb_typeof(p_case->'calculation'->'allocations') is distinct from 'array'
   or (v_kind='voluntary_refund' and (v_key is null or v_due=0)) then raise exception 'invalid_refund_case'; end if;
 select * into c from public.reservation_cancellations where reservation_id=r.id and kind=v_kind
   and (v_kind='policy_cancellation' or operation_key=v_key);
 if found then
   if c.refund_due_cents<>v_due or c.reason is distinct from p_case->>'reason'
     then raise exception 'idempotency_conflict'; end if;
   return c;
 end if;
 if v_kind='policy_cancellation' and (r.status<>'confirmed' or r.checked_in_at is not null)
   then raise exception 'individual_review_required'; end if;
 if jsonb_array_length(p_case->'calculation'->'allocations')<>(select count(distinct j->>'payment_id')
   from jsonb_array_elements(p_case->'calculation'->'allocations') j) then raise exception 'duplicate_allocation'; end if;
 insert into public.reservation_cancellations(reservation_id,actor_user_id,accepted_document_id,accepted_version,accepted_at,
   reason,kind,requested_at,guest_request_id,operation_key,refund_due_cents,calculation)
 values(r.id,p_actor,(p_case->>'accepted_document_id')::uuid,p_case->>'accepted_version',(p_case->>'accepted_at')::timestamptz,
   p_case->>'reason',v_kind,(p_case->>'requested_at')::timestamptz,(p_case->>'guest_request_id')::uuid,v_key,v_due,p_case->'calculation')
 returning * into c;
 for x in select value from jsonb_array_elements(p_case->'calculation'->'allocations') order by value->>'payment_id' loop
   if x->>'refund_cents' is null or (x->>'refund_cents') !~ '^\d+$' then raise exception 'invalid_allocation'; end if;
   if (x->>'refund_cents')::bigint>0 then
     perform public.reserve_reservation_refund(c.id,(x->>'payment_id')::uuid,x->>'charge_id',(x->>'refund_cents')::bigint);
     v_sum:=v_sum+(x->>'refund_cents')::bigint;
   end if;
 end loop;
 if v_sum<>v_due then raise exception 'refund_allocation_mismatch'; end if;
 return c;
end $$;
revoke all on function public.prepare_reservation_refund_case(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_reservation_refund_case(uuid,jsonb) to service_role;
