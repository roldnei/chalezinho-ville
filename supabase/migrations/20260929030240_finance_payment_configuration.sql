-- Isolated development only: replace the legacy 'mock enables sandbox' switch.
alter table public.payment_settings add column pix_enabled boolean not null default true;
alter table public.payment_settings add column card_enabled boolean not null default true;
update public.payment_settings set active_provider='pagbank_sandbox' where active_provider='mock';
update public.properties set features=coalesce(features,'{}'::jsonb)||jsonb_build_object('payment_terms',
 jsonb_build_object('max_installments',12,'no_interest_installments',6,'interest_payer','guest')||
 coalesce(features->'payment_terms','{}'::jsonb));
