-- Complete registration without replacing the canonical CPF/passport or immutable historical snapshots.
-- Only the server role can read these columns; the private schema remains outside the Data API.
grant select(user_id,document_type,document_number,issuing_country) on private.guest_identities to service_role;
create or replace function public.direct_booking_identity_snapshot(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('document_type',g.document_type,'document_number',g.document_number,'issuing_country',g.issuing_country)
 from private.guest_identities g where g.user_id=p_user_id
$$;
revoke all on function public.direct_booking_identity_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.direct_booking_identity_snapshot(uuid) to service_role;

create or replace function public.direct_booking_submit(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare i public.direct_booking_invitations; r public.direct_booking_requests; s public.ops_stays; ident jsonb; photo_id jsonb;
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
 select public.direct_booking_identity_snapshot(p_actor) into ident;
 if ident is null then raise exception 'identity_required';end if;
 photo_id:=jsonb_build_object('type',p->'photo_document'->>'type','number',upper(regexp_replace(coalesce(p->'photo_document'->>'number',''),'[ .-]','','g')),'issuer',upper(trim(coalesce(p->'photo_document'->>'issuer',''))),'state',upper(trim(coalesce(p->'photo_document'->>'state',''))));
 if coalesce(photo_id->>'type','') not in ('rg','cnh','cin','passport') or
   coalesce(photo_id->>'number','') !~ '^[A-Z0-9]{4,24}$' or
   length(photo_id->>'issuer')>40 or (photo_id->>'state'<>'' and photo_id->>'state' !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$') then raise exception 'photo_document_details_required';end if;
 if photo_id->>'type'='rg' and (length(photo_id->>'issuer')<2 or photo_id->>'state'='') then raise exception 'photo_document_details_required';end if;
 if photo_id->>'type'='cin' and (ident->>'document_type'<>'cpf' or photo_id->>'number'<>ident->>'document_number') then raise exception 'cin_must_match_cpf';end if;
 if photo_id->>'type'='passport' and ident->>'document_type'='passport' and photo_id->>'number'<>ident->>'document_number' then raise exception 'passport_must_match_identity';end if;
 ident:=ident||jsonb_build_object('photo_document',photo_id);
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
 update public.profiles set full_name=r.full_name,phone=r.phone,updated_at=now() where id=p_actor;
 insert into public.direct_booking_audit(request_id,actor_id,action)values(r.id,p_actor,'submitted_and_accepted');
 return jsonb_build_object('id',r.id,'status',r.status);
end $$;

revoke all on function public.direct_booking_submit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.direct_booking_submit(uuid,jsonb) to service_role;
