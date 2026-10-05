-- Additive merchandising configuration; previous reservation snapshots are untouched.
alter table public.stay_offers add column if not exists showcase jsonb not null default '{"enabled":false,"nights":[2,3],"horizon_days":60}'::jsonb;
comment on column public.stay_offers.showcase is 'Read-only weekday storefront settings. Prices and availability are calculated by the booking engine, never entered manually.';
