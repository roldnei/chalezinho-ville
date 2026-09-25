-- Provider-neutral delivery metadata. Provider credentials remain Edge Function secrets.
alter table public.notification_outbox
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz;

create index if not exists notification_outbox_provider_message_idx
  on public.notification_outbox(provider,provider_message_id)
  where provider_message_id is not null;

create table if not exists public.notification_delivery_events(
  id bigint generated always as identity primary key,
  outbox_id uuid references public.notification_outbox(id) on delete set null,
  provider text not null,
  provider_message_id text not null,
  event_type text not null,
  event_hash text not null unique,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notification_delivery_events enable row level security;
revoke all on public.notification_delivery_events from public,anon,authenticated;
grant all on public.notification_delivery_events to service_role;
revoke all on sequence public.notification_delivery_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.notification_delivery_events_id_seq to service_role;

comment on column public.notification_outbox.provider is
  'Delivery adapter used for this message. Changing EMAIL_PROVIDER does not change outbox producers or templates.';
