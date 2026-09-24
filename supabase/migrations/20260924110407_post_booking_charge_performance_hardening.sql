create index if not exists modification_requests_payment_charge_idx
  on public.modification_requests(payment_charge_id);

create index if not exists notification_outbox_user_idx
  on public.notification_outbox(user_id);
create index if not exists notification_outbox_reservation_idx
  on public.notification_outbox(reservation_id);
create index if not exists notification_outbox_modification_idx
  on public.notification_outbox(modification_request_id);
create index if not exists notification_outbox_charge_idx
  on public.notification_outbox(charge_id);

create index if not exists post_booking_charges_payment_idx
  on public.post_booking_charges(payment_id);
create index if not exists post_booking_charges_target_variant_idx
  on public.post_booking_charges(target_variant_id);
create index if not exists post_booking_charges_source_item_idx
  on public.post_booking_charges(source_experience_item_id);

drop policy if exists guest_reads_own_post_booking_charges on public.post_booking_charges;
create policy guest_reads_own_post_booking_charges
on public.post_booking_charges
for select
to authenticated
using (user_id=(select auth.uid()));
