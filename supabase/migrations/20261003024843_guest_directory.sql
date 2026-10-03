-- Private administrative contacts; no relationship to Auth credentials or payment identity.
create table public.guest_contacts (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 160),
 phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
 notes text not null default '' check(length(notes)<=2000),
 created_by uuid references auth.users(id),
 updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.guest_stay_links (
 stay_key text primary key check(length(stay_key)<=250),
 guest_id uuid not null references public.guest_contacts(id),
 reservation_id uuid references public.reservations(id),
 property_id bigint not null references public.properties(id),
 source text not null check(source in ('direct','manual','airbnb','booking','ical')),
 check_in date not null,
 check_out date not null check(check_out>check_in),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 check ((reservation_id is not null and stay_key='reservation:'||reservation_id::text) or
        (reservation_id is null and source in ('airbnb','booking','ical')))
);
create index guest_stay_links_guest_idx on public.guest_stay_links(guest_id);
create index guest_stay_links_reservation_idx on public.guest_stay_links(reservation_id) where reservation_id is not null;
create index guest_contacts_name_idx on public.guest_contacts(lower(name));
alter table public.guest_contacts enable row level security;
alter table public.guest_stay_links enable row level security;
revoke all on public.guest_contacts,public.guest_stay_links from anon,authenticated;
grant select,insert,update,delete on public.guest_contacts,public.guest_stay_links to service_role;
