-- Transactional review alerts: submitting documents/terms never approves a stay.
insert into public.notification_templates(code,subject,body_text,active,provider_managed) values
 ('direct_booking_review_requested','Cadastro aguardando sua checagem · {{guest_name}}','{{guest_name}} concluiu o cadastro e aceitou os termos para {{property_name}}, de {{check_in}} a {{check_out}}. Confira os dados e documentos no PMS antes de decidir. A aprovação continua manual.',true,false),
 ('direct_booking_review_enabled','Avisos de cadastro de hóspedes ativados','Você receberá um aviso quando um hóspede concluir o cadastro e aceitar os termos. A solicitação continuará aguardando sua checagem e aprovação no PMS.',true,false)
on conflict(code) do nothing;

create function public.enqueue_direct_booking_review_email(p_request_id uuid) returns void
language sql security invoker set search_path='' as $$
 insert into public.notification_outbox(user_id,template_code,payload,dedupe_key)
 select i.created_by,'direct_booking_review_requested',jsonb_build_object('request_id',r.id),
 'direct-booking-review:'||r.id::text||':'||i.created_by::text
 from public.direct_booking_requests r
 join public.direct_booking_invitations i on i.id=r.invitation_id
 join public.profiles p on p.id=i.created_by
 where r.id=p_request_id and r.status='pending' and p.role='admin' and p.pms_access_status='active'
 on conflict(dedupe_key) do nothing;
$$;
revoke all on function public.enqueue_direct_booking_review_email(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_direct_booking_review_email(uuid) to service_role;

create function public.notify_direct_booking_review_email() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform public.enqueue_direct_booking_review_email(new.id);
 return new;
end $$;
revoke all on function public.notify_direct_booking_review_email() from public,anon,authenticated;
grant execute on function public.notify_direct_booking_review_email() to service_role;
create trigger direct_booking_review_email after insert on public.direct_booking_requests
 for each row execute function public.notify_direct_booking_review_email();

create function public.claim_direct_booking_review_emails(p_dispatch_key text) returns setof public.notification_outbox
language plpgsql security invoker set search_path='' as $$
begin
 -- Reuse the established protected internal delivery configuration, not a public API key.
 if not exists(select 1 from private.trip_review_delivery_settings where id and dispatch_key=p_dispatch_key) then raise exception 'unauthorized';end if;
 update public.notification_outbox o set status='cancelled',last_error='review_no_longer_pending'
 where o.template_code='direct_booking_review_requested' and o.status in ('queued','processing') and not exists(
  select 1 from public.direct_booking_requests r join public.direct_booking_invitations i on i.id=r.invitation_id
  join public.profiles p on p.id=i.created_by where r.id::text=o.payload->>'request_id'
  and r.status='pending' and i.created_by=o.user_id and p.role='admin' and p.pms_access_status='active');
 update public.notification_outbox set status='queued'
 where template_code in ('direct_booking_review_requested','direct_booking_review_enabled')
 and status='processing' and last_attempt_at<now()-interval '10 minutes' and attempt_count<max_attempts;
 return query with picked as (
  select o.id from public.notification_outbox o join public.profiles p on p.id=o.user_id
  where o.template_code in ('direct_booking_review_requested','direct_booking_review_enabled')
  and o.status='queued' and o.send_after<=now() and o.attempt_count<o.max_attempts
  and p.role='admin' and p.pms_access_status='active'
  order by o.created_at for update of o skip locked limit 10
 ) update public.notification_outbox o set status='processing',attempt_count=o.attempt_count+1,last_attempt_at=now(),last_error=null
 from picked p where o.id=p.id returning o.*;
end $$;
revoke all on function public.claim_direct_booking_review_emails(text) from public,anon,authenticated;
grant execute on function public.claim_direct_booking_review_emails(text) to service_role;

-- Keep these messages out of generic mailers: they need their own authenticated PMS link.
do $migration$
declare definition text;signature text;needle text:='template_code not in (''trip_review_requested'',''trip_review_enabled'')';
begin
 foreach signature in array array['public.claim_notification_outbox(integer)','public.claim_notification_outbox_for_delivery(integer,text)'] loop
  if to_regprocedure(signature) is null then continue;end if;
  definition=pg_get_functiondef(to_regprocedure(signature));
  if position(needle in definition)=0 then raise exception 'notification_claim_definition_changed';end if;
  execute replace(definition,needle,'template_code not in (''trip_review_requested'',''trip_review_enabled'',''direct_booking_review_requested'',''direct_booking_review_enabled'')');
 end loop;
end $migration$;

create function public.dispatch_direct_booking_review_emails() returns bigint
language plpgsql security definer set search_path='' as $$
declare cfg private.trip_review_delivery_settings;request_id bigint;
begin
 select * into cfg from private.trip_review_delivery_settings where id;
 if cfg.project_url is null then return null;end if;
 select net.http_post(url:=cfg.project_url||'/functions/v1/direct-booking-mailer',headers:=jsonb_build_object('Content-Type','application/json','x-direct-booking-review-key',cfg.dispatch_key),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_direct_booking_review_emails() from public,anon,authenticated;
grant execute on function public.dispatch_direct_booking_review_emails() to service_role;
-- Backfill only genuine submissions still awaiting review, without changing them.
select public.enqueue_direct_booking_review_email(id) from public.direct_booking_requests where status='pending';
select cron.schedule('direct-booking-review-emails','* * * * *','select public.dispatch_direct_booking_review_emails();');
