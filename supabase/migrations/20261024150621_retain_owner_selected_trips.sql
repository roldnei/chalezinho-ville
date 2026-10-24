begin;
-- Only the trusted service can write publication rows (RLS has no client policies).
alter table public.villegram_publications add column retain_until_removed boolean not null default false;
create or replace function public.villegram_guest_expiry() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source='guest_submission' then
  if new.status='published' then
   new.published_at=coalesce(new.published_at,now());
   new.expires_at=case when new.retain_until_removed then null else new.published_at+interval '168 hours' end;
  elsif new.status in ('draft','pending_review') then new.expires_at=null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.villegram_guest_expiry() from public,anon,authenticated;
grant execute on function public.villegram_guest_expiry() to service_role;
commit;
