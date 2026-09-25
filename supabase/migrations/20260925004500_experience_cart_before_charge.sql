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
