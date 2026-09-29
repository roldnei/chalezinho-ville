-- The target is provisioned in Vault per isolated environment, never copied
-- from the public site's historical migrations.
create extension if not exists pg_net with schema extensions;
create function public.dispatch_finance_lifecycle() returns bigint
language plpgsql security definer set search_path='' as $$
declare target text; secret text; request_id bigint;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='finance_project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='guarantee_dispatch_secret';
 if target is null or target !~ '^https://[a-z]{20}\.supabase\.co$'
   or target='https://irxsaladqhbzhkoaclxy.supabase.co' or length(secret)<32 then
   raise exception 'isolated_finance_dispatch_not_configured';
 end if;
 select net.http_post(url:=target||'/functions/v1/guarantee-preview',
   headers:=jsonb_build_object('Content-Type','application/json','x-chalezinho-env','development','x-guarantee-dispatch-secret',secret),
   body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_finance_lifecycle() from public,anon,authenticated;
grant execute on function public.dispatch_finance_lifecycle() to service_role;
select cron.schedule('finance-lifecycle','*/5 * * * *','select public.dispatch_finance_lifecycle();');
