-- Secrets are provisioned separately in Vault; never embed credentials in cron commands.
create or replace function public.dispatch_notification_outbox()
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare target text; dispatch_secret text; gateway_jwt text; request_id bigint;
begin
  select decrypted_secret into target from vault.decrypted_secrets where name='finance_project_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='notification_dispatch_secret';
  select decrypted_secret into gateway_jwt from vault.decrypted_secrets where name='notification_anon_jwt';
  if nullif(target,'') is null or nullif(dispatch_secret,'') is null or nullif(gateway_jwt,'') is null then return null; end if;
  if target !~ '^https://[a-z0-9]+[.]supabase[.]co/?$' then raise exception 'invalid_notification_project_url'; end if;
  select net.http_post(
    url := rtrim(target,'/') || '/functions/v1/notification-dispatcher',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||gateway_jwt,'x-notification-dispatch-secret',dispatch_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.dispatch_notification_outbox() from public, anon, authenticated;
grant execute on function public.dispatch_notification_outbox() to service_role;
select cron.schedule('notification-dispatcher','* * * * *','select public.dispatch_notification_outbox();');
