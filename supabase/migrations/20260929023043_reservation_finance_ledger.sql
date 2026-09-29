-- DEVELOPMENT ONLY. Apply to an isolated database after local verification.
-- Existing source rows are preserved; the baseline does not pretend to recover deleted history.
do $$ begin
 if exists(select 1 from public.guarantees where status in ('incident_reported','capture_requested','capture_uncertain')) then
  raise exception 'reconcile_legacy_capture_decisions_before_finance_migration';
 end if;
 if exists(select 1 from public.financial_entries where reservation_id is null)
   or exists(select 1 from public.payments where reservation_id is null) then
  raise exception 'resolve_orphan_financial_records_before_finance_migration';
 end if;
end $$;
create table public.finance_events (
 sequence bigint generated always as identity primary key,
 reservation_id uuid not null references public.reservations(id),
 source text not null, entity_id uuid not null,
 event_type text not null check(event_type in ('baseline','created','changed')),
 payload jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index finance_events_reservation_sequence on public.finance_events(reservation_id,sequence);
alter table public.finance_events enable row level security;
revoke all on public.finance_events from public,anon,authenticated;
grant select,insert on public.finance_events to service_role;
grant usage,select on sequence public.finance_events_sequence_seq to service_role;

create or replace function public.finance_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'financial_history_is_immutable';
end $$;
create trigger finance_events_immutable before update or delete on public.finance_events
for each row execute function public.finance_immutable();
create trigger financial_entries_immutable before update or delete on public.financial_entries
for each row execute function public.finance_immutable();

alter table public.guarantees add column refunded_amount_cents bigint not null default 0
 check(refunded_amount_cents>=0 and refunded_amount_cents<=captured_amount_cents);
alter table public.guarantees add column released_amount_cents bigint not null default 0
 check(released_amount_cents>=0 and released_amount_cents+captured_amount_cents<=amount_cents);
alter table public.guarantees add column release_confirmed boolean not null default false;

create table public.guarantee_refunds (
 id uuid primary key default gen_random_uuid(),
 reservation_id uuid not null references public.reservations(id),
 guarantee_id uuid not null references public.guarantees(id),
 actor_user_id uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 5 and 1000),
 requested_cents bigint not null check(requested_cents>0),
 confirmed_cents bigint not null default 0 check(confirmed_cents between 0 and requested_cents),
 prior_refunded_cents bigint not null check(prior_refunded_cents>=0),
 state text not null default 'prepared' check(state in('prepared','dispatching','uncertain','confirmed','failed')),
 operation_key uuid not null unique,
 provider_error_code text,
 created_at timestamptz not null default now(),confirmed_at timestamptz
);
alter table public.guarantee_refunds enable row level security;
revoke all on public.guarantee_refunds from public,anon,authenticated;
grant select,insert,update on public.guarantee_refunds to service_role;
create index guarantee_refunds_reservation on public.guarantee_refunds(reservation_id);
-- Serialize all refunds on the guarantee row; unresolved amounts remain reserved.
create function public.prepare_guarantee_refund(p_guarantee_id uuid,p_actor uuid,p_amount bigint,p_reason text,p_key uuid)
returns public.guarantee_refunds language plpgsql security definer set search_path='' as $$
declare g public.guarantees%rowtype; r public.guarantee_refunds%rowtype; reserved bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 select * into g from public.guarantees where id=p_guarantee_id for update;
 if not found or g.provider<>'pagbank_sandbox' or g.status<>'captured' then raise exception 'captured_guarantee_required'; end if;
 select * into r from public.guarantee_refunds where operation_key=p_key;
 if found then
  if r.guarantee_id<>g.id or r.requested_cents<>p_amount or r.reason<>p_reason or r.actor_user_id<>p_actor then raise exception 'idempotency_conflict'; end if;
  return r;
 end if;
 if exists(select 1 from public.guarantee_refunds where guarantee_id=g.id and state in('prepared','dispatching','uncertain')) then raise exception 'previous_refund_pending'; end if;
 select coalesce(sum(requested_cents),0) into reserved from public.guarantee_refunds where guarantee_id=g.id and state<>'failed';
 if p_amount is null or p_amount<=0 or p_amount+reserved>g.captured_amount_cents then raise exception 'refund_exceeds_captured'; end if;
 insert into public.guarantee_refunds(reservation_id,guarantee_id,actor_user_id,requested_cents,prior_refunded_cents,reason,operation_key)
 values(g.reservation_id,g.id,p_actor,p_amount,g.refunded_amount_cents,p_reason,p_key) returning * into r;
 return r;
