-- Defer identity for the short cleaning signup only. Preserve lodging identity guard.
create or replace function private.register_guest_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; number text; country text;
begin
 kind:=new.raw_user_meta_data->>'document_type';
 if kind is null then
  -- This marker chooses deferred identity collection, never authorization.
  -- Checkout still requires guest_identity_present; worker release is separate.
  if new.raw_user_meta_data->>'onboarding'='cleaning' then return new;end if;
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


revoke all on function private.register_guest_identity() from public,anon,authenticated;
