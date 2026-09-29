-- The provider's opaque card token is kept server-side and scoped to one reservation.
-- No card number, CVV, or encrypted card payload is persisted.
create table if not exists public.guarantee_card_tokens (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  provider text not null default 'pagbank_sandbox' check (provider = 'pagbank_sandbox'),
  card_token text not null check (card_token ~ '^CARD_[A-Za-z0-9-]+$'),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.guarantee_card_tokens enable row level security;
revoke all on public.guarantee_card_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.guarantee_card_tokens to service_role;

-- Tokens for reservations that never reached payment confirmation are discarded.
create or replace function public.purge_unconfirmed_guarantee_tokens()
returns void language sql security invoker set search_path = public as $$
  delete from public.guarantee_card_tokens t using public.reservations r
  where t.reservation_id=r.id and r.status in ('cancelled','expired','not_confirmed')
    and r.confirmed_at is null;
$$;
revoke all on function public.purge_unconfirmed_guarantee_tokens() from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_guarantee_tokens() to service_role;

-- The dispatch credential is generated in the database and read only by the
-- scheduler. The Edge Function checks it through a service-role-only RPC.
select vault.create_secret(encode(gen_random_bytes(32),'hex'),'guarantee_dispatch_secret')
where not exists (select 1 from vault.secrets where name='guarantee_dispatch_secret');

create or replace function public.verify_guarantee_dispatch_secret(p_secret text)
returns boolean language sql security definer set search_path = public, vault as $$
  select coalesce(length(p_secret)>=32 and exists (
    select 1 from vault.decrypted_secrets
    where name='guarantee_dispatch_secret' and decrypted_secret=p_secret
  ),false);
$$;
revoke all on function public.verify_guarantee_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_guarantee_dispatch_secret(text) to service_role;

select cron.schedule('authorize-due-guarantees','*/15 * * * *',
  $$select net.http_post(
    url := 'https://irxsaladqhbzhkoaclxy.supabase.co/functions/v1/guarantee-preview',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-chalezinho-env','development','x-guarantee-dispatch-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='guarantee_dispatch_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000
  );$$);