end $$;
create function public.claim_guarantee_refund(p_refund_id uuid) returns setof public.guarantee_refunds
language sql security definer set search_path='' as $$
 update public.guarantee_refunds set state='dispatching' where id=p_refund_id and state='prepared' returning *;
$$;
create function public.confirm_guarantee_refund(p_refund_id uuid,p_charge_id text,p_paid bigint,p_refunded bigint)
returns text language plpgsql security definer set search_path='' as $$
declare g public.guarantees%rowtype; r public.guarantee_refunds%rowtype; gid uuid;
begin
 select guarantee_id into gid from public.guarantee_refunds where id=p_refund_id;
 select * into g from public.guarantees where id=gid for update;
 select * into r from public.guarantee_refunds where id=p_refund_id for update;
 if r.id is null or p_charge_id is distinct from g.provider_authorization_id or p_paid is distinct from g.captured_amount_cents
 or p_refunded is distinct from r.prior_refunded_cents+r.requested_cents or p_refunded>p_paid then raise exception 'refund_receipt_mismatch'; end if;
 if r.state='confirmed' then return 'confirmed'; end if;
 if r.state not in('dispatching','uncertain') then raise exception 'refund_not_dispatched'; end if;
 update public.guarantee_refunds set state='confirmed',confirmed_cents=requested_cents,confirmed_at=now(),provider_error_code=null where id=r.id;
 update public.guarantees set refunded_amount_cents=p_refunded,updated_at=now() where id=g.id;
 return 'confirmed';
