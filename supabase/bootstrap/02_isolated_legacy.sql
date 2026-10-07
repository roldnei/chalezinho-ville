-- Historical: 20260923233705 phase1_cover_foreign_keys

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
;

-- Historical: 20260924001601 remove_pg_net_after_internal_qa
drop extension if exists pg_net cascade;;

-- Historical: 20260924005001 phase1_experience_media_and_modification_guard

-- Experience media and conversion fields.
alter table public.experience_products
  add column if not exists sales_headline text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.experience_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.experience_products(id) on delete cascade,
  media_url text not null,
  alt_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists experience_media_product_idx on public.experience_media(product_id,display_order);
alter table public.experience_media enable row level security;
drop policy if exists "experience_media_public_read" on public.experience_media;
create policy "experience_media_public_read" on public.experience_media
for select to anon,authenticated using (
  exists(select 1 from public.experience_products p where p.id=product_id and (p.status='active' or private.current_user_is_admin()))
);
grant select on public.experience_media to anon,authenticated;
grant all on public.experience_media to service_role;

-- Public media bucket; writes remain admin-only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('experience-media','experience-media',true,10485760,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "experience_media_admin_insert" on storage.objects;
create policy "experience_media_admin_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
drop policy if exists "experience_media_admin_update" on storage.objects;
create policy "experience_media_admin_update" on storage.objects
for update to authenticated
using (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
)
with check (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
drop policy if exists "experience_media_admin_delete" on storage.objects;
create policy "experience_media_admin_delete" on storage.objects
for delete to authenticated
using (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

-- Seed richer DEV copy and galleries using existing site photography.
update public.experience_products
set sales_headline='Transforme a chegada em um momento só de vocês.',
    description='Uma ambientação romântica preparada antes da chegada para mudar completamente a primeira impressão do chalé.',
    details='{"includes":["ambientação romântica","detalhes decorativos","preparo antes da chegada"]}'::jsonb
where code='dev_romantic';

update public.experience_products
set sales_headline='Comece o dia sem pressa.',
    description='Um momento de café pensado para aproveitar o chalé com calma e tornar a manhã parte da experiência.',
    details='{"includes":["montagem para dois","apresentação especial","entrega conforme antecedência"]}'::jsonb
where code='dev_breakfast';

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-flores.webp','Decoração romântica com flores',10 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-flores.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-coracao-hidro.webp','Hidromassagem preparada para um momento romântico',20 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-coracao-hidro.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-romance.webp','Experiência romântica no chalé',30 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-romance.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-vinho-deck-1.webp','Taças e vinho no deck',40 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-vinho-deck-1.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/01-cantinho-cafe.webp','Cantinho do café no chalé',10 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/01-cantinho-cafe.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/05-mesa-cozinha.webp','Mesa preparada no chalé',20 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/05-mesa-cozinha.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/04-decoracao.webp','Detalhes de decoração',30 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/04-decoracao.webp');

-- Preserve history but allow only one live modification request per reservation.
with ranked as (
  select id,row_number() over(partition by reservation_id order by created_at desc,id desc) rn
  from public.modification_requests
  where status in ('requested','quoted','awaiting_guest_acceptance','accepted')
)
update public.modification_requests m
set status='cancelled',updated_at=now()
from ranked r
where m.id=r.id and r.rn>1;

create unique index if not exists one_open_modification_per_reservation
on public.modification_requests(reservation_id)
where status in ('requested','quoted','awaiting_guest_acceptance','accepted');
;

-- Historical: 20260924011905 simplify_experience_admin_model

alter table public.experience_products
  add column if not exists package_type text not null default 'other',
  add column if not exists price_cents bigint not null default 0 check(price_cents >= 0),
  add column if not exists upsell_enabled boolean not null default false;

-- Backfill package types for existing records.
update public.experience_products set package_type='romantic'
where code in ('dev_romantic','uplm') and package_type='other';
update public.experience_products set package_type='breakfast'
where code='dev_breakfast' and package_type='other';

-- Use the lowest ordered active variant as the current package price.
update public.experience_products p
set price_cents = coalesce((
  select v.price_cents
  from public.experience_variants v
  where v.product_id=p.id and v.active=true
  order by v.display_order,v.created_at
  limit 1
),p.price_cents)
where p.price_cents=0;

-- Complete existing galleries to at least five images with site photography.
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/05-suite.webp','Suíte preparada para a experiência',50
from public.experience_products p where p.code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/05-suite.webp');

-- Breakfast keeps its three existing photographs; obsolete asset paths are not seeded.

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-flores.webp','Decoração romântica com flores',20
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-flores.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-coracao-hidro.webp','Hidromassagem preparada para um momento romântico',30
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-coracao-hidro.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-vinho-deck-1.webp','Taças e vinho no deck',40
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-vinho-deck-1.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-romance.webp','Experiência romântica completa',50
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-romance.webp');
;

-- Historical: 20260924014723 booking_price_breakdown_and_upsell_snapshot

alter table public.reservations
  add column if not exists experience_amount numeric(12,2) not null default 0;

update public.reservations
set experience_amount = greatest(0,coalesce(total_amount,0)-coalesce(accommodation_amount,0)-coalesce(cleaning_fee,0))
where experience_amount=0
  and coalesce(total_amount,0) > coalesce(accommodation_amount,0)+coalesce(cleaning_fee,0);

-- Current commercial values supplied for the romantic packages.
update public.experience_products
set price_cents=54900, upsell_enabled=false, updated_at=now()
where code='noite_romantica_6a7d18';

update public.experience_products
set price_cents=59900, upsell_enabled=true, updated_at=now()
where code='uplm';

-- Keep the technical compatibility variant aligned with each package price.
with first_variant as (
  select distinct on (product_id) id,product_id
  from public.experience_variants
  where active=true
  order by product_id,display_order,created_at
)
update public.experience_variants v
set price_cents=p.price_cents
from first_variant f
join public.experience_products p on p.id=f.product_id
where v.id=f.id and p.code in ('noite_romantica_6a7d18','uplm');

create or replace function public.start_payment_hold(
  p_quote_id uuid,
  p_quote_option_id uuid,
  p_user_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guests integer
)
returns table(reservation_id uuid, confirmation_code text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  q public.quotes%rowtype;
  o public.quote_options%rowtype;
  v_id uuid;
  v_code text;
  v_expires timestamptz;
  v_experience numeric(12,2);
begin
  perform public.expire_stale_reservations();

  select * into q from public.quotes
   where id=p_quote_id and status='active' and expires_at>now()
   for update;
  if not found then raise exception 'quote_expired'; end if;

  select * into o from public.quote_options
   where id=p_quote_option_id and quote_id=q.id;
  if not found then raise exception 'invalid_quote_option'; end if;

  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_expires := now() + interval '15 minutes';
  v_experience := greatest(0,(o.total_amount_cents-o.accommodation_amount_cents-o.cleaning_fee_cents)/100.0);

  insert into public.reservations(
    property_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,
    accommodation_amount,cleaning_fee,experience_amount,total_amount,hold_expires_at,user_id,quote_id,quote_option_id,
    rate_plan_code,confirmation_code
  )
  select q.property_id,q.check_in,q.check_out,'pending_payment','direct',p_guests,p_guest_name,p_guest_email,p_guest_phone,
    o.accommodation_amount_cents/100.0,o.cleaning_fee_cents/100.0,v_experience,o.total_amount_cents/100.0,
    v_expires,p_user_id,q.id,o.id,rp.code,v_code
  from public.rate_plans rp where rp.id=o.rate_plan_id
  returning id into v_id;

  update public.quotes set status='consumed' where id=q.id;

  return query select v_id,v_code,v_expires;
exception
  when exclusion_violation then
    raise exception 'dates_unavailable';
end;
$function$;
;

-- Historical: 20260924015952 allow_simple_package_snapshot

alter table public.quote_experience_items
  alter column variant_name_snapshot drop not null;

update public.experience_variants v
set code='package', name='Pacote'
from public.experience_products p
where v.product_id=p.id
  and p.code='uplm'
  and v.active=true;

-- Keep only the first active technical variant for simplified package records that already have a package-level price.
with ranked as (
  select v.id,
         row_number() over(partition by v.product_id order by v.display_order,v.created_at,v.id) rn
  from public.experience_variants v
  join public.experience_products p on p.id=v.product_id
  where v.active=true and p.price_cents>0
)
update public.experience_variants v
set active=false
from ranked r
where v.id=r.id and r.rn>1;
;

-- Historical: 20260924022801 guest_stay_price_and_modification_estimate

alter table public.reservations
  add column if not exists stay_amount numeric(12,2);

update public.reservations
set stay_amount = coalesce(accommodation_amount,0) + coalesce(cleaning_fee,0)
where stay_amount is null;

alter table public.reservations
  alter column stay_amount set default 0,
  alter column stay_amount set not null;

alter table public.modification_requests
  add column if not exists estimated_additional_amount_cents bigint;

-- Recalculate open requests using only the guest-visible stay amount:
-- accommodation + cleaning internally, presented as one stay price.
with selected_ref as (
  select distinct on (m.id)
    m.id,
    round((coalesce(r.accommodation_amount,0)+coalesce(r.cleaning_fee,0))*100)::bigint as original_stay_cents,
    (qo.accommodation_amount_cents+qo.cleaning_fee_cents)::bigint as reference_stay_cents
  from public.modification_requests m
  join public.reservations r on r.id=m.reservation_id
  join public.quote_options qo on qo.quote_id=m.reference_quote_id
  join public.rate_plans rp on rp.id=qo.rate_plan_id
  where m.status in ('requested','quoted','awaiting_guest_acceptance','accepted')
  order by m.id,
    case when rp.code=r.rate_plan_code then 0
         when rp.code='non_refundable' then 1 else 2 end
)
update public.modification_requests m
set original_amount_cents=s.original_stay_cents,
    reference_amount_cents=s.reference_stay_cents,
    estimated_additional_amount_cents=greatest(0,s.reference_stay_cents-s.original_stay_cents),
    updated_at=now()
from selected_ref s
where m.id=s.id;

create or replace function public.start_payment_hold(
  p_quote_id uuid,
  p_quote_option_id uuid,
  p_user_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guests integer
)
returns table(reservation_id uuid, confirmation_code text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  q public.quotes%rowtype;
  o public.quote_options%rowtype;
  v_id uuid;
  v_code text;
  v_expires timestamptz;
  v_experience numeric(12,2);
  v_stay numeric(12,2);
begin
  perform public.expire_stale_reservations();

  select * into q from public.quotes
   where id=p_quote_id and status='active' and expires_at>now()
   for update;
  if not found then raise exception 'quote_expired'; end if;

  select * into o from public.quote_options
   where id=p_quote_option_id and quote_id=q.id;
  if not found then raise exception 'invalid_quote_option'; end if;

  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_expires := now() + interval '15 minutes';
  v_experience := greatest(0,(o.total_amount_cents-o.accommodation_amount_cents-o.cleaning_fee_cents)/100.0);
  v_stay := (o.accommodation_amount_cents+o.cleaning_fee_cents)/100.0;

  insert into public.reservations(
    property_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,
    accommodation_amount,cleaning_fee,stay_amount,experience_amount,total_amount,
    hold_expires_at,user_id,quote_id,quote_option_id,rate_plan_code,confirmation_code
  )
  select q.property_id,q.check_in,q.check_out,'pending_payment','direct',p_guests,p_guest_name,p_guest_email,p_guest_phone,
    o.accommodation_amount_cents/100.0,o.cleaning_fee_cents/100.0,v_stay,v_experience,o.total_amount_cents/100.0,
    v_expires,p_user_id,q.id,o.id,rp.code,v_code
  from public.rate_plans rp where rp.id=o.rate_plan_id
  returning id into v_id;

  update public.quotes set status='consumed' where id=q.id;

  return query select v_id,v_code,v_expires;
exception
  when exclusion_violation then
    raise exception 'dates_unavailable';
end;
$function$;
;

-- Historical: 20260924030842 harden_guest_profile_and_modification_rls

-- Restrict guest profile updates to safe self-service fields.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, marketing_consent) on table public.profiles to authenticated;

-- A guest may only request a modification for a reservation they actually own.
drop policy if exists modifications_own_insert on public.modification_requests;
create policy modifications_own_insert
on public.modification_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and r.user_id = (select auth.uid())
  )
);
;

-- Historical: 20260924033214 guarantee_capture_not_above_authorization

alter table public.guarantees
  drop constraint if exists guarantees_captured_within_authorized_amount;

alter table public.guarantees
  add constraint guarantees_captured_within_authorized_amount
  check (captured_amount_cents <= amount_cents);
;

-- Historical: 20260924052734 atomic_modification_and_guarantee_capture

create or replace function public.apply_modification_mock_atomic(
  p_request_id uuid,
  p_actor_user_id uuid
)
returns table(result_status text, result_payment_id uuid, result_total_amount numeric)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  m public.modification_requests%rowtype;
  r public.reservations%rowtype;
  v_amount bigint;
  v_payment_id uuid;
  v_existing public.payments%rowtype;
  v_total numeric(12,2);
  v_idem text;
begin
  select * into m
  from public.modification_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'modification_not_found';
  end if;
  if m.status <> 'accepted' then
    raise exception 'guest_acceptance_required';
  end if;

  select * into r
  from public.reservations
  where id=m.reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  v_amount := greatest(0,coalesce(m.admin_additional_amount_cents,0));
  v_total := round((coalesce(r.total_amount,0) + v_amount/100.0)::numeric,2);

  begin
    update public.reservations
       set property_id=coalesce(m.requested_property_id,r.property_id),
           check_in=coalesce(m.requested_check_in,r.check_in),
           check_out=coalesce(m.requested_check_out,r.check_out),
           total_amount=v_total,
           updated_at=now()
     where id=r.id;
  exception
    when exclusion_violation then
      raise exception 'dates_unavailable';
  end;

  if v_amount > 0 then
    v_idem := 'mod-'||m.id::text;

    select * into v_existing
    from public.payments
    where idempotency_key=v_idem
    for update;

    if found then
      if v_existing.status <> 'paid' then
        raise exception 'additional_payment_not_paid';
      end if;
      v_payment_id := v_existing.id;
    else
      insert into public.payments(
        reservation_id,user_id,provider,method,amount_cents,status,idempotency_key,metadata
      ) values (
        m.reservation_id,m.user_id,'mock','mock',v_amount,'paid',v_idem,
        jsonb_build_object('development',true,'kind','modification','modification_request_id',m.id)
      )
      returning id into v_payment_id;
    end if;

    if not exists (
      select 1 from public.financial_entries
      where payment_id=v_payment_id and entry_type='additional_charge'
    ) then
      insert into public.financial_entries(
        reservation_id,payment_id,entry_type,amount_cents,description
      ) values (
        m.reservation_id,v_payment_id,'additional_charge',v_amount,'Revisão de tarifa da alteração'
      );
    end if;
  end if;

  update public.modification_requests
     set status='applied',applied_at=now(),updated_at=now()
   where id=m.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values (
    m.reservation_id,m.id,'applied',to_jsonb(r),
    jsonb_build_object(
      'property_id',coalesce(m.requested_property_id,r.property_id),
      'check_in',coalesce(m.requested_check_in,r.check_in),
      'check_out',coalesce(m.requested_check_out,r.check_out),
      'total_amount',v_total
    ),
    v_amount,p_actor_user_id
  );

  return query select 'applied'::text,v_payment_id,v_total;
end;
$function$;

revoke all on function public.apply_modification_mock_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.apply_modification_mock_atomic(uuid,uuid) to service_role;

create or replace function public.capture_guarantee_mock_atomic(
  p_guarantee_id uuid,
  p_actor_user_id uuid,
  p_amount_cents bigint
)
returns table(result_status text, captured_amount_cents bigint, released_amount_cents bigint)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  g public.guarantees%rowtype;
  v_amount bigint;
  v_incident_id uuid;
begin
  select * into g
  from public.guarantees
  where id=p_guarantee_id
  for update;

  if not found then
    raise exception 'guarantee_not_found';
  end if;

  if g.status='captured' then
    return query select 'captured'::text,g.captured_amount_cents,g.amount_cents-g.captured_amount_cents;
    return;
  end if;

  if g.status not in ('incident_reported','capture_requested') then
    raise exception 'incident_required';
  end if;

  v_amount := greatest(0,coalesce(p_amount_cents,0));
  if v_amount > g.amount_cents then
    raise exception 'capture_exceeds_guarantee';
  end if;

  select id into v_incident_id
  from public.incidents
  where guarantee_id=g.id and status='open'
  order by created_at desc
  limit 1
  for update;

  if v_incident_id is null then
    raise exception 'incident_required';
  end if;

  update public.guarantees
     set status='captured',captured_amount_cents=v_amount,updated_at=now()
   where id=g.id;

  if v_amount>0 and not exists (
    select 1 from public.financial_entries
    where reservation_id=g.reservation_id
      and entry_type='guarantee_capture'
      and description='Captura parcial de garantia'
  ) then
    insert into public.financial_entries(
      reservation_id,entry_type,amount_cents,description
    ) values (
      g.reservation_id,'guarantee_capture',v_amount,'Captura parcial de garantia'
    );
  end if;

  update public.incidents
     set status='resolved',resolved_at=now()
   where guarantee_id=g.id and status='open';

  return query select 'captured'::text,v_amount,g.amount_cents-v_amount;
end;
$function$;

revoke all on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.capture_guarantee_mock_atomic(uuid,uuid,bigint) to service_role;
;

-- Historical: 20260924053929 post_booking_experience_purchase_mock

create or replace function public.purchase_post_booking_experience_mock_atomic(
  p_reservation_id uuid,
  p_user_id uuid,
  p_variant_id uuid
)
returns table(
  result_order_id uuid,
  result_item_id uuid,
  result_payment_id uuid,
  result_amount_cents bigint,
  result_total_amount numeric
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  p public.experience_products%rowtype;
  v_order_id uuid;
  v_item_id uuid;
  v_payment_id uuid;
  v_count integer;
  v_total numeric(12,2);
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;

  if not found or r.status <> 'confirmed' then
    raise exception 'reservation_not_available';
  end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;

  if not found then
    raise exception 'experience_unavailable';
  end if;

  select * into p
  from public.experience_products
  where id=v.product_id
  for update;

  if not found or p.status <> 'active' then
    raise exception 'experience_unavailable';
  end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=p.id and e.property_id=r.property_id
  ) then
    raise exception 'experience_unavailable';
  end if;

  if ((r.check_in::text || ' 15:00:00-03')::timestamptz - now()) < make_interval(hours=>p.minimum_lead_hours) then
    raise exception 'experience_lead_time';
  end if;

  if p.inventory is not null and p.inventory <= 0 then
    raise exception 'experience_out_of_stock';
  end if;

  if exists (
    select 1
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    where o.reservation_id=r.id
      and i.product_id=p.id
      and i.status='active'
      and o.status in ('pending','active')
  ) then
    raise exception 'experience_already_added';
  end if;

  if p.daily_capacity is not null then
    select count(*)::int into v_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=p.id
      and i.status='active'
      and o.status in ('pending','active')
      and rr.status in ('confirmed','pending_payment')
      and rr.check_in=r.check_in;

    if v_count >= p.daily_capacity then
      raise exception 'experience_capacity_reached';
    end if;
  end if;

  insert into public.experience_orders(reservation_id,user_id,status)
  values(r.id,p_user_id,'active')
  returning id into v_order_id;

  insert into public.experience_order_items(
    order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,
    unit_price_cents,quantity,status
  ) values (
    v_order_id,p.id,v.id,p.name,
    case when v.code='package' then null else v.name end,
    v.price_cents,1,'active'
  )
  returning id into v_item_id;

  insert into public.payments(
    reservation_id,user_id,provider,method,amount_cents,status,idempotency_key,metadata
  ) values (
    r.id,p_user_id,'mock','mock',v.price_cents,'paid',
    'postexp-'||v_item_id::text,
    jsonb_build_object(
      'development',true,
      'kind','post_booking_experience',
      'experience_order_id',v_order_id,
      'experience_order_item_id',v_item_id
    )
  )
  returning id into v_payment_id;

  insert into public.financial_entries(
    reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,description
  ) values (
    r.id,v_payment_id,v_item_id,'experience',v.price_cents,p.name
  );

  v_total := round((coalesce(r.total_amount,0) + v.price_cents/100.0)::numeric,2);

  update public.reservations
  set experience_amount=round((coalesce(experience_amount,0)+v.price_cents/100.0)::numeric,2),
      total_amount=v_total,
      updated_at=now()
  where id=r.id;

  return query select v_order_id,v_item_id,v_payment_id,v.price_cents,v_total;
end;
$function$;

revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from public;
revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from anon;
revoke all on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) from authenticated;
grant execute on function public.purchase_post_booking_experience_mock_atomic(uuid,uuid,uuid) to service_role;
;

