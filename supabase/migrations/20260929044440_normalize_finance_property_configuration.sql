-- Old catalogs stored amenities as an array. jsonb concatenation with an
-- object appends an array element instead of creating a payment_terms key.
update public.properties p set features=jsonb_build_object(
 'amenities',coalesce((select jsonb_agg(v) from jsonb_array_elements(p.features) v where jsonb_typeof(v)='string'),'[]'::jsonb),
 'payment_terms',jsonb_build_object('max_installments',12,'no_interest_installments',6,'interest_payer','guest')||
   coalesce((select v->'payment_terms' from jsonb_array_elements(p.features) v where jsonb_typeof(v->'payment_terms')='object' limit 1),'{}'::jsonb))
where jsonb_typeof(p.features)='array';
