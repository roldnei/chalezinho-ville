-- The document is stored outside exposed schemas; raw signup metadata is scrubbed.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.guest_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('cpf','passport')),
  issuing_country text not null check (issuing_country ~ '^[A-Z]{2}$'),
  document_number text not null,
  email_at_signup text not null,
  created_at timestamptz not null default now(),
  unique (document_type, issuing_country, document_number)
);
alter table private.guest_identities enable row level security;
revoke all on private.guest_identities from public, anon, authenticated;

create or replace function private.valid_cpf(v text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare n int; i int; total int; digit int;
begin
 if v !~ '^[0-9]{11}$' or v ~ '^([0-9])\1{10}$' then return false; end if;
 for n in 9..10 loop
  total:=0;
  for i in 1..n loop total:=total+substring(v from i for 1)::int*(n+2-i); end loop;
  digit:=(total*10)%11;
  if digit=10 then digit:=0; end if;
  if digit<>substring(v from n+1 for 1)::int then return false; end if;
 end loop;
 return true;
end $$;

create or replace function private.register_guest_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; number text; country text;
begin
 kind:=new.raw_user_meta_data->>'document_type';
 if kind is null then return new; end if; -- existing admin and invitation flows
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
 -- Auth metadata is user-editable and can appear in JWTs. Remove the sensitive values.
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
   - 'document_type' - 'document_number' - 'issuing_country' where id=new.id;
 return new;
end $$;

drop trigger if exists on_guest_identity_created on auth.users;
create trigger on_guest_identity_created after insert on auth.users
for each row execute function private.register_guest_identity();
