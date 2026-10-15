-- A guest Trip remains public for 168 hours from approval/publication.
-- Retain its record, media and moderation history after expiry.
create function public.villegram_guest_expiry() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source='guest_submission' then
  if new.status='published' then
   new.published_at=coalesce(new.published_at,now());
   new.expires_at=new.published_at+interval '168 hours';
  elsif new.status in ('draft','pending_review') then
   new.expires_at=null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.villegram_guest_expiry() from public,anon,authenticated;
grant execute on function public.villegram_guest_expiry() to service_role;
create trigger villegram_guest_expiry before insert or update on public.villegram_publications
for each row execute function public.villegram_guest_expiry();
-- Apply the same deadline to existing approved guest Trips, without restarting it.
update public.villegram_publications set expires_at=published_at+interval '168 hours'
where source='guest_submission' and status='published' and published_at is not null;
