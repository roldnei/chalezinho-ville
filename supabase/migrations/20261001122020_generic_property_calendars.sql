alter table public.property_calendar_sources drop constraint property_calendar_sources_property_id_provider_key;
alter table public.property_calendar_sources drop constraint property_calendar_sources_provider_check;
alter table public.property_calendar_sources add constraint property_calendar_sources_provider_check check(provider in ('booking','airbnb','ical'));
alter table public.property_calendar_sources add column deleted_at timestamptz;
create unique index property_calendar_source_url_unique on public.property_calendar_sources(property_id,md5(feed_url)) where deleted_at is null and feed_url is not null;
update public.property_calendar_sources set label=case provider when 'booking' then 'Booking' when 'airbnb' then 'Airbnb' else 'Calendário externo' end where btrim(label)='';
