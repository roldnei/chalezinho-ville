alter table public.reservation_change_events
  drop constraint if exists reservation_change_events_event_type_check;
alter table public.reservation_change_events
  add constraint reservation_change_events_event_type_check
  check (event_type = any(array[
    'requested'::text,'quoted'::text,'admin_decision'::text,'guest_accepted'::text,
    'additional_payment'::text,'applied'::text,'rejected'::text,'cancelled'::text,
    'approved_payment_required'::text,'paid_and_applied'::text,'confirmed_without_charge'::text,
    'cancelled_before_payment'::text,'payment_expired'::text
  ]));