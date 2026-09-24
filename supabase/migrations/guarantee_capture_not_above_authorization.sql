-- guarantee_capture_not_above_authorization.sql
alter table public.guarantees
  drop constraint if exists guarantees_captured_within_authorized_amount;

alter table public.guarantees
  add constraint guarantees_captured_within_authorized_amount
  check (captured_amount_cents <= amount_cents);