-- Historical: 20260924055453 post_booking_experience_upgrade_atomic

create or replace function public.purchase_or_upgrade_post_booking_experience_mock_atomic(
  p_reservation_id uuid,
  p_user_id uuid,
  p_variant_id uuid
)
returns table(
  result_mode text,
  result_order_id uuid,
  result_item_id uuid,
  result_payment_id uuid,
  result_amount_cents bigint,
  result_total_amount numeric
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_item public.experience_order_items%rowtype;
  current_product public.experience_products%rowtype;
  next_product_id uuid;
  v_mode text := 'added';
  v_charge bigint;
  v_order_id uuid;
  v_item_id uuid;
  v_payment_id uuid;
  v_count integer;
  v_total numeric(12,2);
begin
  select * into r from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  if ((r.check_in::text || ' 15:00:00-03')::timestamptz - now()) < make_interval(hours=>target.minimum_lead_hours)
  then raise exception 'experience_lead_time'; end if;

  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.* into current_item
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status in ('pending','active')
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_item.product_id=target.id then raise exception 'experience_already_added'; end if;

    select * into current_product from public.experience_products where id=current_item.product_id;

    select p.id into next_product_id
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_product.price_cents
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_product_id is null
       or next_product_id<>target.id
       or target.upsell_enabled is not true
    then raise exception 'experience_upgrade_not_available'; end if;

    v_charge := greatest(0,v.price_cents-current_item.unit_price_cents);
    if v_charge<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode := 'upgraded';
  else
    v_charge := v.price_cents;
  end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status in ('pending','active')
      and rr.status in ('confirmed','pending_payment')
      and rr.check_in=r.check_in;
    if v_count>=target.daily_capacity then raise exception 'experience_capacity_reached'; end if;
  end if;

  if v_mode='upgraded' then
    update public.experience_order_items set status='upgraded' where id=current_item.id;
  end if;

  insert into public.experience_orders(reservation_id,user_id,status)
  values(r.id,p_user_id,'active')
  returning id into v_order_id;

  insert into public.experience_order_items(
    order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,
    unit_price_cents,quantity,status
  ) values(
    v_order_id,target.id,v.id,target.name,
    case when v.code='package' then null else v.name end,
    v.price_cents,1,'active'
  )
  returning id into v_item_id;

  insert into public.payments(
    reservation_id,user_id,provider,method,amount_cents,status,idempotency_key,metadata
  ) values(
    r.id,p_user_id,'mock','mock',v_charge,'paid',
    case when v_mode='upgraded' then 'postupgrade-' else 'postexp-' end || v_item_id::text,
    jsonb_build_object(
      'development',true,'kind',
      case when v_mode='upgraded' then 'post_booking_experience_upgrade' else 'post_booking_experience' end,
      'experience_order_id',v_order_id,'experience_order_item_id',v_item_id,
      'upgraded_from_item_id',case when v_mode='upgraded' then current_item.id else null end
    )
  )
  returning id into v_payment_id;

  insert into public.financial_entries(
    reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,description
  ) values(
    r.id,v_payment_id,v_item_id,
    case when v_mode='upgraded' then 'upgrade' else 'experience' end,
    v_charge,
    case when v_mode='upgraded'
      then 'Upgrade para '||target.name
      else target.name
    end
  );

  v_total:=round((coalesce(r.total_amount,0)+v_charge/100.0)::numeric,2);

  update public.reservations
  set experience_amount=round((coalesce(experience_amount,0)+v_charge/100.0)::numeric,2),
      total_amount=v_total,
      updated_at=now()
  where id=r.id;

  return query select v_mode,v_order_id,v_item_id,v_payment_id,v_charge,v_total;
end;
$function$;

revoke all on function public.purchase_or_upgrade_post_booking_experience_mock_atomic(uuid,uuid,uuid) from public;
revoke all on function public.purchase_or_upgrade_post_booking_experience_mock_atomic(uuid,uuid,uuid) from anon;
revoke all on function public.purchase_or_upgrade_post_booking_experience_mock_atomic(uuid,uuid,uuid) from authenticated;
grant execute on function public.purchase_or_upgrade_post_booking_experience_mock_atomic(uuid,uuid,uuid) to service_role;
;

-- Historical: 20260924061709 cancel_pending_payment_mock_atomic

create or replace function public.cancel_pending_payment_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
begin
  select * into p
  from public.payments
  where id=p_payment_id
  for update;

  if not found or p.user_id<>p_user_id then
    raise exception 'not_found';
  end if;

  select * into r
  from public.reservations
  where id=p.reservation_id
  for update;

  if p.status='cancelled' and r.status='cancelled' then
    return query select p.status,r.status,r.id;
    return;
  end if;

  if p.status<>'awaiting_payment' or r.status<>'pending_payment' then
    raise exception 'payment_not_cancellable';
  end if;

  update public.payments
  set status='cancelled',updated_at=now()
  where id=p.id;

  update public.reservations
  set status='cancelled',hold_expires_at=now(),updated_at=now()
  where id=r.id;

  update public.experience_orders
  set status='cancelled',updated_at=now()
  where reservation_id=r.id and status='pending';

  return query select 'cancelled'::text,'cancelled'::text,r.id;
end;
$function$;

revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from public;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from anon;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from authenticated;
grant execute on function public.cancel_pending_payment_mock_atomic(uuid,uuid) to service_role;
;

-- Historical: 20260924061856 fix_cancel_pending_payment_mock_atomic

create or replace function public.cancel_pending_payment_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
begin
  select * into p
  from public.payments
  where id=p_payment_id
  for update;

  if not found or p.user_id<>p_user_id then
    raise exception 'not_found';
  end if;

  select * into r
  from public.reservations
  where id=p.reservation_id
  for update;

  if p.status='cancelled' and r.status='cancelled' then
    return query select p.status,r.status,r.id;
    return;
  end if;

  if p.status<>'awaiting_payment' or r.status<>'pending_payment' then
    raise exception 'payment_not_cancellable';
  end if;

  update public.payments
  set status='cancelled',updated_at=now()
  where id=p.id;

  update public.reservations
  set status='cancelled',hold_expires_at=now(),updated_at=now()
  where id=r.id;

  update public.experience_orders
  set status='cancelled'
  where reservation_id=r.id and status='pending';

  return query select 'cancelled'::text,'cancelled'::text,r.id;
end;
$function$;

revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from public;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from anon;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from authenticated;
grant execute on function public.cancel_pending_payment_mock_atomic(uuid,uuid) to service_role;
;

-- Historical: 20260924103832 post_booking_charge_foundation

alter table public.payment_settings
  add column if not exists modification_payment_deadline_hours integer not null default 24
    check (modification_payment_deadline_hours between 1 and 168),
  add column if not exists post_booking_payment_minutes integer not null default 15
    check (post_booking_payment_minutes between 5 and 1440);

alter table public.modification_requests
  add column if not exists payment_charge_id uuid,
  add column if not exists payment_due_at timestamptz;

alter table public.modification_requests
  drop constraint if exists modification_requests_status_check;

alter table public.modification_requests
  add constraint modification_requests_status_check
  check (status = any(array[
    'requested'::text,'quoted'::text,'awaiting_guest_acceptance'::text,'awaiting_payment'::text,
    'accepted'::text,'rejected'::text,'applied'::text,'cancelled'::text,'payment_expired'::text
  ]));

create table if not exists public.post_booking_charges(
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('experience_add','experience_upgrade','modification')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','processing','paid','applied','cancelled','expired')),
  amount_cents bigint not null check (amount_cents >= 0),
  payment_id uuid references public.payments(id) on delete set null,
  modification_request_id uuid references public.modification_requests(id) on delete cascade,
  target_variant_id uuid references public.experience_variants(id),
  source_experience_item_id uuid references public.experience_order_items(id),
  target_property_id bigint references public.properties(id),
  target_check_in date,
  target_check_out date,
  description text,
  snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modification_requests
  drop constraint if exists modification_requests_payment_charge_id_fkey;
alter table public.modification_requests
  add constraint modification_requests_payment_charge_id_fkey
  foreign key (payment_charge_id) references public.post_booking_charges(id) on delete set null;

create index if not exists idx_post_booking_charges_user on public.post_booking_charges(user_id,created_at desc);
create index if not exists idx_post_booking_charges_reservation on public.post_booking_charges(reservation_id,created_at desc);
create index if not exists idx_post_booking_charges_deadline on public.post_booking_charges(status,expires_at);

drop index if exists public.one_open_modification_per_reservation;
create unique index one_open_modification_per_reservation
on public.modification_requests(reservation_id)
where status in ('requested','quoted','awaiting_guest_acceptance','awaiting_payment','accepted');

create unique index if not exists one_active_charge_per_modification
on public.post_booking_charges(modification_request_id)
where modification_request_id is not null
  and status in ('awaiting_payment','processing','paid');

alter table public.post_booking_charges enable row level security;
drop policy if exists guest_reads_own_post_booking_charges on public.post_booking_charges;
create policy guest_reads_own_post_booking_charges
on public.post_booking_charges
for select
to authenticated
using (user_id=auth.uid());

create table if not exists public.notification_outbox(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete cascade,
  modification_request_id uuid references public.modification_requests(id) on delete cascade,
  charge_id uuid references public.post_booking_charges(id) on delete cascade,
  channel text not null default 'email' check (channel='email'),
  template_code text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  send_after timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.notification_outbox enable row level security;

create index if not exists idx_notification_outbox_queue
on public.notification_outbox(status,send_after);

alter table public.post_booking_charges
  drop constraint if exists post_booking_modification_dates_check;
alter table public.post_booking_charges
  add constraint post_booking_modification_dates_check check (
    kind <> 'modification'
    or (
      target_property_id is not null
      and target_check_in is not null
      and target_check_out is not null
      and target_check_out > target_check_in
    )
  );

alter table public.post_booking_charges
  drop constraint if exists post_booking_experience_target_check;
alter table public.post_booking_charges
  add constraint post_booking_experience_target_check check (
    kind = 'modification' or target_variant_id is not null
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='post_booking_modification_hold_no_overlap'
      and conrelid='public.post_booking_charges'::regclass
  ) then
    alter table public.post_booking_charges
      add constraint post_booking_modification_hold_no_overlap
      exclude using gist (
        target_property_id with =,
        daterange(target_check_in,target_check_out,'[)') with &&
      )
      where (
        kind='modification'
        and status in ('awaiting_payment','processing','paid')
      );
  end if;
end $$;
;

-- Historical: 20260924104032 post_booking_charge_creation

create or replace function public.start_payment_hold(
  p_quote_id uuid,
  p_quote_option_id uuid,
  p_user_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guests integer
)
returns table(reservation_id uuid, confirmation_code text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  q public.quotes%rowtype;
  o public.quote_options%rowtype;
  v_id uuid;
  v_code text;
  v_expires timestamptz;
  v_experience numeric(12,2);
  v_stay numeric(12,2);
begin
  perform public.expire_stale_reservations();

  select * into q
  from public.quotes
  where id=p_quote_id and status='active' and expires_at>now()
  for update;
  if not found then raise exception 'quote_expired'; end if;

  select * into o
  from public.quote_options
  where id=p_quote_option_id and quote_id=q.id;
  if not found then raise exception 'invalid_quote_option'; end if;

  perform 1 from public.properties where id=q.property_id for update;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.kind='modification'
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.target_property_id=q.property_id
      and daterange(c.target_check_in,c.target_check_out,'[)') && daterange(q.check_in,q.check_out,'[)')
  ) then
    raise exception 'dates_unavailable';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_expires := now() + interval '15 minutes';
  v_experience := greatest(0,(o.total_amount_cents-o.accommodation_amount_cents-o.cleaning_fee_cents)/100.0);
  v_stay := (o.accommodation_amount_cents+o.cleaning_fee_cents)/100.0;

  insert into public.reservations(
    property_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,
    accommodation_amount,cleaning_fee,stay_amount,experience_amount,total_amount,
    hold_expires_at,user_id,quote_id,quote_option_id,rate_plan_code,confirmation_code
  )
  select q.property_id,q.check_in,q.check_out,'pending_payment','direct',p_guests,p_guest_name,p_guest_email,p_guest_phone,
    o.accommodation_amount_cents/100.0,o.cleaning_fee_cents/100.0,v_stay,v_experience,o.total_amount_cents/100.0,
    v_expires,p_user_id,q.id,o.id,rp.code,v_code
  from public.rate_plans rp where rp.id=o.rate_plan_id
  returning id into v_id;

  update public.quotes set status='consumed' where id=q.id;

  return query select v_id,v_code,v_expires;
exception
  when exclusion_violation then
    raise exception 'dates_unavailable';
end;
$function$;

create or replace function public.create_modification_charge_atomic(
  p_request_id uuid,
  p_admin_id uuid,
  p_amount_cents bigint,
  p_deadline_hours integer,
  p_admin_note text default null
)
returns table(
  charge_id uuid,
  amount_cents bigint,
  expires_at timestamptz,
  reminder_at timestamptz
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  m public.modification_requests%rowtype;
  r public.reservations%rowtype;
  v_property_id bigint;
  v_check_in date;
  v_check_out date;
  v_checkin_at timestamptz;
  v_deadline timestamptz;
  v_reminder timestamptz;
  v_charge_id uuid;
  v_amount bigint;
begin
  select * into m
  from public.modification_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'modification_not_found'; end if;
  if m.status not in ('requested','quoted') then raise exception 'modification_not_approvable'; end if;

  select * into r
  from public.reservations
  where id=m.reservation_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_changeable'; end if;

  v_property_id:=coalesce(m.requested_property_id,r.property_id);
  v_check_in:=coalesce(m.requested_check_in,r.check_in);
  v_check_out:=coalesce(m.requested_check_out,r.check_out);
  if v_check_out<=v_check_in then raise exception 'invalid_dates'; end if;

  v_checkin_at:=make_timestamptz(
    extract(year from v_check_in)::int,
    extract(month from v_check_in)::int,
    extract(day from v_check_in)::int,
    15,0,0,'America/Sao_Paulo'
  );
  v_deadline:=least(
    now()+make_interval(hours=>greatest(1,coalesce(p_deadline_hours,24))),
    v_checkin_at
  );
  if v_deadline<=now() then raise exception 'modification_payment_deadline_passed'; end if;
  v_reminder:=now()+((v_deadline-now())*0.5);
  v_amount:=greatest(0,coalesce(p_amount_cents,0));

  perform 1 from public.properties where id=v_property_id for update;
  perform public.expire_stale_reservations();

  if exists (
    select 1
    from public.reservations x
    where x.property_id=v_property_id
      and x.id<>r.id
      and (
        x.status='confirmed'
        or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
      )
      and daterange(x.check_in,x.check_out,'[)') && daterange(v_check_in,v_check_out,'[)')
  ) then
    raise exception 'dates_unavailable';
  end if;

  begin
    insert into public.post_booking_charges(
      reservation_id,user_id,kind,status,amount_cents,modification_request_id,
      target_property_id,target_check_in,target_check_out,description,snapshot,
      expires_at,reminder_at
    ) values(
      r.id,m.user_id,'modification','awaiting_payment',v_amount,m.id,
      v_property_id,v_check_in,v_check_out,'Revisão de tarifa da alteração',
      jsonb_build_object(
        'original_property_id',r.property_id,
        'original_check_in',r.check_in,
        'original_check_out',r.check_out,
        'requested_property_id',v_property_id,
        'requested_check_in',v_check_in,
        'requested_check_out',v_check_out
      ),
      v_deadline,v_reminder
    )
    returning id into v_charge_id;
  exception when exclusion_violation then
    raise exception 'dates_unavailable';
  end;

  update public.modification_requests
  set status='awaiting_payment',
      admin_additional_amount_cents=v_amount,
      admin_note=p_admin_note,
      decided_at=now(),
      payment_charge_id=v_charge_id,
      payment_due_at=v_deadline,
      updated_at=now()
  where id=m.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values(
    r.id,m.id,'approved_payment_required',to_jsonb(r),
    jsonb_build_object(
      'property_id',v_property_id,
      'check_in',v_check_in,
      'check_out',v_check_out,
      'payment_due_at',v_deadline
    ),
    v_amount,p_admin_id
  );

  insert into public.notification_outbox(
    user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
  ) values(
    m.user_id,r.id,m.id,v_charge_id,'modification_payment_required',now(),
    jsonb_build_object(
      'amount_cents',v_amount,
      'payment_due_at',v_deadline,
      'requested_check_in',v_check_in,
      'requested_check_out',v_check_out,
      'action_path','/conta.html?charge='||v_charge_id::text
    ),
    'mod-payment-required-'||m.id::text
  )
  on conflict (dedupe_key) do nothing;

  return query select v_charge_id,v_amount,v_deadline,v_reminder;
end;
$function$;

create or replace function public.create_experience_charge_atomic(
  p_reservation_id uuid,
  p_user_id uuid,
  p_variant_id uuid,
  p_expires_minutes integer
)
returns table(
  charge_id uuid,
  purchase_mode text,
  amount_cents bigint,
  description text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_deadline timestamptz;
  v_available_until timestamptz;
  v_charge_id uuid;
  v_capacity_count integer;
  v_pending_count integer;
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target
  from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(
    extract(year from r.check_in)::int,
    extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,
    15,0,0,'America/Sao_Paulo'
  )-make_interval(hours=>target.minimum_lead_hours);

  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id as item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
         cp.name as current_name,cp.price_cents as current_product_price
  into current_rec
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status='active'
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;

    select p.id as product_id,p.name,p.price_cents,p.upsell_enabled
    into next_rec
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_rec.product_id is null
       or next_rec.product_id<>target.id
       or next_rec.upsell_enabled is not true
    then raise exception 'experience_upgrade_not_available'; end if;

    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.reservation_id=r.id
      and c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'package_type'=target.package_type
  ) then raise exception 'experience_payment_already_pending'; end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_capacity_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status='active'
      and rr.status='confirmed'
      and rr.check_in=r.check_in;

    select count(*)::int into v_pending_count
    from public.post_booking_charges c
    join public.reservations rr on rr.id=c.reservation_id
    where c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'target_product_id'=target.id::text
      and rr.check_in=r.check_in;

    if coalesce(v_capacity_count,0)+coalesce(v_pending_count,0)>=target.daily_capacity
    then raise exception 'experience_capacity_reached'; end if;
  end if;

  v_deadline:=least(
    now()+make_interval(mins=>greatest(5,coalesce(p_expires_minutes,15))),
    v_available_until
  );
  if v_deadline<=now() then raise exception 'experience_lead_time'; end if;

  insert into public.post_booking_charges(
    reservation_id,user_id,kind,status,amount_cents,target_variant_id,source_experience_item_id,
    description,snapshot,expires_at
  ) values(
    r.id,p_user_id,
    case when v_mode='upgrade' then 'experience_upgrade' else 'experience_add' end,
    'awaiting_payment',v_amount,v.id,
    case when v_mode='upgrade' then current_rec.item_id else null end,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    jsonb_build_object(
      'purchase_mode',v_mode,
      'package_type',target.package_type,
      'target_product_id',target.id,
      'target_variant_id',v.id,
      'target_name',target.name,
      'target_price_cents',target.price_cents,
      'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
      'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
      'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
      'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end
    ),
    v_deadline
  )
  returning id into v_charge_id;

  return query select
    v_charge_id,
    v_mode,
    v_amount,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    v_deadline;
end;
$function$;

create or replace function public.start_post_booking_payment_atomic(
  p_charge_id uuid,
  p_user_id uuid,
  p_provider text,
  p_method text,
  p_installments integer
)
returns table(
  payment_id uuid,
  payment_status text,
  amount_cents bigint,
  charge_status text,
  charge_expires_at timestamptz
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  c public.post_booking_charges%rowtype;
  p public.payments%rowtype;
  v_payment_id uuid;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;

  if not found then raise exception 'charge_not_found'; end if;
  if c.status='applied' then raise exception 'charge_already_applied'; end if;
  if c.status in ('cancelled','expired') or c.expires_at<=now() then raise exception 'charge_expired'; end if;
  if c.amount_cents<=0 then raise exception 'payment_not_required'; end if;

  if c.payment_id is not null then
    select * into p from public.payments where id=c.payment_id for update;
    if found and p.status in ('awaiting_payment','under_review','processing') then
      return query select p.id,p.status,p.amount_cents,c.status,c.expires_at;
      return;
    end if;
    if found and p.status='paid' then
      return query select p.id,p.status,p.amount_cents,c.status,c.expires_at;
      return;
    end if;
  end if;

  insert into public.payments(
    reservation_id,user_id,provider,method,installments,amount_cents,status,idempotency_key,metadata
  ) values(
    c.reservation_id,p_user_id,p_provider,p_method,
    case when p_method='card' then greatest(1,coalesce(p_installments,1)) else null end,
    c.amount_cents,'awaiting_payment',
    'postcharge-'||c.id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
    jsonb_build_object(
      'development',p_provider='mock',
      'kind','post_booking_charge',
      'post_booking_charge_id',c.id,
      'charge_kind',c.kind
    )
  )
  returning id into v_payment_id;

  update public.post_booking_charges
  set payment_id=v_payment_id,status='processing',updated_at=now()
  where id=c.id;

  return query select v_payment_id,'awaiting_payment'::text,c.amount_cents,'processing'::text,c.expires_at;
end;
$function$;

revoke all on function public.create_modification_charge_atomic(uuid,uuid,bigint,integer,text) from public,anon,authenticated;
revoke all on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.start_post_booking_payment_atomic(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.create_modification_charge_atomic(uuid,uuid,bigint,integer,text) to service_role;
grant execute on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.start_post_booking_payment_atomic(uuid,uuid,text,text,integer) to service_role;
;

-- Historical: 20260924104204 post_booking_charge_finalization

create or replace function public.finalize_post_booking_charge_atomic(
  p_payment_id uuid,
  p_user_id uuid
)
returns table(
  result_charge_id uuid,
  result_kind text,
  result_status text,
  result_amount_cents bigint,
  result_total_amount numeric
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  c public.post_booking_charges%rowtype;
  r public.reservations%rowtype;
  m public.modification_requests%rowtype;
  v_total numeric(12,2);
  v_order_id uuid;
  v_item_id uuid;
  v_target_product uuid;
  v_target_variant uuid;
  v_source_item uuid;
  v_target_name text;
  v_package_type text;
  v_mode text;
  v_target_price bigint;
  v_existing_same_type integer;
begin
  select * into p
  from public.payments
  where id=p_payment_id and user_id=p_user_id
  for update;
  if not found then raise exception 'payment_not_found'; end if;

  select * into c
  from public.post_booking_charges
  where payment_id=p.id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if c.status='applied' and p.status='paid' then
    select total_amount into v_total from public.reservations where id=c.reservation_id;
    return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
    return;
  end if;

  if c.status in ('cancelled','expired') or c.expires_at<=now() then
    raise exception 'charge_expired';
  end if;

  if p.status not in ('awaiting_payment','under_review','processing') then
    raise exception 'payment_state_final';
  end if;

  select * into r
  from public.reservations
  where id=c.reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  if c.kind='modification' then
    select * into m
    from public.modification_requests
    where id=c.modification_request_id
    for update;
    if not found or m.status<>'awaiting_payment' then raise exception 'modification_not_payable'; end if;

    perform 1 from public.properties where id=c.target_property_id for update;
    perform public.expire_stale_reservations();

    if exists (
      select 1
      from public.reservations x
      where x.property_id=c.target_property_id
        and x.id<>r.id
        and (
          x.status='confirmed'
          or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
        )
        and daterange(x.check_in,x.check_out,'[)') && daterange(c.target_check_in,c.target_check_out,'[)')
    ) then raise exception 'dates_unavailable'; end if;

    update public.payments set status='paid',updated_at=now() where id=p.id;

    v_total:=round((coalesce(r.total_amount,0)+c.amount_cents/100.0)::numeric,2);
    begin
      update public.reservations
      set property_id=c.target_property_id,
          check_in=c.target_check_in,
          check_out=c.target_check_out,
          total_amount=v_total,
          updated_at=now()
      where id=r.id;
    exception when exclusion_violation then
      raise exception 'dates_unavailable';
    end;

    if c.amount_cents>0 then
      insert into public.financial_entries(
        reservation_id,payment_id,entry_type,amount_cents,description
      ) values(
        r.id,p.id,'additional_charge',c.amount_cents,'Revisão de tarifa da alteração'
      );
    end if;

    update public.modification_requests
    set status='applied',
        guest_accepted_at=coalesce(guest_accepted_at,now()),
        applied_at=now(),
        updated_at=now()
    where id=m.id;

    update public.post_booking_charges
    set status='applied',applied_at=now(),updated_at=now()
    where id=c.id;

    insert into public.reservation_change_events(
      reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
    ) values(
      r.id,m.id,'paid_and_applied',to_jsonb(r),
      jsonb_build_object(
        'property_id',c.target_property_id,
        'check_in',c.target_check_in,
        'check_out',c.target_check_out,
        'total_amount',v_total
      ),
      c.amount_cents,p_user_id
    );

    update public.notification_outbox
    set status='cancelled'
    where charge_id=c.id and status='queued' and template_code='modification_payment_reminder';

    return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
    return;
  end if;

  v_target_product:=(c.snapshot->>'target_product_id')::uuid;
  v_target_variant:=c.target_variant_id;
  v_source_item:=nullif(c.snapshot->>'source_item_id','')::uuid;
  v_target_name:=c.snapshot->>'target_name';
  v_package_type:=c.snapshot->>'package_type';
  v_mode:=c.snapshot->>'purchase_mode';
  v_target_price:=coalesce((c.snapshot->>'target_price_cents')::bigint,c.amount_cents);

  if v_mode='upgrade' then
    if v_source_item is null then raise exception 'experience_upgrade_not_available'; end if;
    perform 1 from public.experience_order_items
      where id=v_source_item and status='active'
      for update;
    if not found then raise exception 'experience_upgrade_not_available'; end if;
  else
    select count(*)::int into v_existing_same_type
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.experience_products ep on ep.id=i.product_id
    where o.reservation_id=r.id
      and o.status='active'
      and i.status='active'
      and ep.package_type=v_package_type;
    if v_existing_same_type>0 then raise exception 'experience_category_conflict'; end if;
  end if;

  update public.payments set status='paid',updated_at=now() where id=p.id;

  if v_mode='upgrade' then
    update public.experience_order_items set status='upgraded' where id=v_source_item;
  end if;

  insert into public.experience_orders(reservation_id,user_id,status)
  values(r.id,p_user_id,'active')
  returning id into v_order_id;

  insert into public.experience_order_items(
    order_id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,
    unit_price_cents,quantity,status
  ) values(
    v_order_id,v_target_product,v_target_variant,v_target_name,null,
    v_target_price,1,'active'
  )
  returning id into v_item_id;

  insert into public.financial_entries(
    reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,description
  ) values(
    r.id,p.id,v_item_id,
    case when v_mode='upgrade' then 'upgrade' else 'experience' end,
    c.amount_cents,c.description
  );

  v_total:=round((coalesce(r.total_amount,0)+c.amount_cents/100.0)::numeric,2);
  update public.reservations
  set experience_amount=round((coalesce(experience_amount,0)+c.amount_cents/100.0)::numeric,2),
      total_amount=v_total,
      updated_at=now()
  where id=r.id;

  update public.post_booking_charges
  set status='applied',applied_at=now(),updated_at=now()
  where id=c.id;

  return query select c.id,c.kind,'applied'::text,c.amount_cents,v_total;
end;
$function$;

create or replace function public.confirm_free_post_booking_charge_atomic(
  p_charge_id uuid,
  p_user_id uuid
)
returns table(
  result_charge_id uuid,
  result_status text,
  result_total_amount numeric
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  c public.post_booking_charges%rowtype;
  r public.reservations%rowtype;
  m public.modification_requests%rowtype;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;
  if c.kind<>'modification' or c.amount_cents<>0 then raise exception 'payment_required'; end if;
  if c.status='applied' then
    select total_amount into result_total_amount from public.reservations where id=c.reservation_id;
    return query select c.id,'applied'::text,result_total_amount;
    return;
  end if;
  if c.status in ('cancelled','expired') or c.expires_at<=now() then raise exception 'charge_expired'; end if;

  select * into r from public.reservations
  where id=c.reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into m from public.modification_requests
  where id=c.modification_request_id
  for update;
  if not found or m.status<>'awaiting_payment' then raise exception 'modification_not_payable'; end if;

  perform 1 from public.properties where id=c.target_property_id for update;
  perform public.expire_stale_reservations();

  if exists (
    select 1 from public.reservations x
    where x.property_id=c.target_property_id
      and x.id<>r.id
      and (
        x.status='confirmed'
        or (x.status='pending_payment' and (x.hold_expires_at is null or x.hold_expires_at>now()))
      )
      and daterange(x.check_in,x.check_out,'[)') && daterange(c.target_check_in,c.target_check_out,'[)')
  ) then raise exception 'dates_unavailable'; end if;

  begin
    update public.reservations
    set property_id=c.target_property_id,
        check_in=c.target_check_in,
        check_out=c.target_check_out,
        updated_at=now()
    where id=r.id;
  exception when exclusion_violation then
    raise exception 'dates_unavailable';
  end;

  update public.modification_requests
  set status='applied',guest_accepted_at=now(),applied_at=now(),updated_at=now()
  where id=m.id;

  update public.post_booking_charges
  set status='applied',applied_at=now(),updated_at=now()
  where id=c.id;

  insert into public.reservation_change_events(
    reservation_id,modification_request_id,event_type,before_snapshot,after_snapshot,amount_cents,actor_user_id
  ) values(
    r.id,m.id,'confirmed_without_charge',to_jsonb(r),
    jsonb_build_object('property_id',c.target_property_id,'check_in',c.target_check_in,'check_out',c.target_check_out),
    0,p_user_id
  );

  update public.notification_outbox
  set status='cancelled'
  where charge_id=c.id and status='queued' and template_code='modification_payment_reminder';

  return query select c.id,'applied'::text,r.total_amount;
end;
$function$;

create or replace function public.update_post_booking_payment_state_atomic(
  p_payment_id uuid,
  p_user_id uuid,
  p_outcome text
)
returns table(
  result_payment_status text,
  result_charge_status text,
  result_charge_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  c public.post_booking_charges%rowtype;
begin
  select * into p
  from public.payments
  where id=p_payment_id and user_id=p_user_id
  for update;
  if not found then raise exception 'payment_not_found'; end if;

  select * into c
  from public.post_booking_charges
  where payment_id=p.id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if p.status='paid' or c.status='applied' then raise exception 'payment_state_final'; end if;
  if p_outcome not in ('under_review','refused','expired') then raise exception 'invalid_outcome'; end if;

  if p_outcome='under_review' then
    update public.payments set status='under_review',updated_at=now() where id=p.id;
    update public.post_booking_charges set status='processing',updated_at=now() where id=c.id;
    return query select 'under_review'::text,'processing'::text,c.id;
    return;
  end if;

  update public.payments
  set status=case when p_outcome='refused' then 'refused' else 'expired' end,
      updated_at=now()
  where id=p.id;

  if c.expires_at<=now() then
    update public.post_booking_charges
    set status='expired',updated_at=now()
    where id=c.id;

    if c.kind='modification' then
      update public.modification_requests
      set status='payment_expired',updated_at=now()
      where id=c.modification_request_id and status='awaiting_payment';

      insert into public.notification_outbox(
        user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
      ) values(
        c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_cancelled_unpaid',now(),
        jsonb_build_object('amount_cents',c.amount_cents,'expired_at',now()),
        'mod-unpaid-cancelled-'||c.modification_request_id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;

    return query select
      case when p_outcome='refused' then 'refused' else 'expired' end,
      'expired'::text,c.id;
    return;
  end if;

  update public.post_booking_charges
  set status='awaiting_payment',payment_id=null,updated_at=now()
  where id=c.id;

  return query select
    case when p_outcome='refused' then 'refused' else 'expired' end,
    'awaiting_payment'::text,c.id;
end;
$function$;

create or replace function public.cancel_post_booking_charge_atomic(
  p_charge_id uuid,
  p_user_id uuid
)
returns table(
  result_charge_status text,
  result_modification_status text
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  c public.post_booking_charges%rowtype;
  p public.payments%rowtype;
  v_mod_status text;
begin
  select * into c
  from public.post_booking_charges
  where id=p_charge_id and user_id=p_user_id
  for update;
  if not found then raise exception 'charge_not_found'; end if;

  if c.status='applied' then raise exception 'charge_already_applied'; end if;
  if c.status in ('cancelled','expired') then
    if c.modification_request_id is not null then
      select status into v_mod_status from public.modification_requests where id=c.modification_request_id;
    end if;
    return query select c.status,v_mod_status;
    return;
  end if;

  if c.payment_id is not null then
    select * into p from public.payments where id=c.payment_id for update;
    if found and p.status='under_review' then raise exception 'payment_processing'; end if;
    if found and p.status='paid' then raise exception 'charge_already_paid'; end if;
    if found and p.status in ('awaiting_payment','processing') then
      update public.payments set status='cancelled',updated_at=now() where id=p.id;
    end if;
  end if;

  update public.post_booking_charges
  set status='cancelled',updated_at=now()
  where id=c.id;

  if c.kind='modification' then
    update public.modification_requests
    set status='cancelled',updated_at=now()
    where id=c.modification_request_id and status='awaiting_payment'
    returning status into v_mod_status;

    insert into public.reservation_change_events(
      reservation_id,modification_request_id,event_type,amount_cents,actor_user_id
    ) values(c.reservation_id,c.modification_request_id,'cancelled_before_payment',c.amount_cents,p_user_id);
  end if;

  return query select 'cancelled'::text,v_mod_status;
end;
$function$;

create or replace function public.process_post_booking_deadlines()
returns integer
language plpgsql
security definer
set search_path='public'
as $function$
declare
  c public.post_booking_charges%rowtype;
  v_count integer:=0;
begin
  for c in
    select * from public.post_booking_charges
    where kind='modification'
      and status in ('awaiting_payment','processing')
      and reminder_at is not null
      and reminder_at<=now()
      and reminder_sent_at is null
      and expires_at>now()
    for update skip locked
  loop
    insert into public.notification_outbox(
      user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
    ) values(
      c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_payment_reminder',now(),
      jsonb_build_object(
        'amount_cents',c.amount_cents,
        'payment_due_at',c.expires_at,
        'action_path','/conta.html?charge='||c.id::text
      ),
      'mod-payment-reminder-'||c.modification_request_id::text
    )
    on conflict (dedupe_key) do nothing;

    update public.post_booking_charges
    set reminder_sent_at=now(),updated_at=now()
    where id=c.id;
  end loop;

  for c in
    select * from public.post_booking_charges
    where status in ('awaiting_payment','processing')
      and expires_at<=now()
    for update skip locked
  loop
    if c.payment_id is not null then
      update public.payments
      set status='expired',updated_at=now()
      where id=c.payment_id and status in ('awaiting_payment','under_review','processing');
    end if;

    update public.post_booking_charges
    set status='expired',updated_at=now()
    where id=c.id;

    if c.kind='modification' then
      update public.modification_requests
      set status='payment_expired',updated_at=now()
      where id=c.modification_request_id and status='awaiting_payment';

      insert into public.notification_outbox(
        user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key
      ) values(
        c.user_id,c.reservation_id,c.modification_request_id,c.id,'modification_cancelled_unpaid',now(),
        jsonb_build_object('amount_cents',c.amount_cents,'expired_at',now()),
        'mod-unpaid-cancelled-'||c.modification_request_id::text
      )
      on conflict (dedupe_key) do nothing;

      insert into public.reservation_change_events(
        reservation_id,modification_request_id,event_type,amount_cents
      ) values(c.reservation_id,c.modification_request_id,'payment_expired',c.amount_cents);
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.finalize_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_free_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_post_booking_payment_state_atomic(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_post_booking_charge_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_post_booking_deadlines() from public,anon,authenticated;

grant execute on function public.finalize_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.confirm_free_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.update_post_booking_payment_state_atomic(uuid,uuid,text) to service_role;
grant execute on function public.cancel_post_booking_charge_atomic(uuid,uuid) to service_role;
grant execute on function public.process_post_booking_deadlines() to service_role;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='process-post-booking-deadlines' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'process-post-booking-deadlines',
    '*/5 * * * *',
    'select public.process_post_booking_deadlines();'
  );
end $$;
;

-- Historical: 20260924104335 extend_reservation_change_event_types

alter table public.reservation_change_events
  drop constraint if exists reservation_change_events_event_type_check;

alter table public.reservation_change_events
  add constraint reservation_change_events_event_type_check
  check (event_type = any(array[
    'requested'::text,
    'quoted'::text,
    'admin_decision'::text,
    'guest_accepted'::text,
    'additional_payment'::text,
    'applied'::text,
    'rejected'::text,
    'cancelled'::text,
    'approved_payment_required'::text,
    'paid_and_applied'::text,
    'confirmed_without_charge'::text,
    'cancelled_before_payment'::text,
    'payment_expired'::text
  ]));;

-- Historical: 20260924110407 post_booking_charge_performance_hardening

create index if not exists modification_requests_payment_charge_idx
  on public.modification_requests(payment_charge_id);

create index if not exists notification_outbox_user_idx
  on public.notification_outbox(user_id);
create index if not exists notification_outbox_reservation_idx
  on public.notification_outbox(reservation_id);
create index if not exists notification_outbox_modification_idx
  on public.notification_outbox(modification_request_id);
create index if not exists notification_outbox_charge_idx
  on public.notification_outbox(charge_id);

create index if not exists post_booking_charges_payment_idx
  on public.post_booking_charges(payment_id);
create index if not exists post_booking_charges_target_variant_idx
  on public.post_booking_charges(target_variant_id);
create index if not exists post_booking_charges_source_item_idx
  on public.post_booking_charges(source_experience_item_id);

drop policy if exists guest_reads_own_post_booking_charges on public.post_booking_charges;
create policy guest_reads_own_post_booking_charges
on public.post_booking_charges
for select
to authenticated
using (user_id=(select auth.uid()));
;

-- Historical: 20260924202443 upsell_source_package_semantics
CREATE OR REPLACE FUNCTION public.create_experience_charge_atomic(p_reservation_id uuid, p_user_id uuid, p_variant_id uuid, p_expires_minutes integer)
 RETURNS TABLE(charge_id uuid, purchase_mode text, amount_cents bigint, description text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_deadline timestamptz;
  v_available_until timestamptz;
  v_charge_id uuid;
  v_capacity_count integer;
  v_pending_count integer;
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target
  from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(
    extract(year from r.check_in)::int,
    extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,
    15,0,0,'America/Sao_Paulo'
  )-make_interval(hours=>target.minimum_lead_hours);

  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id as item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
         cp.name as current_name,cp.price_cents as current_product_price,cp.upsell_enabled as source_upsell_enabled
  into current_rec
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status='active'
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;

    if current_rec.source_upsell_enabled is not true then
      raise exception 'experience_upgrade_not_available';
    end if;

    select p.id as product_id,p.name,p.price_cents
    into next_rec
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_rec.product_id is null
       or next_rec.product_id<>target.id
    then raise exception 'experience_upgrade_not_available'; end if;

    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.reservation_id=r.id
      and c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'package_type'=target.package_type
  ) then raise exception 'experience_payment_already_pending'; end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_capacity_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status='active'
      and rr.status='confirmed'
      and rr.check_in=r.check_in;

    select count(*)::int into v_pending_count
    from public.post_booking_charges c
    join public.reservations rr on rr.id=c.reservation_id
    where c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'target_product_id'=target.id::text
      and rr.check_in=r.check_in;

    if coalesce(v_capacity_count,0)+coalesce(v_pending_count,0)>=target.daily_capacity
    then raise exception 'experience_capacity_reached'; end if;
  end if;

  v_deadline:=least(
    now()+make_interval(mins=>greatest(5,coalesce(p_expires_minutes,15))),
    v_available_until
  );
  if v_deadline<=now() then raise exception 'experience_lead_time'; end if;

  insert into public.post_booking_charges(
    reservation_id,user_id,kind,status,amount_cents,target_variant_id,source_experience_item_id,
    description,snapshot,expires_at
  ) values(
    r.id,p_user_id,
    case when v_mode='upgrade' then 'experience_upgrade' else 'experience_add' end,
    'awaiting_payment',v_amount,v.id,
    case when v_mode='upgrade' then current_rec.item_id else null end,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    jsonb_build_object(
      'purchase_mode',v_mode,
      'package_type',target.package_type,
      'target_product_id',target.id,
      'target_variant_id',v.id,
      'target_name',target.name,
      'target_price_cents',target.price_cents,
      'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
      'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
      'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
      'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end
    ),
    v_deadline
  )
  returning id into v_charge_id;

  return query select
    v_charge_id,
    v_mode,
    v_amount,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    v_deadline;
end;
$function$
;

-- Historical: 20260924233103 post_booking_upgrade_always_to_next_package
CREATE OR REPLACE FUNCTION public.create_experience_charge_atomic(p_reservation_id uuid, p_user_id uuid, p_variant_id uuid, p_expires_minutes integer)
 RETURNS TABLE(charge_id uuid, purchase_mode text, amount_cents bigint, description text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_deadline timestamptz;
  v_available_until timestamptz;
  v_charge_id uuid;
  v_capacity_count integer;
  v_pending_count integer;
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target
  from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(
    extract(year from r.check_in)::int,
    extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,
    15,0,0,'America/Sao_Paulo'
  )-make_interval(hours=>target.minimum_lead_hours);

  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id as item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
         cp.name as current_name,cp.price_cents as current_product_price
  into current_rec
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status='active'
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;

    select p.id as product_id,p.name,p.price_cents
    into next_rec
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_rec.product_id is null
       or next_rec.product_id<>target.id
    then raise exception 'experience_upgrade_not_available'; end if;

    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.reservation_id=r.id
      and c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'package_type'=target.package_type
  ) then raise exception 'experience_payment_already_pending'; end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_capacity_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status='active'
      and rr.status='confirmed'
      and rr.check_in=r.check_in;

    select count(*)::int into v_pending_count
    from public.post_booking_charges c
    join public.reservations rr on rr.id=c.reservation_id
    where c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'target_product_id'=target.id::text
      and rr.check_in=r.check_in;

    if coalesce(v_capacity_count,0)+coalesce(v_pending_count,0)>=target.daily_capacity
    then raise exception 'experience_capacity_reached'; end if;
  end if;

  v_deadline:=least(
    now()+make_interval(mins=>greatest(5,coalesce(p_expires_minutes,15))),
    v_available_until
  );
  if v_deadline<=now() then raise exception 'experience_lead_time'; end if;

  insert into public.post_booking_charges(
    reservation_id,user_id,kind,status,amount_cents,target_variant_id,source_experience_item_id,
    description,snapshot,expires_at
  ) values(
    r.id,p_user_id,
    case when v_mode='upgrade' then 'experience_upgrade' else 'experience_add' end,
    'awaiting_payment',v_amount,v.id,
    case when v_mode='upgrade' then current_rec.item_id else null end,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    jsonb_build_object(
      'purchase_mode',v_mode,
      'package_type',target.package_type,
      'target_product_id',target.id,
      'target_variant_id',v.id,
      'target_name',target.name,
      'target_price_cents',target.price_cents,
      'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
      'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
      'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
      'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end
    ),
    v_deadline
  )
  returning id into v_charge_id;

  return query select
    v_charge_id,
    v_mode,
    v_amount,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    v_deadline;
end;
$function$;
revoke all on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) to service_role;;

-- Historical: 20260925000432 restore_post_booking_source_upsell_semantics
CREATE OR REPLACE FUNCTION public.create_experience_charge_atomic(p_reservation_id uuid, p_user_id uuid, p_variant_id uuid, p_expires_minutes integer)
 RETURNS TABLE(charge_id uuid, purchase_mode text, amount_cents bigint, description text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_deadline timestamptz;
  v_available_until timestamptz;
  v_charge_id uuid;
  v_capacity_count integer;
  v_pending_count integer;
begin
  select * into r
  from public.reservations
  where id=p_reservation_id and user_id=p_user_id
  for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v
  from public.experience_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;

  select * into target
  from public.experience_products
  where id=v.product_id
  for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;

  if not exists (
    select 1 from public.experience_property_eligibility e
    where e.product_id=target.id and e.property_id=r.property_id
  ) then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(
    extract(year from r.check_in)::int,
    extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,
    15,0,0,'America/Sao_Paulo'
  )-make_interval(hours=>target.minimum_lead_hours);

  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id as item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
         cp.name as current_name,cp.price_cents as current_product_price,cp.upsell_enabled as source_upsell_enabled
  into current_rec
  from public.experience_order_items i
  join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id
    and o.status='active'
    and i.status='active'
    and cp.package_type=target.package_type
  order by i.created_at desc
  limit 1
  for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;

    if current_rec.source_upsell_enabled is not true then
      raise exception 'experience_upgrade_not_available';
    end if;

    select p.id as product_id,p.name,p.price_cents
    into next_rec
    from public.experience_products p
    join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type
      and p.status='active'
      and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents asc,p.created_at asc
    limit 1;

    if next_rec.product_id is null
       or next_rec.product_id<>target.id
    then raise exception 'experience_upgrade_not_available'; end if;

    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists (
    select 1
    from public.post_booking_charges c
    where c.reservation_id=r.id
      and c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'package_type'=target.package_type
  ) then raise exception 'experience_payment_already_pending'; end if;

  if target.daily_capacity is not null then
    select count(*)::int into v_capacity_count
    from public.experience_order_items i
    join public.experience_orders o on o.id=i.order_id
    join public.reservations rr on rr.id=o.reservation_id
    where i.product_id=target.id
      and i.status='active'
      and o.status='active'
      and rr.status='confirmed'
      and rr.check_in=r.check_in;

    select count(*)::int into v_pending_count
    from public.post_booking_charges c
    join public.reservations rr on rr.id=c.reservation_id
    where c.kind in ('experience_add','experience_upgrade')
      and c.status in ('awaiting_payment','processing','paid')
      and c.expires_at>now()
      and c.snapshot->>'target_product_id'=target.id::text
      and rr.check_in=r.check_in;

    if coalesce(v_capacity_count,0)+coalesce(v_pending_count,0)>=target.daily_capacity
    then raise exception 'experience_capacity_reached'; end if;
  end if;

  v_deadline:=least(
    now()+make_interval(mins=>greatest(5,coalesce(p_expires_minutes,15))),
    v_available_until
  );
  if v_deadline<=now() then raise exception 'experience_lead_time'; end if;

  insert into public.post_booking_charges(
    reservation_id,user_id,kind,status,amount_cents,target_variant_id,source_experience_item_id,
    description,snapshot,expires_at
  ) values(
    r.id,p_user_id,
    case when v_mode='upgrade' then 'experience_upgrade' else 'experience_add' end,
    'awaiting_payment',v_amount,v.id,
    case when v_mode='upgrade' then current_rec.item_id else null end,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    jsonb_build_object(
      'purchase_mode',v_mode,
      'package_type',target.package_type,
      'target_product_id',target.id,
      'target_variant_id',v.id,
      'target_name',target.name,
      'target_price_cents',target.price_cents,
      'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
      'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
      'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
      'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end
    ),
    v_deadline
  )
  returning id into v_charge_id;

  return query select
    v_charge_id,
    v_mode,
    v_amount,
    case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end,
    v_deadline;
end;
$function$;

revoke all on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_experience_charge_atomic(uuid,uuid,uuid,integer) to service_role;
;

-- Historical: 20260925002100 experience_cart_before_charge
create table if not exists public.post_booking_cart_items(
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_variant_id uuid not null references public.experience_variants(id),
  package_type text not null,
  purchase_mode text not null check (purchase_mode in ('add','upgrade')),
  amount_cents bigint not null check (amount_cents >= 0),
  description text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reservation_id,package_type)
);

create index if not exists post_booking_cart_items_user_idx
  on public.post_booking_cart_items(user_id,created_at desc);
alter table public.post_booking_cart_items enable row level security;
drop policy if exists guest_reads_own_post_booking_cart on public.post_booking_cart_items;
create policy guest_reads_own_post_booking_cart on public.post_booking_cart_items
for select to authenticated using ((select auth.uid())=user_id);
revoke all on table public.post_booking_cart_items from public,anon,authenticated;
grant select on table public.post_booking_cart_items to authenticated;
grant all on table public.post_booking_cart_items to service_role;

create or replace function public.add_experience_cart_item_atomic(
  p_reservation_id uuid,p_user_id uuid,p_variant_id uuid
) returns table(cart_item_id uuid,purchase_mode text,amount_cents bigint,description text)
language plpgsql security definer set search_path=public as $$
declare
  r public.reservations%rowtype;
  v public.experience_variants%rowtype;
  target public.experience_products%rowtype;
  current_rec record;
  next_rec record;
  v_mode text:='add';
  v_amount bigint;
  v_description text;
  v_id uuid;
  v_available_until timestamptz;
begin
  select * into r from public.reservations
    where id=p_reservation_id and user_id=p_user_id for update;
  if not found or r.status<>'confirmed' then raise exception 'reservation_not_available'; end if;

  select * into v from public.experience_variants where id=p_variant_id and active=true;
  if not found then raise exception 'experience_unavailable'; end if;
  select * into target from public.experience_products where id=v.product_id for update;
  if not found or target.status<>'active' then raise exception 'experience_unavailable'; end if;
  if not exists(select 1 from public.experience_property_eligibility e where e.product_id=target.id and e.property_id=r.property_id)
    then raise exception 'experience_unavailable'; end if;

  v_available_until:=make_timestamptz(extract(year from r.check_in)::int,extract(month from r.check_in)::int,
    extract(day from r.check_in)::int,15,0,0,'America/Sao_Paulo')-make_interval(hours=>target.minimum_lead_hours);
  if v_available_until<=now() then raise exception 'experience_lead_time'; end if;
  if target.inventory is not null and target.inventory<=0 then raise exception 'experience_out_of_stock'; end if;

  select i.id item_id,i.product_id,i.product_name_snapshot,i.unit_price_cents,
    cp.name current_name,cp.price_cents current_product_price,cp.upsell_enabled source_upsell_enabled
  into current_rec
  from public.experience_order_items i join public.experience_orders o on o.id=i.order_id
  join public.experience_products cp on cp.id=i.product_id
  where o.reservation_id=r.id and o.status='active' and i.status='active' and cp.package_type=target.package_type
  order by i.created_at desc limit 1 for update of i;

  if found then
    if current_rec.product_id=target.id then raise exception 'experience_already_added'; end if;
    if current_rec.source_upsell_enabled is not true then raise exception 'experience_upgrade_not_available'; end if;
    select p.id product_id,p.name,p.price_cents into next_rec
    from public.experience_products p join public.experience_property_eligibility e on e.product_id=p.id and e.property_id=r.property_id
    where p.package_type=target.package_type and p.status='active' and p.price_cents>current_rec.current_product_price
      and (p.inventory is null or p.inventory>0)
    order by p.price_cents,p.created_at limit 1;
    if next_rec.product_id is null or next_rec.product_id<>target.id then raise exception 'experience_upgrade_not_available'; end if;
    v_amount:=greatest(0,target.price_cents-current_rec.unit_price_cents);
    if v_amount<=0 then raise exception 'experience_upgrade_not_available'; end if;
    v_mode:='upgrade';
  else
    v_amount:=target.price_cents;
  end if;

  if exists(select 1 from public.post_booking_charges c where c.reservation_id=r.id
    and c.kind in ('experience_add','experience_upgrade') and c.status in ('awaiting_payment','processing','paid')
    and c.expires_at>now() and c.snapshot->>'package_type'=target.package_type)
    then raise exception 'experience_payment_already_pending'; end if;

  v_description:=case when v_mode='upgrade' then 'Upgrade para '||target.name else target.name end;
  insert into public.post_booking_cart_items(reservation_id,user_id,target_variant_id,package_type,purchase_mode,amount_cents,description,snapshot)
  values(r.id,p_user_id,v.id,target.package_type,v_mode,v_amount,v_description,jsonb_build_object(
    'purchase_mode',v_mode,'package_type',target.package_type,'target_product_id',target.id,'target_variant_id',v.id,
    'target_name',target.name,'target_price_cents',target.price_cents,
    'source_item_id',case when v_mode='upgrade' then current_rec.item_id else null end,
    'source_product_id',case when v_mode='upgrade' then current_rec.product_id else null end,
    'source_name',case when v_mode='upgrade' then current_rec.current_name else null end,
    'source_price_cents',case when v_mode='upgrade' then current_rec.unit_price_cents else null end))
  on conflict(reservation_id,package_type) do update set
    target_variant_id=excluded.target_variant_id,purchase_mode=excluded.purchase_mode,amount_cents=excluded.amount_cents,
    description=excluded.description,snapshot=excluded.snapshot,updated_at=now()
  returning id into v_id;
  return query select v_id,v_mode,v_amount,v_description;
end $$;

create or replace function public.checkout_experience_cart_item_atomic(
  p_cart_item_id uuid,p_user_id uuid,p_expires_minutes integer
) returns table(charge_id uuid,purchase_mode text,amount_cents bigint,description text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare ci public.post_booking_cart_items%rowtype; result_rec record;
begin
  select * into ci from public.post_booking_cart_items where id=p_cart_item_id and user_id=p_user_id for update;
  if not found then raise exception 'cart_item_not_found'; end if;
  select * into result_rec from public.create_experience_charge_atomic(ci.reservation_id,p_user_id,ci.target_variant_id,p_expires_minutes);
  delete from public.post_booking_cart_items where id=ci.id;
  return query select result_rec.charge_id,result_rec.purchase_mode,result_rec.amount_cents,result_rec.description,result_rec.expires_at;
end $$;

create or replace function public.remove_experience_cart_item_atomic(p_cart_item_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
  delete from public.post_booking_cart_items where id=p_cart_item_id and user_id=p_user_id;
  get diagnostics removed=row_count;
  return removed=1;
end $$;

revoke all on function public.add_experience_cart_item_atomic(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.checkout_experience_cart_item_atomic(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.remove_experience_cart_item_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_experience_cart_item_atomic(uuid,uuid,uuid) to service_role;
grant execute on function public.checkout_experience_cart_item_atomic(uuid,uuid,integer) to service_role;
grant execute on function public.remove_experience_cart_item_atomic(uuid,uuid) to service_role;

-- Charges created merely by opening checkout had no payment attempt. Preserve their audit trail,
-- move the latest choice per reservation/category to the cart, and cancel every premature charge.
insert into public.post_booking_cart_items(reservation_id,user_id,target_variant_id,package_type,purchase_mode,amount_cents,description,snapshot,created_at,updated_at)
select distinct on(c.reservation_id,c.snapshot->>'package_type') c.reservation_id,c.user_id,c.target_variant_id,
  c.snapshot->>'package_type',coalesce(c.snapshot->>'purchase_mode','add'),c.amount_cents,
  coalesce(c.description,c.snapshot->>'target_name','Experiência'),c.snapshot,c.created_at,now()
from public.post_booking_charges c
where c.kind in ('experience_add','experience_upgrade') and c.status='awaiting_payment' and c.payment_id is null
  and c.user_id is not null and c.target_variant_id is not null and c.snapshot->>'package_type' is not null
order by c.reservation_id,c.snapshot->>'package_type',c.created_at desc
on conflict(reservation_id,package_type) do update set target_variant_id=excluded.target_variant_id,
  purchase_mode=excluded.purchase_mode,amount_cents=excluded.amount_cents,description=excluded.description,
  snapshot=excluded.snapshot,updated_at=now();

update public.post_booking_charges set status='cancelled',updated_at=now()
where kind in ('experience_add','experience_upgrade') and status='awaiting_payment' and payment_id is null;
;

-- Historical: 20260925003823 grant_guest_charge_read
-- RLS continues to restrict each guest to their own charges. This grant only
-- exposes SELECT through that policy; all direct mutations remain blocked.
grant select on table public.post_booking_charges to authenticated;
revoke insert,update,delete,truncate,references,trigger on table public.post_booking_charges from authenticated,anon;
;

