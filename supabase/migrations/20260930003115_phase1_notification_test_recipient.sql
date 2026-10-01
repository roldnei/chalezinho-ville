-- Restrict development delivery to the explicitly authorized test recipient.
-- Other queued messages remain untouched; no recipient redirection is performed.
create or replace function public.claim_notification_outbox_for_delivery(p_limit integer default 20,p_recipient_email text default null)
returns setof public.notification_outbox language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with picked as (
  select o.id from public.notification_outbox o
  left join public.reservations r on r.id=o.reservation_id
  left join auth.users u on u.id=o.user_id
  where o.status='queued' and o.send_after<=now() and o.attempt_count<o.max_attempts
    and (p_recipient_email is null or lower(coalesce(nullif(r.guest_email,''),u.email,''))=lower(p_recipient_email))
  order by o.send_after,o.created_at for update of o skip locked
  limit greatest(1,least(coalesce(p_limit,20),100))
 ) update public.notification_outbox o set status='processing',attempt_count=o.attempt_count+1,last_attempt_at=now(),last_error=null
 from picked p where o.id=p.id returning o.*;
end $$;
revoke all on function public.claim_notification_outbox_for_delivery(integer,text) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox_for_delivery(integer,text) to service_role;
