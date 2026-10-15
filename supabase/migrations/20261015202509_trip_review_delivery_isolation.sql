-- These service-only functions need the authoritative Auth email, without granting
-- direct auth.users SELECT to the backend API role. Paths are explicitly empty.
alter function public.notify_trip_review_email() security definer;
alter function public.claim_trip_review_emails(text) security definer;
revoke all on function public.notify_trip_review_email(),public.claim_trip_review_emails(text) from public,anon,authenticated;
-- Dedicated review messages must not be consumed by the generic email worker.
do $migration$
declare definition text;signature text;needle text;
begin
 foreach signature in array array['public.claim_notification_outbox(integer)','public.claim_notification_outbox_for_delivery(integer,text)'] loop
  if to_regprocedure(signature) is null then continue;end if;
  definition=pg_get_functiondef(to_regprocedure(signature));
  needle=case when signature like '%for_delivery%' then 'where o.status=''queued''' else 'where status=''queued''' end;
  if position(needle in definition)=0 then raise exception 'notification_claim_definition_changed';end if;
  execute replace(definition,needle,needle||' and '||case when signature like '%for_delivery%' then 'o.' else '' end||'template_code not in (''trip_review_requested'',''trip_review_enabled'')');
 end loop;
end $migration$;
