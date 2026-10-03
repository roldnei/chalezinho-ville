alter table public.same_day_requests add column estimated_arrival_time text check (estimated_arrival_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
comment on column public.same_day_requests.estimated_arrival_time is 'Estimated arrival in property local time (America/Sao_Paulo); null for legacy requests.';
