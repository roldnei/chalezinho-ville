-- 20260923233705_phase1_cover_foreign_keys.sql
create index if not exists analytics_events_property_idx on public.analytics_events(property_id);
create index if not exists analytics_events_reservation_idx on public.analytics_events(reservation_id);
create index if not exists analytics_events_user_idx on public.analytics_events(user_id);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id);
create index if not exists experience_order_items_product_idx on public.experience_order_items(product_id);
create index if not exists experience_order_items_variant_idx on public.experience_order_items(variant_id);
create index if not exists experience_products_policy_idx on public.experience_products(cancellation_policy_id);
create index if not exists financial_entries_experience_item_idx on public.financial_entries(experience_order_item_id);
create index if not exists financial_entries_payment_idx on public.financial_entries(payment_id);
create index if not exists modification_requests_quote_idx on public.modification_requests(reference_quote_id);
create index if not exists modification_requests_property_idx on public.modification_requests(requested_property_id);
create index if not exists quote_experience_items_product_idx on public.quote_experience_items(product_id);
create index if not exists quote_experience_items_variant_idx on public.quote_experience_items(variant_id);
create index if not exists quotes_property_idx on public.quotes(property_id);
create index if not exists reservation_change_events_actor_idx on public.reservation_change_events(actor_user_id);
create index if not exists reservation_change_events_request_idx on public.reservation_change_events(modification_request_id);
