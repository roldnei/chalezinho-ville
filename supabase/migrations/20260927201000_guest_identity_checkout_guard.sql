-- Direct e-mail signup must supply a document. Invitations and OAuth users
-- complete their identity separately before starting a reservation payment.
create or replace function private.register_guest_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; number text; country text;
begin
 kind:=new.raw_user_meta_data->>'document_type';
 if kind is null then
  if new.invited_at is null and coalesce(new.raw_app_meta_data->>'provider','email')='email' then
   raise exception 'document_required' using errcode='22023';
  end if;
  return new;
 end if;
 number:=upper(regexp_replace(coalesce(new.raw_user_meta_data->>'document_number',''), '[ .-]', '', 'g'));
 country:=upper(coalesce(new.raw_user_meta_data->>'issuing_country',''));
 if kind not in ('cpf','passport') or country !~ '^[A-Z]{2}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='cpf' and (country<>'BR' or not private.valid_cpf(number)) then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='passport' and number !~ '^[A-Z0-9]{5,20}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 insert into private.guest_identities(user_id,document_type,issuing_country,document_number,email_at_signup)
 values(new.id,kind,country,number,lower(new.email));
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
   - 'document_type' - 'document_number' - 'issuing_country' where id=new.id;
 return new;
end $$;

create or replace function public.guest_identity_present(p_user_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from private.guest_identities where user_id=p_user_id)$$;
revoke all on function public.guest_identity_present(uuid) from public, anon, authenticated;
grant execute on function public.guest_identity_present(uuid) to service_role;

create or replace function public.register_guest_identity(
 p_user_id uuid, p_document_type text, p_issuing_country text, p_document_number text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized text; country text; guest_email text;
begin
 select lower(email) into guest_email from auth.users where id=p_user_id;
 if guest_email is null then raise exception 'user_not_found'; end if;
 country:=upper(coalesce(p_issuing_country,''));
 normalized:=upper(regexp_replace(coalesce(p_document_number,''), '[ .-]', '', 'g'));
 if p_document_type not in ('cpf','passport') or country !~ '^[A-Z]{2}$' then
  raise exception 'invalid_document';
 end if;
 if p_document_type='cpf' and (country<>'BR' or not private.valid_cpf(normalized)) then
  raise exception 'invalid_document';
 end if;
 if p_document_type='passport' and normalized !~ '^[A-Z0-9]{5,20}$' then
  raise exception 'invalid_document';
 end if;
 insert into private.guest_identities(user_id,document_type,issuing_country,document_number,email_at_signup)
 values(p_user_id,p_document_type,country,normalized,guest_email);
 return true;
end $$;
revoke all on function public.register_guest_identity(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.register_guest_identity(uuid,text,text,text) to service_role;
