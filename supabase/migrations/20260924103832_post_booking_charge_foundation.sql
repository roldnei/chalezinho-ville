alter table public.payment_settings
  add column if not exists modification_payment_deadline_hours integer not null default 24
    check (modification_payment_deadline_hours between 1 and 168),
  add column if not exists post_booking_payment_minutes integer not null default 15
    check (post_booking_payment_minutes between 5 and 1440);

alter table public.modification_requests
  add column if not exists payment_charge_id uuid,
  add column if not exists payment_due_at timestamptz;

alter table public.modification_requests drop constraint if exists modification_requests_status_check;
alter table public.modification_requests
  add constraint modification_requests_status_check
  check (status = any(array[
    'requested'::text,'quoted'::text,'awaiting_guest_acceptance'::text,'awaiting_payment'::text,
    'accepted'::text,'rejected'::text,'applied'::text,'cancelled'::text,'payment_expired'::text
  ]));

create table if not exists public.post_booking_charges(
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('experience_add','experience_upgrade','modification')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','processing','paid','applied','cancelled','expired')),
  amount_cents bigint not null check (amount_cents >= 0),
  payment_id uuid references public.payments(id) on delete set null,
  modification_request_id uuid references public.modification_requests(id) on delete cascade,
  target_variant_id uuid references public.experience_variants(id),
  source_experience_item_id uuid references public.experience_order_items(id),
  target_property_id bigint references public.properties(id),
  target_check_in date,
  target_check_out date,
  description text,
  snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modification_requests drop constraint if exists modification_requests_payment_charge_id_fkey;
alter table public.modification_requests
  add constraint modification_requests_payment_charge_id_fkey
  foreign key (payment_charge_id) references public.post_booking_charges(id) on delete set null;

create index if not exists idx_post_booking_charges_user on public.post_booking_charges(user_id,created_at desc);
create index if not exists idx_post_booking_charges_reservation on public.post_booking_charges(reservation_id,created_at desc);
create index if not exists idx_post_booking_charges_deadline on public.post_booking_charges(status,expires_at);

drop index if exists public.one_open_modification_per_reservation;
create unique index one_open_modification_per_reservation
on public.modification_requests(reservation_id)
where status in ('requested','quoted','awaiting_guest_acceptance','awaiting_payment','accepted');

create unique index if not exists one_active_charge_per_modification
on public.post_booking_charges(modification_request_id)
where modification_request_id is not null and status in ('awaiting_payment','processing','paid');

alter table public.post_booking_charges enable row level security;
drop policy if exists guest_reads_own_post_booking_charges on public.post_booking_charges;
create policy guest_reads_own_post_booking_charges on public.post_booking_charges
for select to authenticated using (user_id=auth.uid());

create table if not exists public.notification_outbox(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete cascade,
  modification_request_id uuid references public.modification_requests(id) on delete cascade,
  charge_id uuid references public.post_booking_charges(id) on delete cascade,
  channel text not null default 'email' check (channel='email'),
  template_code text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  send_after timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.notification_outbox enable row level security;
create index if not exists idx_notification_outbox_queue on public.notification_outbox(status,send_after);

alter table public.post_booking_charges
  add constraint post_booking_modification_dates_check check (
    kind <> 'modification' or (target_property_id is not null and target_check_in is not null and target_check_out is not null and target_check_out > target_check_in)
  );
alter table public.post_booking_charges
  add constraint post_booking_experience_target_check check (kind='modification' or target_variant_id is not null);

alter table public.post_booking_charges
  add constraint post_booking_modification_hold_no_overlap
  exclude using gist (
    target_property_id with =,
    daterange(target_check_in,target_check_out,'[)') with &&
  )
  where (kind='modification' and status in ('awaiting_payment','processing','paid'));
