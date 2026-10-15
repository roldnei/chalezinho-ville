-- Dedicated delivery credential and scheduler; no other notification queue is dispatched.
create table private.trip_review_delivery_settings(
 id boolean primary key default true check(id),
 project_url text check(project_url in ('https://pxfqmnhqodqyaaqeyjgr.supabase.co','https://irxsaladqhbzhkoaclxy.supabase.co')),
 dispatch_key text not null default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''))
);
alter table private.trip_review_delivery_settings enable row level security;
revoke all on private.trip_review_delivery_settings from public,anon,authenticated;
grant select on private.trip_review_delivery_settings to service_role;
insert into private.trip_review_delivery_settings(id) values(true);
insert into public.notification_templates(code,subject,body_text,active,provider_managed) values
 ('trip_review_requested','Trip aguardando sua aprovação · {{author_name}}','{{author_name}} enviou o Trip “{{trip_title}}”. Abra a prévia para aprovar ou devolver. Abrir o link não publica o Trip.',true,false),
 ('trip_review_enabled','Avisos de aprovação de Trips ativados','Você receberá um e-mail quando um hóspede enviar um Trip para aprovação. A publicação continuará dependendo da sua decisão.',true,false)
on conflict(code) do nothing;
create function public.notify_trip_review_email() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.source<>'guest_submission' or new.status<>'pending_review' then return new;end if;
 if TG_OP='UPDATE' and old.status='pending_review' and old.updated_at=new.updated_at then return new;end if;
 insert into public.notification_outbox(user_id,template_code,payload,dedupe_key)
 select u.id,'trip_review_requested',jsonb_build_object('publication_id',new.id,'revision',new.updated_at,'author_name',new.author_name,'trip_title',new.title),
 'trip-review:'||new.id::text||':'||new.updated_at::text||':'||u.id::text
 from auth.users u join public.profiles p on p.id=u.id
 where lower(u.email)='roldneicosta@gmail.com' and p.role='admin' and p.pms_access_status='active'
 on conflict(dedupe_key) do nothing;
 return new;
end $$;
revoke all on function public.notify_trip_review_email() from public,anon,authenticated;
grant execute on function public.notify_trip_review_email() to service_role;
create trigger trip_review_email after insert or update on public.villegram_publications for each row execute function public.notify_trip_review_email();
create function public.claim_trip_review_emails(p_dispatch_key text) returns setof public.notification_outbox
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from private.trip_review_delivery_settings where dispatch_key=p_dispatch_key) then raise exception 'unauthorized';end if;
 -- A pending email must still describe the same revision awaiting a decision.
 update public.notification_outbox o set status='cancelled',last_error='review_no_longer_pending'
 where o.template_code='trip_review_requested' and o.status='queued' and not exists(
  select 1 from public.villegram_publications p where p.id::text=o.payload->>'publication_id'
  and p.source='guest_submission' and p.status='pending_review' and p.updated_at=(o.payload->>'revision')::timestamptz);
 update public.notification_outbox set status='queued' where template_code in ('trip_review_requested','trip_review_enabled') and status='processing' and last_attempt_at<now()-interval '10 minutes' and attempt_count<max_attempts;
 return query with picked as (
  select o.id from public.notification_outbox o join auth.users u on u.id=o.user_id join public.profiles p on p.id=u.id
  where o.template_code in ('trip_review_requested','trip_review_enabled') and o.status='queued' and o.send_after<=now() and o.attempt_count<o.max_attempts
  and lower(u.email)='roldneicosta@gmail.com' and p.role='admin' and p.pms_access_status='active'
  order by o.created_at for update of o skip locked limit 10
 ) update public.notification_outbox o set status='processing',attempt_count=o.attempt_count+1,last_attempt_at=now(),last_error=null
 from picked p where o.id=p.id returning o.*;
end $$;
revoke all on function public.claim_trip_review_emails(text) from public,anon,authenticated;
grant execute on function public.claim_trip_review_emails(text) to service_role;
-- Scheduler needs its own protected credential; only privileged backend callers may invoke it.
create function public.dispatch_trip_review_emails() returns bigint language plpgsql security definer set search_path='' as $$
declare cfg private.trip_review_delivery_settings;request_id bigint;
begin
 select * into cfg from private.trip_review_delivery_settings where id;
 if cfg.project_url is null then return null;end if;
 select net.http_post(url:=cfg.project_url||'/functions/v1/trip-review-mailer',headers:=jsonb_build_object('Content-Type','application/json','x-trip-review-key',cfg.dispatch_key),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_trip_review_emails() from public,anon,authenticated;
grant execute on function public.dispatch_trip_review_emails() to service_role;
select cron.schedule('trip-review-emails','* * * * *','select public.dispatch_trip_review_emails();');
