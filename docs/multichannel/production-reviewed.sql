-- REVIEW ONLY: not executed in production by this task.
-- Run with psql only after explicit production approval and confirmed PROD connection.
-- Never run the repository's entire migration history against PROD.
\set ON_ERROR_STOP on
begin;
do $$ begin
 -- First installation currently has zero native reservations in PROD. Stop if that changes:
 -- the original migration backfill must be extracted/deferred until final eligibility is installed.
 if exists(select 1 from public.reservations where status='confirmed') then raise exception 'Native backfill must be reviewed and deferred before installation';end if;
 if to_regclass('public.ops_stays') is not null then raise exception 'Already installed: compare applied migration NAMES and stop';end if;
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Cron prerequisites missing';end if;
end $$;
select vault.create_secret('https://irxsaladqhbzhkoaclxy.supabase.co','ops_project_url')
where not exists(select 1 from vault.secrets where name='ops_project_url');
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='ops_project_url' and decrypted_secret='https://irxsaladqhbzhkoaclxy.supabase.co') then raise exception 'Operational target mismatch';end if;
end $$;
\ir ../../supabase/migrations/20261012162927_multichannel_operations.sql
\ir ../../supabase/migrations/20261012163532_multichannel_schedule.sql
\ir ../../supabase/migrations/20261012192148_multichannel_reconciliation_hardening.sql
\ir ../../supabase/migrations/20261012193354_multichannel_dispatch_target.sql
\ir ../../supabase/migrations/20261012220612_multichannel_current_stays_only.sql
\ir ../../supabase/migrations/20261012221154_multichannel_fixture_isolation.sql
\ir ../../supabase/migrations/20261013010000_multichannel_task_time_eligibility.sql
\ir ../../supabase/migrations/20261013011000_multichannel_fixture_inventory.sql
\ir ../../supabase/migrations/20261013012000_multichannel_archival_persistence.sql
-- Leave inactive until the reviewed Edge service has been deployed and verified.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='multichannel-operational-sync';
commit;
-- Later, after function/auth/scope/inventory validation:
-- select cron.alter_job(jobid,active:=true) from cron.job where jobname='multichannel-operational-sync';
-- select ops_private.dispatch();
