-- DEV only. Stores booking choices, never variable prices or payment data.
alter table public.villegram_publications add column if not exists stay_selection jsonb;
alter table public.villegram_publications add constraint villegram_stay_selection_valid check (
 stay_selection is null or (
  property_id is not null and jsonb_typeof(stay_selection)='object'
  and stay_selection ?& array['check_in','check_out','guests','rate_code']
  and stay_selection - array['check_in','check_out','guests','rate_code'] = '{}'::jsonb
  and jsonb_typeof(stay_selection->'check_in')='string' and jsonb_typeof(stay_selection->'check_out')='string' and jsonb_typeof(stay_selection->'rate_code')='string'
  and (stay_selection->>'check_in') ~ '^\d{4}-\d{2}-\d{2}$'
  and (stay_selection->>'check_out') ~ '^\d{4}-\d{2}-\d{2}$'
  and (stay_selection->>'check_out')::date > (stay_selection->>'check_in')::date
  and (stay_selection->>'check_out')::date - (stay_selection->>'check_in')::date <= 90
  and jsonb_typeof(stay_selection->'guests')='number'
  and (stay_selection->>'guests') ~ '^([1-9]|1[0-2])$'
  and stay_selection->>'rate_code' in ('refundable','non_refundable')
 )
);
