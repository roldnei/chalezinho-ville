-- Central operacional da Fase 1: agenda, check-in/out, notas e alertas internos.

alter table public.properties
  add column if not exists check_in_time time not null default '15:00',
  add column if not exists check_out_time time not null default '11:00',
  add column if not exists timezone text not null default 'America/Sao_Paulo';

alter table public.reservations
  add column if not exists operational_status text not null default 'upcoming',
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_operational_status_check;

alter table public.reservations
  add constraint reservations_operational_status_check
  check (operational_status in ('upcoming','preparing','ready','checked_in','checked_out','attention'));

create table if not exists public.reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists reservation_notes_reservation_created_idx
  on public.reservation_notes (reservation_id, created_at desc);
create index if not exists reservation_notes_author_idx
  on public.reservation_notes (author_user_id) where author_user_id is not null;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  title text not null,
  message text,
  reservation_id uuid references public.reservations(id) on delete cascade,
  entity_type text,
  entity_id text,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_unread_created_idx
  on public.admin_notifications (created_at desc) where read_at is null;
create index if not exists admin_notifications_reservation_idx
  on public.admin_notifications (reservation_id, created_at desc);

alter table public.reservation_notes enable row level security;
alter table public.admin_notifications enable row level security;

revoke all on public.reservation_notes from public, anon, authenticated;
revoke all on public.admin_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.reservation_notes to service_role;
grant select, insert, update, delete on public.admin_notifications to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.enqueue_admin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_title text;
  v_message text;
  v_type text;
  v_severity text := 'info';
  v_dedupe text;
begin
  if tg_table_name = 'reservations' then
    v_reservation_id := new.id;
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      v_type := 'reservation_confirmed'; v_severity := 'success';
      v_title := 'Nova reserva confirmada';
      v_message := coalesce(new.guest_name, 'Hóspede') || ' · ' || new.check_in || ' a ' || new.check_out;
      v_dedupe := 'reservation_confirmed:' || new.id;
    elsif new.status = 'cancelled' and old.status is distinct from new.status then
      v_type := 'reservation_cancelled'; v_severity := 'warning';
      v_title := 'Reserva cancelada';
      v_message := coalesce(new.guest_name, 'Hóspede') || ' · ' || coalesce(new.cancellation_reason, 'Sem motivo informado');
      v_dedupe := 'reservation_cancelled:' || new.id;
    else
      return new;
    end if;
  elsif tg_table_name = 'post_booking_charges' then
    if new.status <> 'applied' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then return new; end if;
    v_reservation_id := new.reservation_id;
    v_type := case when new.kind = 'experience_upgrade' then 'experience_upgrade' else 'experience_added' end;
    v_severity := 'success';
    v_title := case when new.kind = 'experience_upgrade' then 'Upgrade comprado' else 'Experiência comprada' end;
    v_message := coalesce(new.description, 'Pacote adicional') || ' · R$ ' || to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
    v_dedupe := 'post_booking_applied:' || new.id;
  elsif tg_table_name = 'modification_requests' then
    if new.status <> 'requested' or tg_op <> 'INSERT' then return new; end if;
    v_reservation_id := new.reservation_id;
    v_type := 'modification_requested'; v_severity := 'warning';
    v_title := 'Alteração solicitada';
    v_message := 'O hóspede solicitou mudança de data ou propriedade.';
    v_dedupe := 'modification_requested:' || new.id;
  elsif tg_table_name = 'payments' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
    if new.status = 'under_review' then
      v_type := 'payment_under_review'; v_severity := 'warning'; v_title := 'Pagamento em análise';
    elsif new.status = 'refused' then
      v_type := 'payment_refused'; v_severity := 'warning'; v_title := 'Pagamento recusado';
    elsif new.status = 'chargeback' then
      v_type := 'payment_chargeback'; v_severity := 'critical'; v_title := 'Contestação de pagamento';
    else
      return new;
    end if;
    v_reservation_id := new.reservation_id;
    v_message := 'Valor: R$ ' || to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
    v_dedupe := 'payment_status:' || new.id || ':' || new.status;
  elsif tg_table_name = 'incidents' then
    v_type := 'guarantee_incident'; v_severity := 'critical';
    v_title := 'Ocorrência de garantia'; v_message := new.description;
    select g.reservation_id into v_reservation_id from public.guarantees g where g.id = new.guarantee_id;
    v_dedupe := 'guarantee_incident:' || new.id;
  else
    return new;
  end if;

  insert into public.admin_notifications (
    notification_type,severity,title,message,reservation_id,entity_type,entity_id,dedupe_key,payload
  ) values (
    v_type,v_severity,v_title,v_message,v_reservation_id,tg_table_name,new.id::text,v_dedupe,
    jsonb_build_object('source_table',tg_table_name)
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_admin_notification() from public, anon, authenticated;

drop trigger if exists reservations_admin_notification on public.reservations;
create trigger reservations_admin_notification
after insert or update of status on public.reservations
for each row execute function private.enqueue_admin_notification();

drop trigger if exists post_booking_charges_admin_notification on public.post_booking_charges;
create trigger post_booking_charges_admin_notification
after insert or update of status on public.post_booking_charges
for each row execute function private.enqueue_admin_notification();

drop trigger if exists modification_requests_admin_notification on public.modification_requests;
create trigger modification_requests_admin_notification
after insert on public.modification_requests
for each row execute function private.enqueue_admin_notification();

drop trigger if exists payments_admin_notification on public.payments;
create trigger payments_admin_notification
after insert or update of status on public.payments
for each row execute function private.enqueue_admin_notification();

drop trigger if exists incidents_admin_notification on public.incidents;
create trigger incidents_admin_notification
after insert on public.incidents
for each row execute function private.enqueue_admin_notification();
