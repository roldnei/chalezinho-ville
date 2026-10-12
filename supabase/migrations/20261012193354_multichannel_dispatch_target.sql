-- Prefer a dedicated operational target; preserve existing DEV configuration.
-- Provision ops_project_url in Vault for the reviewed target before enabling cron.
create or replace function ops_private.dispatch() returns bigint language plpgsql security definer set search_path='' as $$
declare target text;secret text;request_id bigint;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='ops_project_url';
 if target is null then select decrypted_secret into target from vault.decrypted_secrets where name='finance_project_url';end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='ops_dispatch_secret';
 if target is null or target not in ('https://pxfqmnhqodqyaaqeyjgr.supabase.co','https://irxsaladqhbzhkoaclxy.supabase.co') or secret is null then raise exception 'ops_dispatch_configuration_required';end if;
 select net.http_post(url:=target||'/functions/v1/multichannel-operations',headers:=jsonb_build_object('content-type','application/json','x-ops-secret',secret),body:='{"action":"scheduled_sync"}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function ops_private.dispatch() from public,anon,authenticated;
