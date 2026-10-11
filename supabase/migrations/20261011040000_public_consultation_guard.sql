-- Prepared only; do not apply to PROD before the reviewed release.
-- Service-only switch also protects direct authenticated Data API/RPC attempts.
create table if not exists public.launch_settings (
 id integer primary key check(id=1),
 public_booking_mode text not null check(public_booking_mode in ('whatsapp','checkout-development')),
 updated_at timestamptz not null default now()
);
alter table public.launch_settings enable row level security;
revoke all on public.launch_settings from public,anon,authenticated;
insert into public.launch_settings(id,public_booking_mode) values(1,'whatsapp') on conflict(id) do nothing;
create or replace function public.guard_consultation_reservation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.source='direct' and new.status in ('hold','pending_payment') and
  exists(select 1 from public.launch_settings where id=1 and public_booking_mode='whatsapp') then
   raise exception 'public_checkout_disabled';
 end if;
 return new;
end $$;
revoke all on function public.guard_consultation_reservation() from public,anon,authenticated;
drop trigger if exists consultation_new_reservation_guard on public.reservations;
create trigger consultation_new_reservation_guard before insert on public.reservations
for each row execute function public.guard_consultation_reservation();
