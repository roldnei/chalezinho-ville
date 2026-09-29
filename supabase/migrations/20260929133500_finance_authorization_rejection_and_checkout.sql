-- A definite request rejection has no charge to reconcile. Do not treat a
-- timeout, malformed response, or failed persistence as a definite rejection.
create function public.reject_guarantee_authorization_request(p_id uuid,p_error text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a public.guarantee_authorizations%rowtype; g public.guarantees%rowtype;
begin
 if p_error not in ('pagbank_order_rejected','card_version_changed') then raise exception 'not_a_definite_rejection'; end if;
 select * into a from public.guarantee_authorizations where id=p_id;
 if not found then return false; end if;
 perform 1 from public.reservations where id=a.reservation_id for update;
 select * into g from public.guarantees where id=a.guarantee_id for update;
 select * into a from public.guarantee_authorizations where id=p_id for update;
 if a.state<>'requested' or a.provider_charge_id is not null or a.provider_order_id is not null then return false; end if;
 update public.guarantee_authorizations set state='declined',provider_error_code=p_error,updated_at=now() where id=a.id;
 update public.guarantees set status=case when status='authorizing' then 'pending' else status end,
 attention_code='authorization_declined',provider_error_code=p_error,next_action_at=now()+interval '1 hour',updated_at=now() where id=g.id;
 return true;
end $$;
revoke all on function public.reject_guarantee_authorization_request(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_guarantee_authorization_request(uuid,text) to service_role;

create or replace function public.check_in_with_guarantee(p_reservation uuid,p_actor uuid,p_exception_reason text default null)
returns public.reservations language plpgsql security invoker set search_path='' as $$
declare r public.reservations%rowtype; g public.guarantees%rowtype; required bigint; covered boolean; departure timestamptz; property_zone text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 select * into r from public.reservations where id=p_reservation for update;
 select coalesce(timezone,'America/Sao_Paulo'),guarantee_amount_cents,
 ((r.check_out+coalesce(check_out_time,'11:00'::time)) at time zone coalesce(timezone,'America/Sao_Paulo'))
 into property_zone,required,departure from public.properties where id=r.property_id;
 if r.id is null or property_zone is null or r.status<>'confirmed' or r.checked_in_at is not null or r.check_in>(now() at time zone property_zone)::date
 or r.check_out<(now() at time zone property_zone)::date then raise exception 'check_in_not_allowed'; end if;
 select * into g from public.guarantees where reservation_id=r.id for update;
 covered:=coalesce(required,0)=0 or (g.status='guaranteed' and g.provider_capture_before>now()+interval '1 hour'
  and (g.provider_capture_before>=departure+interval '1 hour'
   or exists(select 1 from public.guarantee_card_tokens where reservation_id=r.id and renewal_consent))
  and coalesce(g.attention_code,'') not in ('authorization_declined','authorization_result_uncertain','unexpected_provider_capture'));
 if not coalesce(covered,false) and length(trim(coalesce(p_exception_reason,'')))<10 then raise exception 'guarantee_check_in_exception_required'; end if;
 update public.reservations set operational_status='checked_in',checked_in_at=now(),updated_at=now() where id=r.id returning * into r;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value)
 values(p_actor,'reservation_check_in','reservation',r.id::text,jsonb_build_object('checked_in_at',r.checked_in_at,
  'guarantee_exception',not coalesce(covered,false),'reason',case when covered then null else left(trim(p_exception_reason),1000) end));
 return r;
end $$;

