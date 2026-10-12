-- DEV ONLY. Executes against the real functions and rolls every fixture back.
-- Never insert fake Storage metadata to claim a real upload passed.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
do $$
declare a uuid;worker uuid;outsider uuid;src public.property_calendar_sources;s jsonb;t uuid;e uuid;
 token uuid;n bigint;money_before bigint;reservations_before bigint;result jsonb;
begin
 select id into a from public.profiles where full_name='QA OPS 20261012 admin' and role='admin';
 select id into worker from public.profiles where full_name='QA OPS 20261012 staff';
 select id into outsider from public.profiles where full_name='QA OPS 20261012 unauthorized';
 if a is null or worker is null or outsider is null then raise exception 'DEV QA identities missing';end if;
 select count(*) into reservations_before from public.reservations;
 select count(*) into money_before from public.payments;
 s=public.ops_mutate(a,'save_stay','{"property_id":3,"channel":"booking","external_id":"QA-TX-OPS-2099","check_in":"2099-07-01","check_out":"2099-07-03","guest_name":"QA TRANSACTION ROLLBACK"}');
 if s->>'payment_origin'<>'external_channel' or s->>'checked_in_at' is not null then raise exception 'invented_payment_or_attendance';end if;
 select count(*) into n from public.ops_tasks where stay_id=(s->>'id')::uuid;
 if n<>2 then raise exception 'expected_two_tasks';end if;
 select id into t from public.ops_tasks where stay_id=(s->>'id')::uuid and stage='preparation';
 perform public.ops_mutate(a,'assign',jsonb_build_object('task_id',t,'assigned_to',worker));
 perform public.ops_mutate(worker,'status',jsonb_build_object('task_id',t,'status','in_progress'));
 begin
  perform public.ops_mutate(outsider,'result',jsonb_build_object('task_id',t,'item_index',0,'result','ok'));
  raise exception 'unauthorized_was_accepted';
 exception when others then if sqlerrm not like '%task_not_found%' then raise;end if;end;
 begin
  perform public.ops_mutate(worker,'status',jsonb_build_object('task_id',t,'status','inspection'));
  raise exception 'missing_photos_were_accepted';
 exception when others then if sqlerrm not like '%checklist_and_photos_required%' then raise;end if;end;
 perform public.ops_mutate(worker,'result',jsonb_build_object('task_id',t,'item_index',0,'result','issue','observation','QA sem cobrança'));
 select * into src from public.property_calendar_sources where property_id=3 and provider='booking' and enabled and deleted_at is null limit 1;
 token=public.ops_claim_sync(src.id);
 if token is null then raise exception 'calendar_busy_try_later';end if;
 if public.ops_claim_sync(src.id) is not null then raise exception 'second_claim_accepted';end if;
 perform public.ops_apply_sync(src.id,token,src.updated_at,'[{"uid":"QA-TX-IMPORTED-2099","start":"2099-07-01","end":"2099-07-03","kind":"stay","summary":"Reserved","sequence":0,"cancelled":false},{"uid":"QA-TX-BLOCK-2099","start":"2099-08-01","end":"2099-08-03","kind":"block","summary":"Closed - Not Available","sequence":0,"cancelled":false},{"uid":"QA-TX-AMBIGUOUS-2099","start":"2099-09-01","end":"2099-09-03","kind":"ambiguous","summary":"Unknown","sequence":0,"cancelled":false}]',null,1);
 select id into e from public.ops_calendar_events where source_id=src.id and uid='QA-TX-IMPORTED-2099';
 perform public.ops_mutate(a,'classify',jsonb_build_object('event_id',e,'kind','stay','stay_id',s->>'id'));
 select count(*) into n from public.ops_stays where property_id=3 and check_in='2099-07-01';
 if n<>1 then raise exception 'duplicate_stay';end if;
 if exists(select 1 from public.ops_stays where external_id in ('QA-TX-BLOCK-2099','QA-TX-AMBIGUOUS-2099')) then raise exception 'block_or_ambiguity_became_stay';end if;
 token=public.ops_claim_sync(src.id);perform public.ops_apply_sync(src.id,token,src.updated_at,'[]','calendar_unreachable',1);
 if (select status from public.ops_stays where id=(s->>'id')::uuid)<>'confirmed' then raise exception 'failure_cancelled_stay';end if;
 token=public.ops_claim_sync(src.id);perform public.ops_apply_sync(src.id,token,src.updated_at,'[]',null,1);
 if (select status from public.ops_stays where id=(s->>'id')::uuid)<>'confirmed' then raise exception 'absence_cancelled_stay';end if;
 token=public.ops_claim_sync(src.id);perform public.ops_apply_sync(src.id,token,src.updated_at,'[{"uid":"QA-TX-IMPORTED-2099","start":"2099-07-02","end":"2099-07-04","kind":"stay","summary":"Reserved","sequence":1,"cancelled":false}]',null,1);
 if (select version from public.ops_stays where id=(s->>'id')::uuid)<>2 then raise exception 'date_version_not_updated';end if;
 if not exists(select 1 from public.ops_task_results where task_id=t) then raise exception 'history_lost';end if;
 token=public.ops_claim_sync(src.id);perform public.ops_apply_sync(src.id,token,src.updated_at,'[{"uid":"QA-TX-IMPORTED-2099","start":"2099-07-02","end":"2099-07-04","kind":"stay","summary":"Reserved","sequence":2,"cancelled":true}]',null,1);
 if (select status from public.ops_stays where id=(s->>'id')::uuid)<>'cancelled' then raise exception 'cancellation_not_recorded';end if;
 if exists(select 1 from public.ops_tasks where stay_id=(s->>'id')::uuid and status not in ('cancelled','superseded')) then raise exception 'future_tasks_not_cancelled';end if;
 if (select count(*) from public.reservations)<>reservations_before or (select count(*) from public.payments)<>money_before then raise exception 'native_finance_modified';end if;
end $$;
select 'PASS: real DEV RPC lifecycle, classification, idempotency, date changes, cancellation, history, permissions, no finance writes; fixtures rolled back' as result;
rollback;
