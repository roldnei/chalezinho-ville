-- A channel is recorded only for fees/collection expenses; financial amounts
-- continue to come from the platform statement, never from iCal estimates.
alter table public.cost_entries
 add column channel text check (channel in ('airbnb','booking','site')),
 add column external_reference text check (length(external_reference)<=120),
 add constraint cost_channel_only_for_fees check (
  channel is null or category in ('platform_commission','administration')
 );

create index cost_entries_channel_paid_idx
 on public.cost_entries(channel,paid_on,property_id)
 where archived_at is null and channel is not null;

