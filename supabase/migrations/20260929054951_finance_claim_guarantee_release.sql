-- Serialize release with incident creation (reservation lock) and decisions
-- (guarantee lock). Only the backend can dispatch a release to the provider.
create function public.claim_guarantee_release(p_guarantee uuid,p_actor uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare rid uuid; reservation_state text; g public.guarantees%rowtype;
begin
 select reservation_id into rid from public.guarantees where id=p_guarantee;
 if rid is null then return false; end if;
 select status into reservation_state from public.reservations where id=rid for update;
 select * into g from public.guarantees where id=p_guarantee for update;
 if p_actor is null then
  if reservation_state is distinct from 'cancelled' then return false; end if;
 elsif not exists(select 1 from public.profiles where id=p_actor and role='admin') then
  raise exception 'admin_required';
 end if;
 if g.status is distinct from 'guaranteed' or g.provider_authorization_id is null
    or coalesce(g.captured_amount_cents,0)<>0 then return false; end if;
 -- Include occurrences not yet assigned to a guarantee, too.
 if exists(select 1 from public.incidents where reservation_id=rid and status='open') then return false; end if;
 update public.guarantees set status='release_requested',updated_at=now() where id=g.id;
 return true;
end $$;
revoke all on function public.claim_guarantee_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_guarantee_release(uuid,uuid) to service_role;
