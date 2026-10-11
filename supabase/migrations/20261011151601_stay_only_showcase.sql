-- Empty product_ids represents an actual lodging-only offer. Existing offers,
-- reservations and experience contracts remain unchanged. Access stays service-only.
alter table public.stay_offers drop constraint stay_offers_check1;
alter table public.stay_offers add constraint stay_offers_properties_required
 check (cardinality(property_ids)>0);