end $$;
revoke all on function public.prepare_guarantee_refund(uuid,uuid,bigint,text,uuid),public.claim_guarantee_refund(uuid),public.confirm_guarantee_refund(uuid,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.prepare_guarantee_refund(uuid,uuid,bigint,text,uuid),public.claim_guarantee_refund(uuid),public.confirm_guarantee_refund(uuid,text,bigint,bigint) to service_role;

-- Occurrences are facts. They do not themselves create or approve charges.
alter table public.incidents add column reservation_id uuid references public.reservations(id);
update public.incidents i set reservation_id=g.reservation_id from public.guarantees g where i.guarantee_id=g.id;
alter table public.incidents alter column reservation_id set not null;
alter table public.incidents alter column guarantee_id drop not null;
alter table public.incidents add column category text not null default 'damage' check(category in('damage','broken_item','missing_item','extra_cleaning','penalty','other'));
alter table public.incidents add column actor_user_id uuid references auth.users(id);
alter table public.incidents add column decision text not null default 'pending' check(decision in('pending','no_charge','approved'));
alter table public.incidents add column decided_by uuid references auth.users(id);
alter table public.incidents add column decided_at timestamptz;
alter table public.incidents add column operation_key uuid unique;
alter table public.guarantees add column capture_incident_id uuid references public.incidents(id);

create function public.record_reservation_incident(p_reservation uuid,p_guarantee uuid,p_actor uuid,p_category text,p_description text,p_amount bigint,p_evidence jsonb,p_key uuid)
returns public.incidents language plpgsql security definer set search_path='' as $$
declare i public.incidents%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 perform 1 from public.reservations where id=p_reservation for update;
 if not found then raise exception 'reservation_not_found'; end if;
 if p_key is null or p_description is null or length(trim(p_description))<5 or p_amount is null or p_amount<0
 or jsonb_typeof(p_evidence)<>'array' then raise exception 'invalid_incident'; end if;
 if p_guarantee is not null and not exists(select 1 from public.guarantees where id=p_guarantee and reservation_id=p_reservation) then raise exception 'guarantee_mismatch'; end if;
 select * into i from public.incidents where operation_key=p_key;
 if found then
  if i.reservation_id<>p_reservation or i.description<>p_description or i.requested_capture_cents<>p_amount or i.category<>p_category
    or i.guarantee_id is distinct from p_guarantee or i.evidence<>p_evidence or i.actor_user_id<>p_actor then raise exception 'idempotency_conflict'; end if;
  return i;
 end if;
 insert into public.incidents(reservation_id,guarantee_id,actor_user_id,category,description,requested_capture_cents,evidence,operation_key)
 values(p_reservation,p_guarantee,p_actor,p_category,p_description,p_amount,p_evidence,p_key) returning * into i;
 return i;
end $$;
create function public.decide_reservation_incident(p_incident uuid,p_actor uuid,p_decision text)
returns text language plpgsql security definer set search_path='' as $$
declare i public.incidents%rowtype; g public.guarantees%rowtype; gid uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 select guarantee_id into gid from public.incidents where id=p_incident;
 select * into g from public.guarantees where id=gid for update;
 select * into i from public.incidents where id=p_incident for update;
 if i.id is null or p_decision not in('approved','no_charge') then raise exception 'invalid_incident_decision'; end if;
 if i.decision=p_decision then return p_decision; end if;
 if i.decision<>'pending' then raise exception 'incident_already_decided'; end if;
 if p_decision='approved' then
  if g.id is null or g.status<>'guaranteed' or g.provider_authorization_id is null or i.requested_capture_cents<=0
    or i.requested_capture_cents>g.amount_cents or jsonb_array_length(i.evidence)<2 then raise exception 'incident_not_chargeable'; end if;
  update public.guarantees set status='incident_reported',capture_incident_id=i.id,updated_at=now() where id=g.id;
 else
  update public.incidents set status='resolved',resolved_at=now() where id=i.id;
 end if;
 update public.incidents set decision=p_decision,decided_by=p_actor,decided_at=now() where id=i.id;
 return p_decision;
end $$;
revoke all on function public.record_reservation_incident(uuid,uuid,uuid,text,text,bigint,jsonb,uuid),public.decide_reservation_incident(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_reservation_incident(uuid,uuid,uuid,text,text,bigint,jsonb,uuid),public.decide_reservation_incident(uuid,uuid,text) to service_role;

-- Capture reconciliation resolves only the approved occurrence, never all open incidents.
create or replace function public.capture_guarantee_mock_atomic(p_guarantee_id uuid,p_actor_user_id uuid,p_amount_cents bigint)
returns table(result_status text,captured_amount_cents bigint,released_amount_cents bigint)
language plpgsql security definer set search_path='' as $$
declare g public.guarantees%rowtype; i public.incidents%rowtype;
begin
 select * into g from public.guarantees where id=p_guarantee_id for update;
 if not found then raise exception 'guarantee_not_found'; end if;
 if g.status='captured' then
  if g.captured_amount_cents is distinct from p_amount_cents then raise exception 'capture_amount_mismatch'; end if;
  return query select g.status,g.captured_amount_cents,g.released_amount_cents; return;
 end if;
 if g.status not in('capture_requested','capture_uncertain') or p_amount_cents is null or p_amount_cents<=0
 or p_amount_cents>g.amount_cents or p_amount_cents is distinct from g.requested_capture_cents then raise exception 'capture_not_requested'; end if;
 select * into i from public.incidents where id=g.capture_incident_id and decision='approved' and status='open' for update;
 if i.id is null or i.guarantee_id<>g.id or i.reservation_id<>g.reservation_id or i.requested_capture_cents<>p_amount_cents then raise exception 'incident_required'; end if;
 update public.guarantees set status='captured',captured_amount_cents=p_amount_cents,provider_last_status='PAID',updated_at=now() where id=g.id;
 insert into public.financial_entries(reservation_id,entry_type,amount_cents,description)
 values(g.reservation_id,'guarantee_capture',p_amount_cents,'Captura de ocorrência '||i.id);
 update public.incidents set status='resolved',resolved_at=now() where id=i.id;
 return query select 'captured'::text,p_amount_cents,0::bigint;
end $$;

-- One audit stream, minimal provider data. No full provider responses, card tokens, secrets or guest identity.
revoke all on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) to service_role;
create function public.finance_payload(source text, row_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key=any(array['id','reservation_id','guarantee_id','payment_id','cancellation_id','amount_cents','captured_amount_cents',
 'refunded_amount_cents','released_amount_cents','release_confirmed','provider_authorization_id','provider_payment_id',
 'provider_order_id','provider_last_status','provider_error_code','requested_cents','confirmed_cents','prior_refunded_cents',
 'requested_capture_cents','status','state','method','installments','provider','entry_type','currency','description','reason',
 'category','decision','evidence','actor_user_id','decided_by','decided_at','created_at','updated_at','confirmed_at','resolved_at','expires_at','approved_at',
 'kind','total_amount','stay_amount','experience_amount','rate_plan_code','check_in','check_out','refund_due_cents','operation_key']);
$$;
create function public.finance_audit_row() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; data jsonb; old_data jsonb;
begin
 data=public.finance_payload(tg_table_name,to_jsonb(new));
 rid=case when tg_table_name='reservations' then new.id else (data->>'reservation_id')::uuid end;
 if tg_table_name='reservation_refunds' then select reservation_id into rid from public.payments where id=new.payment_id; end if;
 if rid is null then raise exception 'reservation_required_for_finance'; end if;
 if tg_op='UPDATE' then
  old_data=public.finance_payload(tg_table_name,to_jsonb(old));
  if (old_data->>'reservation_id') is distinct from (data->>'reservation_id')
    or (tg_table_name='reservation_refunds' and (old_data->>'payment_id') is distinct from (data->>'payment_id'))
    then raise exception 'financial_reservation_link_is_immutable'; end if;
  if (data-'updated_at')=(old_data-'updated_at') then return new; end if;
 end if;
 insert into public.finance_events(reservation_id,source,entity_id,event_type,payload)
 values(rid,tg_table_name,new.id,case when tg_op='INSERT' then 'created' else 'changed' end,data);
 return new;
end $$;
-- Baseline and triggers are installed in one migration transaction.
do $$ declare t text; begin
 foreach t in array array['reservations','payments','guarantees','incidents','financial_entries','post_booking_charges','reservation_refunds','guarantee_refunds','reservation_cancellations','modification_requests'] loop
  if t='reservation_refunds' then
   execute 'insert into public.finance_events(reservation_id,source,entity_id,event_type,payload) select p.reservation_id,$1,r.id,''baseline'',public.finance_payload($1,to_jsonb(r)) from public.reservation_refunds r join public.payments p on p.id=r.payment_id where p.reservation_id is not null' using t;
  else
   execute format('insert into public.finance_events(reservation_id,source,entity_id,event_type,payload) select %I,$1,id,''baseline'',public.finance_payload($1,to_jsonb(r)) from public.%I r where %I is not null',case when t='reservations' then 'id' else 'reservation_id' end,t,case when t='reservations' then 'id' else 'reservation_id' end) using t;
  end if;
  execute format('create trigger finance_audit after insert or update on public.%I for each row execute function public.finance_audit_row()',t);
 end loop;
end $$;
revoke all on function public.finance_audit_row(),public.finance_immutable(),public.finance_payload(text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_payload(text,jsonb) to service_role;
