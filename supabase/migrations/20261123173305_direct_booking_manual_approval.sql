-- Direct requests are deliberately separate from inventory and payment tables.
create table public.direct_booking_invitations (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 property_id bigint not null references public.properties(id), existing_stay_id uuid unique references public.ops_stays(id),
 check_in date not null, check_out date not null check(check_out>check_in), guests int not null check(guests between 1 and 30),
 total_cents bigint not null check(total_cents>=0), cancellation_terms text not null check(length(cancellation_terms) between 10 and 5000),
 terms_snapshot jsonb not null, terms_hash text not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '14 days', revoked_at timestamptz
);
create table public.direct_booking_requests (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null unique references public.direct_booking_invitations(id),
 user_id uuid not null references auth.users(id), property_id bigint not null references public.properties(id),
 existing_stay_id uuid references public.ops_stays(id), stay_id uuid references public.ops_stays(id),
 check_in date not null, check_out date not null check(check_out>check_in), guests int not null check(guests between 1 and 30),
 full_name text not null check(length(full_name) between 3 and 160), phone text not null, email text not null,
 identity_snapshot jsonb not null, attachment_ids uuid[] not null, terms_snapshot jsonb not null, terms_hash text not null,
 total_cents bigint not null, cancellation_terms text not null,
 accepted_at timestamptz not null default now(), submitted_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id), review_note text,
 payment_method text check(payment_method in ('pix','payment_link','previously_confirmed')), payment_reference text
);
create index direct_booking_requests_status on public.direct_booking_requests(status,submitted_at desc);
create index direct_booking_requests_owner on public.direct_booking_requests(user_id);
create table public.direct_booking_attachments (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null references public.direct_booking_invitations(id),
 user_id uuid not null references auth.users(id), storage_path text not null unique, content_type text not null,
 size_bytes int not null check(size_bytes between 1 and 5242880), sha256 text not null, created_at timestamptz not null default now()
);
create index direct_booking_attachments_owner on public.direct_booking_attachments(invitation_id,user_id);
create table public.direct_booking_audit (
 id bigint generated always as identity primary key, request_id uuid references public.direct_booking_requests(id),
 actor_id uuid not null references auth.users(id), action text not null, created_at timestamptz not null default now()
);
alter table public.direct_booking_invitations enable row level security;
alter table public.direct_booking_requests enable row level security;
alter table public.direct_booking_attachments enable row level security;
alter table public.direct_booking_audit enable row level security;
revoke all on public.direct_booking_invitations,public.direct_booking_requests,public.direct_booking_attachments,public.direct_booking_audit from public,anon,authenticated;
grant all on public.direct_booking_invitations,public.direct_booking_requests,public.direct_booking_attachments,public.direct_booking_audit to service_role;
grant usage,select on sequence public.direct_booking_audit_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('direct-booking-documents','direct-booking-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

-- Invoker: only the authenticated Edge service may invoke this transaction.
-- Never grant it to the visitor; actor IDs are verified from access tokens by the Edge function.
create or replace function public.direct_booking_submit(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare i public.direct_booking_invitations; r public.direct_booking_requests; s public.ops_stays; ident jsonb;
begin
 select * into i from public.direct_booking_invitations where id=(p->>'invitation_id')::uuid for update;
 if i.id is null or i.revoked_at is not null then raise exception 'invitation_unavailable'; end if;
 select * into r from public.direct_booking_requests where invitation_id=i.id;
 if r.id is not null then
  if r.user_id<>p_actor then raise exception 'invitation_already_used';end if;
  return jsonb_build_object('id',r.id,'status',r.status);
 end if;
 if i.expires_at<now() then raise exception 'invitation_expired';end if;
 if p->'verified_account' is distinct from 'true'::jsonb then raise exception 'verified_account_required';end if;
 select to_jsonb(g) into ident from public.guest_payment_identity(p_actor) g;
 if ident is null then raise exception 'identity_required';end if;
 if p->>'terms_hash' is distinct from i.terms_hash or p->'accepted' is distinct from 'true'::jsonb then raise exception 'terms_acceptance_required';end if;
 if not exists(select 1 from public.direct_booking_attachments where invitation_id=i.id and user_id=p_actor) then raise exception 'document_required';end if;
 if (p->>'check_in')::date<>i.check_in or (p->>'check_out')::date<>i.check_out or (p->>'guests')::int<>i.guests then raise exception 'invitation_dates_changed';end if;
 if i.existing_stay_id is not null then
  select * into s from public.ops_stays where id=i.existing_stay_id;
  if s.id is null or s.status<>'confirmed' or s.channel<>'direct' or s.is_test or s.reservation_id is not null or
    (s.property_id,s.check_in,s.check_out) is distinct from (i.property_id,i.check_in,i.check_out) then raise exception 'existing_stay_changed';end if;
 elsif i.check_in < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'invalid_dates';end if;
 if length(trim(coalesce(p->>'full_name','')))<3 or length(trim(coalesce(p->>'full_name','')))>160 or
   coalesce(p->>'phone','') !~ '^\+?[0-9]{10,15}$' then raise exception 'invalid_guest';end if;
 insert into public.direct_booking_requests(invitation_id,user_id,property_id,existing_stay_id,check_in,check_out,guests,full_name,phone,email,identity_snapshot,attachment_ids,terms_snapshot,terms_hash,total_cents,cancellation_terms)
 values(i.id,p_actor,i.property_id,i.existing_stay_id,i.check_in,i.check_out,i.guests,trim(p->>'full_name'),p->>'phone',p->>'verified_email',ident,
  (select array_agg(id order by created_at,id) from public.direct_booking_attachments where invitation_id=i.id and user_id=p_actor),i.terms_snapshot,i.terms_hash,i.total_cents,i.cancellation_terms) returning * into r;
 insert into public.direct_booking_audit(request_id,actor_id,action)values(r.id,p_actor,'submitted_and_accepted');
 return jsonb_build_object('id',r.id,'status',r.status);
end $$;

create or replace function public.direct_booking_review(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.direct_booking_requests; s public.ops_stays; pid bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and coalesce(pms_access_status,'active')='active') then raise exception 'admin_required';end if;
 -- Stable lock order serializes inventory writers during the final check + insert.
 lock table public.reservations,public.ops_stays,public.pms_calendar_blocks in share row exclusive mode;
 select * into r from public.direct_booking_requests where id=(p->>'request_id')::uuid for update;
 if r.id is null then raise exception 'request_not_found';end if;
 if r.status<>'pending' then return jsonb_build_object('id',r.id,'status',r.status,'stay_id',r.stay_id);end if;
 if p->>'decision'='reject' then
  if length(trim(coalesce(p->>'note','')))<3 then raise exception 'review_note_required';end if;
  update public.direct_booking_requests set status='rejected',reviewed_at=now(),reviewed_by=p_actor,review_note=left(p->>'note',2000) where id=r.id;
  insert into public.direct_booking_audit(request_id,actor_id,action)values(r.id,p_actor,'rejected');
  return jsonb_build_object('id',r.id,'status','rejected');
 end if;
 if p->>'decision' is distinct from 'approve' or p->'payment_confirmed' is distinct from 'true'::jsonb or
  coalesce(p->>'payment_method','') not in ('pix','payment_link','previously_confirmed') or length(trim(coalesce(p->>'payment_reference','')))<3 then raise exception 'manual_payment_confirmation_required';end if;
 if r.existing_stay_id is not null then
  select * into s from public.ops_stays where id=r.existing_stay_id;
  if s.id is null or s.status<>'confirmed' or s.channel<>'direct' or s.is_test or s.reservation_id is not null or
   (s.property_id,s.check_in,s.check_out) is distinct from (r.property_id,r.check_in,r.check_out) then raise exception 'existing_stay_changed';end if;
 else
  if r.check_in < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'invalid_dates';end if;
  if (p->>'external_checked_at') is null or (p->>'external_checked_at')::timestamptz<now()-interval '2 minutes' then raise exception 'calendar_check_required';end if;
  if p->>'payment_method'='previously_confirmed' then raise exception 'invalid_payment_method';end if;
  if exists(select 1 from public.ops_stays where property_id=r.property_id and status='confirmed' and not is_test and check_in<r.check_out and check_out>r.check_in) or
   exists(select 1 from public.reservations where property_id=r.property_id and status in ('confirmed','hold','pending_payment') and (status='confirmed' or hold_expires_at is null or hold_expires_at>now()) and check_in<r.check_out and check_out>r.check_in) or
   exists(select 1 from public.pms_calendar_blocks where property_id=r.property_id and status='active' and start_date<r.check_out and end_date>r.check_in) or
   exists(select 1 from public.ops_calendar_events e join public.property_calendar_sources c on c.id=e.source_id where e.property_id=r.property_id and not e.cancelled and c.enabled and c.deleted_at is null and e.start_date<r.check_out and e.end_date>r.check_in and e.uid not like '%@chalezinho-site')
   then raise exception 'dates_unavailable';end if;
  insert into public.ops_stays(property_id,channel,origin,status,check_in,check_out,guest_name,guest_phone,guests,payment_origin,created_by,updated_by,notes)
   values(r.property_id,'direct','manual','confirmed',r.check_in,r.check_out,r.full_name,r.phone,r.guests,'not_recorded',p_actor,p_actor,'Reserva direta aprovada no cadastro '||r.id::text) returning * into s;
 end if;
 update public.direct_booking_requests set status='approved',stay_id=s.id,reviewed_at=now(),reviewed_by=p_actor,review_note=left(p->>'note',2000),payment_method=p->>'payment_method',payment_reference=left(p->>'payment_reference',240) where id=r.id;
 insert into public.direct_booking_audit(request_id,actor_id,action)values(r.id,p_actor,'approved_after_manual_payment_check');
 return jsonb_build_object('id',r.id,'status','approved','stay_id',s.id);
end $$;
revoke all on function public.direct_booking_submit(uuid,jsonb),public.direct_booking_review(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.direct_booking_submit(uuid,jsonb),public.direct_booking_review(uuid,jsonb) to service_role;

create or replace function public.direct_booking_invitation_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.direct_booking_requests where invitation_id=old.id) then raise exception 'request_already_submitted';end if;
 return new;
end $$;
revoke all on function public.direct_booking_invitation_guard() from public,anon,authenticated;
create trigger direct_booking_invitation_guard before update on public.direct_booking_invitations for each row execute function public.direct_booking_invitation_guard();
create or replace function public.direct_booking_evidence_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','stay_id','reviewed_at','reviewed_by','review_note','payment_method','payment_reference']) is distinct from
    (to_jsonb(old)-array['status','stay_id','reviewed_at','reviewed_by','review_note','payment_method','payment_reference']) then raise exception 'acceptance_is_immutable';end if;
 if old.status<>'pending' then raise exception 'review_is_final';end if;
 return new;
end $$;
revoke all on function public.direct_booking_evidence_guard() from public,anon,authenticated;
create trigger direct_booking_evidence_guard before update on public.direct_booking_requests for each row execute function public.direct_booking_evidence_guard();
