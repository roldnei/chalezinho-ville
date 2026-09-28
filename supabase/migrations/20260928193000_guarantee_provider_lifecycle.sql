-- Sandbox guarantee operations are isolated from booking payments. Provider
-- outcomes must be observed before money or the guarantee status is final.
alter table public.guarantees
  add column if not exists provider_order_id text,
  add column if not exists provider_capture_before timestamptz,
  add column if not exists provider_last_status text,
  add column if not exists provider_error_code text,
  add column if not exists requested_capture_cents bigint,
  add column if not exists authorization_attempt integer not null default 0;

create unique index if not exists guarantees_one_per_reservation
  on public.guarantees(reservation_id);

alter table public.guarantees drop constraint if exists guarantees_status_check;
alter table public.guarantees add constraint guarantees_status_check check(status in
  ('pending','authorizing','authorization_uncertain','guaranteed','released',
   'release_requested','release_uncertain','incident_reported','capture_requested',
   'capture_uncertain','captured','disputed','resolved'));

alter table public.guarantees add constraint guarantees_requested_capture_bounds
  check(requested_capture_cents is null or
    (requested_capture_cents>0 and requested_capture_cents<=amount_cents));

-- The Edge Function uses service_role. Guests retain SELECT on their own
-- guarantee; there is no guest INSERT/UPDATE grant or policy for money states.
