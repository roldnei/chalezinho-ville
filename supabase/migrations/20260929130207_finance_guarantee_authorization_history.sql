-- One guarantee belongs to one reservation. Each bank authorization has its own
-- immutable identity; a renewal must never overwrite an unresolved operation.
alter table public.guarantee_card_tokens
 add column revision uuid not null default gen_random_uuid(),
 add column consent_version text not null default 'guarantee-v1',
 add column renewal_consent boolean not null default false;
alter table public.guarantees
 add column active_authorization_id uuid,
 add column attention_code text,
 add column next_action_at timestamptz not null default now(),
 add column card_update_key uuid,
 add column card_update_started_at timestamptz;
create table public.guarantee_authorizations (
 id uuid primary key default gen_random_uuid(),
 guarantee_id uuid not null references public.guarantees(id),
 reservation_id uuid not null references public.reservations(id),
 reference_id text not null unique,
 token_revision uuid,
 purpose text not null check(purpose in ('initial','renewal','legacy')),
 state text not null check(state in ('requested','uncertain','authorized','declined','release_pending','released','captured','expired')),
 amount_cents bigint not null check(amount_cents>0),
 provider_order_id text,
 provider_charge_id text unique,
 capture_before timestamptz,
 check_in date not null,
 check_out date not null,
 provider_error_code text,
 release_attempted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index guarantee_authorizations_reservation on public.guarantee_authorizations(reservation_id);
create index guarantee_authorizations_guarantee on public.guarantee_authorizations(guarantee_id,created_at);
create unique index guarantee_authorizations_one_pending on public.guarantee_authorizations(guarantee_id)
 where state in ('requested','uncertain');
alter table public.guarantee_authorizations enable row level security;
revoke all on public.guarantee_authorizations from public,anon,authenticated;
grant select,insert,update on public.guarantee_authorizations to service_role;
alter table public.guarantees add constraint guarantees_active_authorization_fk
 foreign key(active_authorization_id) references public.guarantee_authorizations(id);
create index guarantees_active_authorization on public.guarantees(active_authorization_id);
create index guarantees_next_action on public.guarantees(next_action_at) where status in ('pending','guaranteed');

-- Preserve every currently known provider identity, including settled captures.
insert into public.guarantee_authorizations(guarantee_id,reservation_id,reference_id,purpose,state,amount_cents,
 provider_order_id,provider_charge_id,capture_before,check_in,check_out,created_at)
 select g.id,g.reservation_id,replace(g.id::text,'-','')||'a'||greatest(g.authorization_attempt,1),
 'legacy',case when g.captured_amount_cents>0 then 'captured' when g.status='released' then 'released'
 when g.status in ('release_requested','release_uncertain') then 'release_pending'
 when g.status in ('authorizing','authorization_uncertain') then 'uncertain' else 'authorized' end,
 g.amount_cents,g.provider_order_id,g.provider_authorization_id,g.provider_capture_before,r.check_in,r.check_out,g.created_at
 from public.guarantees g join public.reservations r on r.id=g.reservation_id
 where g.provider='pagbank_sandbox' and g.provider_authorization_id is not null;
update public.guarantees g set active_authorization_id=a.id from public.guarantee_authorizations a where a.guarantee_id=g.id;

-- All operations lock reservation -> guarantee -> authorization. No caller may
-- use the browser's dates, card ownership or status as financial authority.
create function public.claim_guarantee_card_update(p_guarantee uuid,p_actor uuid,p_key uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare g public.guarantees%rowtype; r public.reservations%rowtype;
begin
 select r0.* into r from public.reservations r0 join public.guarantees g0 on g0.reservation_id=r0.id where g0.id=p_guarantee for update of r0;
 select * into g from public.guarantees where id=p_guarantee for update;
 if r.user_id is distinct from p_actor or r.status<>'confirmed' or r.check_out<current_date
 or g.status not in ('pending','guaranteed') or g.captured_amount_cents<>0 then raise exception 'card_update_unavailable'; end if;
 if exists(select 1 from public.guarantee_authorizations where guarantee_id=g.id and state in ('requested','uncertain','release_pending'))
 then raise exception 'authorization_in_progress'; end if;
 if g.card_update_started_at>now()-interval '60 seconds' then raise exception 'card_update_cooldown'; end if;
 update public.guarantees set card_update_key=p_key,card_update_started_at=now() where id=g.id;
 return true;
end $$;
create function public.save_guarantee_card(p_guarantee uuid,p_actor uuid,p_key uuid,p_token text,p_renewal boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare g public.guarantees%rowtype; r public.reservations%rowtype;
begin
 select r0.* into r from public.reservations r0 join public.guarantees g0 on g0.reservation_id=r0.id where g0.id=p_guarantee for update of r0;
 select * into g from public.guarantees where id=p_guarantee for update;
 if r.user_id is distinct from p_actor or r.status<>'confirmed' or g.card_update_key is distinct from p_key
 or g.card_update_started_at<now()-interval '2 minutes' or g.status not in ('pending','guaranteed')
 or exists(select 1 from public.guarantee_authorizations where guarantee_id=g.id and state in ('requested','uncertain','release_pending'))
 then raise exception 'card_update_unavailable'; end if;
 insert into public.guarantee_card_tokens(reservation_id,user_id,card_token,consented_at,consent_version,renewal_consent)
 values(r.id,p_actor,p_token,now(),'guarantee-v2',p_renewal)
 on conflict(reservation_id) do update set card_token=excluded.card_token,consented_at=now(),
 revision=gen_random_uuid(),consent_version='guarantee-v2',renewal_consent=p_renewal;
 update public.guarantees set attention_code=null,provider_error_code=null,next_action_at=now(),card_update_key=null,updated_at=now() where id=g.id;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value)
 values(p_actor,'guarantee_card_updated','guarantee',g.id::text,jsonb_build_object('consent_version','guarantee-v2','renewal_consent',p_renewal));
 return true;
end $$;

create function public.claim_guarantee_authorization(p_guarantee uuid) returns public.guarantee_authorizations
language plpgsql security invoker set search_path='' as $$
declare g public.guarantees%rowtype; r public.reservations%rowtype; t public.guarantee_card_tokens%rowtype;
 a public.guarantee_authorizations%rowtype; result public.guarantee_authorizations%rowtype;
 arrival timestamptz; departure timestamptz; is_renewal boolean; reason text;
begin
 select r0.* into r from public.reservations r0 join public.guarantees g0 on g0.reservation_id=r0.id where g0.id=p_guarantee for update of r0;
 select * into g from public.guarantees where id=p_guarantee for update;
 if g.id is null or r.status<>'confirmed' or g.provider<>'pagbank_sandbox' or g.status not in ('pending','guaranteed')
 or g.captured_amount_cents<>0 or g.next_action_at>now() then return null; end if;
 select ((r.check_in+coalesce(p.check_in_time,'15:00'::time)) at time zone coalesce(p.timezone,'America/Sao_Paulo')),
 ((r.check_out+coalesce(p.check_out_time,'11:00'::time)) at time zone coalesce(p.timezone,'America/Sao_Paulo'))
 into arrival,departure from public.properties p where p.id=r.property_id;
 if arrival is null or now()<arrival-interval '48 hours' or now()>=departure then return null; end if;
 if exists(select 1 from public.guarantee_authorizations where guarantee_id=g.id and state in ('requested','uncertain','release_pending'))
 or (g.card_update_key is not null and g.card_update_started_at>now()-interval '2 minutes') then return null; end if;
 select * into t from public.guarantee_card_tokens where reservation_id=r.id and user_id=r.user_id;
 select * into a from public.guarantee_authorizations where id=g.active_authorization_id;
 is_renewal:=a.id is not null and a.state not in ('declined');
 if g.status='guaranteed' and a.capture_before>=departure+interval '1 hour' then return null; end if;
 if g.status='guaranteed' and a.capture_before>now()+interval '48 hours' then return null; end if;
 if t.reservation_id is null then reason:='card_token_missing';
 elsif is_renewal and not t.renewal_consent then reason:='renewal_consent_required';
 elsif exists(select 1 from public.incidents where reservation_id=r.id and status='open') then reason:='incident_requires_review';
 elsif exists(select 1 from public.guarantee_authorizations where guarantee_id=g.id and token_revision=t.revision and state='declined') then reason:='authorization_declined';
 elsif (select count(*) from public.guarantee_authorizations where guarantee_id=g.id and created_at>now()-interval '24 hours')>=3 then reason:='authorization_attempts_exhausted';
 end if;
 if reason is not null then
  update public.guarantees set attention_code=reason,next_action_at=now()+interval '1 hour',updated_at=now() where id=g.id;
  return null;
 end if;
 insert into public.guarantee_authorizations(guarantee_id,reservation_id,reference_id,token_revision,purpose,state,amount_cents,check_in,check_out)
 values(g.id,r.id,'ga_'||replace(gen_random_uuid()::text,'-',''),t.revision,case when is_renewal then 'renewal' else 'initial' end,'requested',g.amount_cents,r.check_in,r.check_out) returning * into result;
 update public.guarantees set status=case when g.status='pending' then 'authorizing' else status end,
 authorization_attempt=authorization_attempt+1,attention_code='authorization_processing',next_action_at=now()+interval '5 minutes',updated_at=now() where id=g.id;
 return result;
end $$;

-- Called only after a fresh authenticated provider read. This RPC serializes
-- renewal with cancellation, incidents and money operations.
create function public.observe_guarantee_authorization(p_id uuid,p_charge text,p_order text,p_status text,
 p_amount bigint,p_paid bigint,p_expiry timestamptz,p_error text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare a public.guarantee_authorizations%rowtype; g public.guarantees%rowtype; r public.reservations%rowtype;
begin
 select * into a from public.guarantee_authorizations where id=p_id;
 if not found then raise exception 'authorization_missing'; end if;
 select * into r from public.reservations where id=a.reservation_id for update;
 select * into g from public.guarantees where id=a.guarantee_id for update;
 select * into a from public.guarantee_authorizations where id=p_id for update;
 if (a.provider_charge_id is not null and a.provider_charge_id<>p_charge) or p_amount<>a.amount_cents then raise exception 'authorization_mismatch'; end if;
 update public.guarantee_authorizations set provider_charge_id=p_charge,provider_order_id=coalesce(p_order,provider_order_id),
 capture_before=coalesce(p_expiry,capture_before),updated_at=now() where id=a.id;
 if p_status='AUTHORIZED' and a.state in ('requested','uncertain','authorized') then
  if p_expiry is null or p_expiry<=now() then
   update public.guarantee_authorizations set state='expired' where id=a.id;
   update public.guarantees set attention_code='authorization_expired',next_action_at=now(),updated_at=now() where id=g.id;
   return;
  end if;
  if a.id=g.active_authorization_id and g.status in ('incident_reported','capture_requested','capture_uncertain','release_requested','release_uncertain','captured') then return; end if;
  -- An incident raised during a renewal must be reviewed before switching or
  -- releasing any authorization. No capture ever uses the new hold implicitly.
  if r.status<>'confirmed' or g.status not in ('pending','authorizing','authorization_uncertain','guaranteed')
  or (g.active_authorization_id is distinct from a.id and exists(select 1 from public.incidents where reservation_id=r.id and status='open')) then
   update public.guarantee_authorizations set state='release_pending' where id=a.id;
   update public.guarantees set attention_code='authorization_cleanup_pending',updated_at=now() where id=g.id;
   return;
  end if;
  if g.active_authorization_id is distinct from a.id then
   update public.guarantee_authorizations set state='release_pending' where id=g.active_authorization_id and state in ('authorized','expired');
  end if;
  update public.guarantee_authorizations set state='authorized',provider_error_code=null where id=a.id;
  update public.guarantees set active_authorization_id=a.id,provider_order_id=coalesce(p_order,a.provider_order_id),
   provider_authorization_id=p_charge,provider_capture_before=p_expiry,provider_last_status='AUTHORIZED',
   provider_error_code=case when g.active_authorization_id=a.id then g.provider_error_code else null end,status='guaranteed',
   attention_code=case when g.active_authorization_id=a.id then g.attention_code else null end,released_amount_cents=0,release_confirmed=false,
   next_action_at=case when g.active_authorization_id=a.id then g.next_action_at else greatest(now(),p_expiry-interval '48 hours') end,updated_at=now() where id=g.id;
 elsif p_status='DECLINED' and a.state in ('requested','uncertain') then
  update public.guarantee_authorizations set state='declined',provider_error_code=coalesce(p_error,'authorization_declined') where id=a.id;
  update public.guarantees set status=case when status in ('authorizing','authorization_uncertain') then 'pending' else status end,
   attention_code='authorization_declined',provider_error_code='authorization_declined',next_action_at=now()+interval '1 hour',updated_at=now() where id=g.id;
 elsif p_status='CANCELED' and p_paid=0 and a.state<>'captured' then
  update public.guarantee_authorizations set state='released',provider_error_code=null where id=a.id;
  if a.id=g.active_authorization_id and g.status in ('release_requested','release_uncertain') then
   update public.guarantees set status=case when g.attention_code='reschedule_release_pending' then 'pending' else 'released' end,
    released_amount_cents=amount_cents,release_confirmed=true,
    provider_last_status='CANCELED',attention_code=null,updated_at=now() where id=g.id;
  elsif a.id=g.active_authorization_id and g.status in ('guaranteed','authorizing','authorization_uncertain') then
   update public.guarantees set status='pending',attention_code='authorization_expired',next_action_at=now(),updated_at=now() where id=g.id;
  end if;
 elsif p_status='PAID' and g.captured_amount_cents=0 then
  -- Captures are confirmed separately against the approved incident ledger.
  if a.id is distinct from g.active_authorization_id or g.status not in ('capture_requested','capture_uncertain') then
   update public.guarantees set attention_code='unexpected_provider_capture',updated_at=now() where id=g.id;
  end if;
 end if;
end $$;

create function public.claim_obsolete_authorization_release(p_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a public.guarantee_authorizations%rowtype; g public.guarantees%rowtype;
begin
 select * into a from public.guarantee_authorizations where id=p_id;
 perform 1 from public.reservations where id=a.reservation_id for update;
 select * into g from public.guarantees where id=a.guarantee_id for update;
 select * into a from public.guarantee_authorizations where id=p_id for update;
 if a.id is null or a.id=g.active_authorization_id or a.state<>'release_pending' or a.release_attempted_at is not null then return false; end if;
 update public.guarantee_authorizations set release_attempted_at=now(),updated_at=now() where id=a.id;
 return true;
end $$;

-- Date/property changes wake the lifecycle even if the former authorization
-- covered the former checkout. A captured guarantee is never reused.
create function public.reschedule_reservation_guarantee() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.check_in,new.check_out,new.property_id,new.status) is distinct from (old.check_in,old.check_out,old.property_id,old.status) then
  update public.guarantees set next_action_at=now(),status=case when status='released' and captured_amount_cents=0
    and new.status='confirmed' and (new.check_in,new.check_out,new.property_id) is distinct from (old.check_in,old.check_out,old.property_id) then 'pending' else status end,
   attention_code=case
   when captured_amount_cents>0 and (new.check_in,new.check_out,new.property_id) is distinct from (old.check_in,old.check_out,old.property_id) then 'captured_guarantee_dates_changed'
   when new.status='cancelled' then 'cancellation_release_pending' else 'reservation_changed' end,
   updated_at=now() where reservation_id=new.id;
 end if;
 return new;
end $$;
create trigger reschedule_reservation_guarantee after update of check_in,check_out,property_id,status on public.reservations
 for each row execute function public.reschedule_reservation_guarantee();

create or replace function public.claim_guarantee_release(p_guarantee uuid,p_actor uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare g public.guarantees%rowtype; r public.reservations%rowtype; rescheduled boolean;
begin
 select r0.* into r from public.reservations r0 join public.guarantees g0 on g0.reservation_id=r0.id where g0.id=p_guarantee for update of r0;
 select * into g from public.guarantees where id=p_guarantee for update;
 rescheduled:=g.attention_code='reservation_changed' and r.status='confirmed'
  and (r.check_in::timestamp at time zone 'America/Sao_Paulo')>now()+interval '48 hours';
 if p_actor is null then
  if r.status is distinct from 'cancelled' and not coalesce(rescheduled,false) then return false; end if;
 elsif not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 if g.status is distinct from 'guaranteed' or g.provider_authorization_id is null or g.captured_amount_cents<>0
 or exists(select 1 from public.incidents where reservation_id=r.id and status='open')
 or exists(select 1 from public.guarantee_authorizations where guarantee_id=g.id and state in ('requested','uncertain')) then return false; end if;
 update public.guarantees set status='release_requested',attention_code=case when rescheduled then 'reschedule_release_pending' else attention_code end,updated_at=now() where id=g.id;
 return true;
end $$;

create function public.check_in_with_guarantee(p_reservation uuid,p_actor uuid,p_exception_reason text default null)
returns public.reservations language plpgsql security invoker set search_path='' as $$
declare r public.reservations%rowtype; g public.guarantees%rowtype; required bigint; covered boolean;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 select * into r from public.reservations where id=p_reservation for update;
 if r.id is null or r.status<>'confirmed' or r.checked_in_at is not null or r.check_in>(now() at time zone 'America/Sao_Paulo')::date
 or r.check_out<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'check_in_not_allowed'; end if;
 select * into g from public.guarantees where reservation_id=r.id for update;
 select guarantee_amount_cents into required from public.properties where id=r.property_id;
 covered:=coalesce(required,0)=0 or (g.status='guaranteed' and g.provider_capture_before>now()+interval '1 hour'
  and (g.provider_capture_before>=(r.check_out::timestamp at time zone 'America/Sao_Paulo')+interval '12 hours'
   or exists(select 1 from public.guarantee_card_tokens where reservation_id=r.id and renewal_consent))
  and coalesce(g.attention_code,'') not in ('authorization_declined','authorization_result_uncertain','unexpected_provider_capture'));
 if not coalesce(covered,false) and length(trim(coalesce(p_exception_reason,'')))<10 then raise exception 'guarantee_check_in_exception_required'; end if;
 update public.reservations set operational_status='checked_in',checked_in_at=now(),updated_at=now() where id=r.id returning * into r;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value)
 values(p_actor,'reservation_check_in','reservation',r.id::text,jsonb_build_object('checked_in_at',r.checked_in_at,
  'guarantee_exception',not coalesce(covered,false),'reason',case when covered then null else left(trim(p_exception_reason),1000) end));
 return r;
end $$;

-- Authorization identity is append-only; status observations have a separate,
-- immutable audit stream containing no payment-card credentials.
create function public.guard_guarantee_authorization_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.id,new.guarantee_id,new.reservation_id,new.reference_id,new.token_revision,new.amount_cents)
 is distinct from (old.id,old.guarantee_id,old.reservation_id,old.reference_id,old.token_revision,old.amount_cents)
 or (old.provider_charge_id is not null and new.provider_charge_id is distinct from old.provider_charge_id)
 then raise exception 'authorization_identity_is_immutable'; end if;
 return new;
end $$;
create trigger authorization_identity before update on public.guarantee_authorizations
 for each row execute function public.guard_guarantee_authorization_identity();
create function public.audit_guarantee_authorization() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
 insert into public.finance_events(reservation_id,source,entity_id,event_type,payload)
 values(new.reservation_id,'guarantee_authorizations',new.id,case when tg_op='INSERT' then 'created' else 'changed' end,
  to_jsonb(new)-'token_revision');
 return new;
end $$;
create trigger finance_audit after insert or update on public.guarantee_authorizations
 for each row execute function public.audit_guarantee_authorization();

create or replace function public.claim_provider_reconciliation(p_charge_id text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 if not exists(select 1 from public.payments where provider='pagbank_sandbox' and provider_payment_id=p_charge_id)
 and not exists(select 1 from public.guarantees where provider='pagbank_sandbox' and provider_authorization_id=p_charge_id)
 and not exists(select 1 from public.guarantee_authorizations where provider_charge_id=p_charge_id)
 then return false; end if;
 insert into public.provider_reconciliation_gates(charge_id) values(p_charge_id)
 on conflict(charge_id) do update set started_at=clock_timestamp()
 where public.provider_reconciliation_gates.started_at<clock_timestamp()-interval '30 seconds'
 returning charge_id into claimed;
 return claimed is not null;
end $$;

revoke all on function public.claim_guarantee_card_update(uuid,uuid,uuid),public.save_guarantee_card(uuid,uuid,uuid,text,boolean),
 public.claim_guarantee_authorization(uuid),public.observe_guarantee_authorization(uuid,text,text,text,bigint,bigint,timestamptz,text),
 public.claim_obsolete_authorization_release(uuid),public.claim_guarantee_release(uuid,uuid),public.check_in_with_guarantee(uuid,uuid,text),public.claim_provider_reconciliation(text) from public,anon,authenticated;
grant execute on function public.claim_guarantee_card_update(uuid,uuid,uuid),public.save_guarantee_card(uuid,uuid,uuid,text,boolean),
 public.claim_guarantee_authorization(uuid),public.observe_guarantee_authorization(uuid,text,text,text,bigint,bigint,timestamptz,text),
 public.claim_obsolete_authorization_release(uuid),public.claim_guarantee_release(uuid,uuid),public.check_in_with_guarantee(uuid,uuid,text),public.claim_provider_reconciliation(text) to service_role;
