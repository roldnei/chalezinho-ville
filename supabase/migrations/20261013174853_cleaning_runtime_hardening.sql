create index cleaning_properties_owner on public.cleaning_properties(owner_id);
create index cleaning_photos_job on public.cleaning_photos(job_id,item,status);
create index cleaning_photos_incident on public.cleaning_photos(incident_id) where incident_id is not null;
create index cleaning_incidents_job on public.cleaning_incidents(job_id,state);
create index cleaning_incident_messages_incident on public.cleaning_incident_messages(incident_id,created_at);
create index cleaning_payments_status on public.cleaning_payments(status,expires_at);
-- Maintenance runs when nobody is using the app. An external paid/uncertain
-- attempt is not expired locally: only a retrieved provider observation can do it.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('cleaning-marketplace-maintenance','*/5 * * * *','select public.cleaning_maintenance()');end if;end $$;
-- Signed provider reconciliation uses the existing protected dispatcher mechanism
-- and its vault-held URL/secret. No token is saved in source or cron text.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') and exists(select 1 from vault.secrets where name='ops_project_url') and exists(select 1 from vault.secrets where name='ops_dispatch_secret') then
 perform cron.schedule('cleaning-marketplace-reconciliation','*/5 * * * *',$q$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='ops_project_url')||'/functions/v1/cleaning-platform',headers := jsonb_build_object('content-type','application/json','x-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='ops_dispatch_secret')),body := '{"action":"scheduled_tick"}'::jsonb);$q$);
 end if;end $$;
