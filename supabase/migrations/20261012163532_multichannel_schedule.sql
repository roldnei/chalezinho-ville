-- Apply only after deploying multichannel-operations to the reviewed environment.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'ops_dispatch_secret')
 where not exists(select 1 from vault.secrets where name='ops_dispatch_secret');
create function public.ops_verify_dispatch(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select length(p_secret)=64 and exists(select 1 from vault.decrypted_secrets where name='ops_dispatch_secret' and decrypted_secret=p_secret);
$$;
revoke all on function public.ops_verify_dispatch(text) from public,anon,authenticated;
grant execute on function public.ops_verify_dispatch(text) to service_role;
create function ops_private.dispatch() returns bigint language plpgsql security definer set search_path='' as $$
declare target text;secret text;request_id bigint;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='finance_project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='ops_dispatch_secret';
 if target not in ('https://pxfqmnhqodqyaaqeyjgr.supabase.co','https://irxsaladqhbzhkoaclxy.supabase.co') or secret is null then raise exception 'ops_dispatch_configuration_required';end if;
 select net.http_post(url:=target||'/functions/v1/multichannel-operations',headers:=jsonb_build_object('content-type','application/json','x-ops-secret',secret),body:='{"action":"scheduled_sync"}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function ops_private.dispatch() from public,anon,authenticated;
select cron.schedule('multichannel-operational-sync','*/10 * * * *','select ops_private.dispatch();');
