-- Development only. Existing reservations keep their original contracts.
create table public.stay_offers (
 id uuid primary key default gen_random_uuid(), name text not null, description text not null,
 property_ids bigint[] not null, product_ids uuid[] not null,
 min_nights integer not null default 1 check(min_nights between 1 and 365),
 max_nights integer check(max_nights>=min_nights and max_nights<=365),
 start_date date,end_date date,discount_bps integer not null default 500 check(discount_bps between 0 and 10000),
 discount_enabled boolean not null default true,media jsonb not null default '[]',
 status text not null default 'paused' check(status in ('active','paused')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cardinality(property_ids)>0 and cardinality(product_ids)>0),check(end_date is null or start_date is null or end_date>=start_date)
);
alter table public.stay_offers enable row level security;
revoke all on public.stay_offers from anon,authenticated;
grant all on public.stay_offers to service_role;
alter table public.quote_options add column contract_snapshot jsonb;
alter table public.quote_experience_items add column composition_snapshot jsonb;
alter table public.reservations add column contract_snapshot jsonb;
alter table public.experience_order_items add column composition_snapshot jsonb;
alter table public.pms_tasks add column experience_item_id uuid references public.experience_order_items(id) on delete restrict,
 add column service_date date;
drop index public.pms_turnover_per_reservation_idx;
create unique index pms_turnover_per_reservation_idx on public.pms_tasks(reservation_id,task_type) where reservation_id is not null and experience_item_id is null;
create unique index pms_experience_service_unique on public.pms_tasks(experience_item_id,service_date) where experience_item_id is not null;
create schema if not exists stay_internal;
revoke all on schema stay_internal from public,anon,authenticated;

create function stay_internal.contract_on_hold() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare item record; prod record; used integer; offer public.stay_offers%rowtype; prop record;
begin
 if tg_op='UPDATE' then
  if new.contract_snapshot is distinct from old.contract_snapshot then raise exception 'contract_is_immutable'; end if;
  if new.status='confirmed' and (new.property_id<>old.property_id or new.check_in<>old.check_in or new.check_out<>old.check_out) then
   for item in select i.product_id from public.experience_order_items i join public.experience_orders o on o.id=i.order_id where o.reservation_id=new.id and o.status='active' and i.status='active' order by i.product_id loop
    perform 1 from public.experience_products where id=item.product_id for update;
    if stay_internal.sale_issue(item.product_id,new.property_id,new.check_in,new.check_out,new.id,false) is not null then raise exception 'experience_unavailable'; end if;
   end loop;
  end if;
  return new;
 end if;
 select * into prop from public.properties where id=new.property_id;
 if new.quote_option_id is null then return new; end if;
 select contract_snapshot into new.contract_snapshot from public.quote_options where id=new.quote_option_id;
 if new.contract_snapshot->>'offer_id' is not null then
  select * into offer from public.stay_offers where id=(new.contract_snapshot->>'offer_id')::uuid;
  if offer.status<>'active' or not(new.property_id=any(offer.property_ids)) then raise exception 'offer_unavailable'; end if;
 end if;
 -- Lock package rows in a stable order; two concurrent holds cannot oversell.
 for item in select * from public.quote_experience_items where quote_id=new.quote_id order by product_id loop
  select * into prod from public.experience_products where id=item.product_id for update;
  if prod.status<>'active' or not exists(select 1 from public.experience_property_eligibility where product_id=prod.id and property_id=new.property_id)
   or (new.check_in+coalesce(prop.check_in_time,time '15:00')) at time zone coalesce(prop.timezone,'America/Sao_Paulo') < now()+make_interval(hours=>prod.minimum_lead_hours)
   then raise exception 'experience_unavailable'; end if;
  if stay_internal.sale_issue(prod.id,new.property_id,new.check_in,new.check_out,new.id,false) is not null then raise exception 'experience_capacity'; end if;
 end loop;
 return new;
end $$;
create trigger stay_contract_before_hold before insert or update on public.reservations for each row execute function stay_internal.contract_on_hold();

create function stay_internal.sync_preparation(p_reservation uuid) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare r record; prop record; i record; day date; task uuid; labels text[]; component jsonb; label text; start_at timestamptz; wanted uuid[]='{}'; existing record;
begin
 select * into r from public.reservations where id=p_reservation;
 if not found then return; end if;
 select * into prop from public.properties where id=r.property_id;
 if r.status='confirmed' then
  for i in select item.* from public.experience_order_items item join public.experience_orders o on o.id=item.order_id
   where o.reservation_id=r.id and o.status='active' and item.status='active' and item.composition_snapshot is not null loop
   for day in select generate_series(r.check_in::timestamp,r.check_out::timestamp,'1 day')::date loop
    labels='{}';
    for component in select value from jsonb_array_elements(coalesce(i.composition_snapshot->'components','[]')) loop
     if component->>'frequency'='arrival' and day=r.check_in or component->>'frequency'='daily' and day<r.check_out or component->>'frequency'='departure' and day=r.check_out then
      label=((component->>'quantity')::int*coalesce(i.quantity,1))::text||' × '||(component->>'name')||case when component->>'choice' is not null then ' · '||(component->>'choice') else '' end;
      labels=array_append(labels,label);
     end if;
    end loop;
    if cardinality(labels)=0 then continue; end if;
    start_at=(day+case when day=r.check_out then coalesce(prop.check_out_time,time '11:00') else coalesce(prop.check_in_time,time '15:00') end) at time zone coalesce(prop.timezone,'America/Sao_Paulo')-interval '1 hour';
    select * into existing from public.pms_tasks where experience_item_id=i.id and service_date=day;
    if found then
     task=existing.id;
     if existing.property_id<>r.property_id or existing.status='cancelled' or existing.due_at is distinct from start_at then
      insert into public.pms_activity_events(task_id,event_type,details) values(task,'preparation_updated',jsonb_build_object('previous_property',existing.property_id,'previous_status',existing.status,'previous_due_at',existing.due_at));
      update public.pms_tasks set assigned_user_id=case when existing.property_id<>r.property_id then null else assigned_user_id end,assigned_name=case when existing.property_id<>r.property_id then null else assigned_name end,property_id=r.property_id,status='todo',completed_at=null,submitted_at=null,scheduled_for=start_at-interval '24 hours',due_at=start_at,updated_at=now() where id=task;
      update public.pms_task_checklist_items set completed=false,completed_at=null,completed_by=null where task_id=task;
     end if;
    else
     insert into public.pms_tasks(property_id,reservation_id,experience_item_id,service_date,task_type,title,description,scheduled_for,due_at,priority)
      values(r.property_id,r.id,i.id,day,'setup','Preparar '||i.product_name_snapshot,'Reserva '||r.confirmation_code||' · '||coalesce(r.guest_name,'Hóspede'),start_at-interval '24 hours',start_at,'high') returning id into task;
     insert into public.pms_task_checklist_items(task_id,label,display_order) select task,value,ordinality from unnest(labels) with ordinality as t(value,ordinality);
     insert into public.pms_activity_events(task_id,event_type,details) values(task,'preparation_created',jsonb_build_object('snapshot',i.composition_snapshot));
    end if;
    wanted=array_append(wanted,task);
   end loop;
  end loop;
 end if;
 for existing in select id,status from public.pms_tasks where reservation_id=r.id and experience_item_id is not null and not(id=any(wanted)) and status<>'cancelled' loop
  insert into public.pms_activity_events(task_id,event_type,details) values(existing.id,'preparation_cancelled',jsonb_build_object('previous_status',existing.status,'reservation_status',r.status));
  update public.pms_tasks set status='cancelled',updated_at=now() where id=existing.id;
 end loop;
end $$;
create function stay_internal.preparation_event() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare rid uuid;
begin
 if tg_table_name='reservations' then rid=new.id;
 elsif tg_table_name='experience_orders' then rid=new.reservation_id;
 else select reservation_id into rid from public.experience_orders where id=new.order_id; end if;
 perform stay_internal.sync_preparation(rid);return new;
end $$;
create trigger stay_preparation_reservation after update of status,check_in,check_out,property_id on public.reservations for each row execute function stay_internal.preparation_event();
create trigger stay_preparation_order after insert or update of status on public.experience_orders for each row execute function stay_internal.preparation_event();
create trigger stay_preparation_item after insert or update of status on public.experience_order_items for each row execute function stay_internal.preparation_event();
revoke all on all functions in schema stay_internal from public,anon,authenticated;

create function stay_internal.sale_issue(p_product uuid,p_property bigint,p_start date,p_end date,p_exclude uuid default null,p_require_active boolean default true)
returns text language plpgsql security definer set search_path=public,pg_catalog as $$
declare prod record; prop record; day date; used int; inventory_used int;
begin
 select * into prod from public.experience_products where id=p_product;
 select * into prop from public.properties where id=p_property;
 if prod.id is null or p_require_active and prod.status<>'active' then return 'package_paused'; end if;
 if not exists(select 1 from public.experience_property_eligibility where product_id=p_product and property_id=p_property) then return 'package_property_incompatible'; end if;
 if (p_start+coalesce(prop.check_in_time,time '15:00')) at time zone coalesce(prop.timezone,'America/Sao_Paulo') < now()+make_interval(hours=>coalesce(prod.minimum_lead_hours,0)) then return 'package_lead_time'; end if;
 if prod.inventory is null and prod.daily_capacity is null then return null; end if;
 select count(*) into inventory_used from public.reservations r where r.id is distinct from p_exclude and r.check_out>=current_date and
  ((r.status in ('hold','pending_payment') and r.hold_expires_at>now() and exists(select 1 from quote_experience_items q where q.quote_id=r.quote_id and q.product_id=p_product))
   or (r.status='confirmed' and exists(select 1 from experience_orders o join experience_order_items i on i.order_id=o.id where o.reservation_id=r.id and o.status='active' and i.status='active' and i.product_id=p_product)));
 if prod.inventory is not null and inventory_used>=prod.inventory then return 'package_out_of_stock'; end if;
 if prod.daily_capacity is not null then
  for day in select generate_series(p_start::timestamp,(p_end-1)::timestamp,'1 day')::date loop
   select count(*) into used from public.reservations r where r.id is distinct from p_exclude and r.check_in<=day and r.check_out>day and
    ((r.status in ('hold','pending_payment') and r.hold_expires_at>now() and exists(select 1 from quote_experience_items q where q.quote_id=r.quote_id and q.product_id=p_product))
     or (r.status='confirmed' and exists(select 1 from experience_orders o join experience_order_items i on i.order_id=o.id where o.reservation_id=r.id and o.status='active' and i.status='active' and i.product_id=p_product)));
   if used>=prod.daily_capacity then return 'experience_capacity'; end if;
  end loop;
 end if;
 return null;
end $$;
create function public.experience_sale_issue(p_product uuid,p_property bigint,p_start date,p_end date,p_exclude uuid default null,p_require_active boolean default true)
returns text language sql security definer set search_path=public,pg_catalog as $$select stay_internal.sale_issue(p_product,p_property,p_start,p_end,p_exclude,p_require_active)$$;
revoke all on function public.experience_sale_issue(uuid,bigint,date,date,uuid,boolean) from public,anon,authenticated;
grant execute on function public.experience_sale_issue(uuid,bigint,date,date,uuid,boolean) to service_role;

create function public.save_experience_package_atomic(p_id uuid,p_actor uuid,p_product jsonb,p_properties bigint[],p_media jsonb)
returns public.experience_products language plpgsql security definer set search_path=public,pg_catalog as $$
declare result public.experience_products%rowtype; variant uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'admin_required'; end if;
 if cardinality(p_properties)=0 or exists(select 1 from unnest(p_properties) id where not exists(select 1 from properties p where p.id=id and p.active)) then raise exception 'experience_property_required'; end if;
 if p_id is null then
  insert into public.experience_products(code,name,description,package_type,price_cents,upsell_enabled,status,details,minimum_lead_hours,daily_capacity,inventory)
   values(p_product->>'code',p_product->>'name',p_product->>'description',p_product->>'package_type',(p_product->>'price_cents')::bigint,(p_product->>'upsell_enabled')::boolean,p_product->>'status',p_product->'details',(p_product->>'minimum_lead_hours')::int,(p_product->>'daily_capacity')::int,(p_product->>'inventory')::int) returning * into result;
 else
  select * into result from public.experience_products where id=p_id for update;
  if not found then raise exception 'experience_not_found'; end if;
  update public.experience_products set name=p_product->>'name',description=p_product->>'description',package_type=p_product->>'package_type',price_cents=(p_product->>'price_cents')::bigint,upsell_enabled=(p_product->>'upsell_enabled')::boolean,status=p_product->>'status',details=p_product->'details',minimum_lead_hours=(p_product->>'minimum_lead_hours')::int,daily_capacity=(p_product->>'daily_capacity')::int,inventory=(p_product->>'inventory')::int where id=p_id returning * into result;
 end if;
 delete from public.experience_property_eligibility where product_id=result.id;
 insert into public.experience_property_eligibility(product_id,property_id) select result.id,id from unnest(p_properties) id;
 select id into variant from public.experience_variants where product_id=result.id and active order by display_order limit 1;
 if variant is null then
  insert into public.experience_variants(product_id,code,name,price_cents,active,display_order) values(result.id,'package','Pacote',result.price_cents,true,10);
 else
  update public.experience_variants set code='package',name='Pacote',price_cents=result.price_cents,display_order=10 where id=variant;
  update public.experience_variants set active=false where product_id=result.id and id<>variant;
 end if;
 delete from public.experience_media where product_id=result.id;
 insert into public.experience_media(product_id,media_url,alt_text,display_order)
  select result.id,m->>'media_url',m->>'alt_text',(m->>'display_order')::int from jsonb_array_elements(p_media) m;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value) values(p_actor,'experience_package_saved','experience_product',result.id::text,jsonb_build_object('name',result.name,'price_cents',result.price_cents,'details',result.details,'property_ids',p_properties));
 return result;
end $$;
revoke all on function public.save_experience_package_atomic(uuid,uuid,jsonb,bigint[],jsonb) from public,anon,authenticated;
grant execute on function public.save_experience_package_atomic(uuid,uuid,jsonb,bigint[],jsonb) to service_role;

-- Compose a contract from catalog data once. Pending purchases retain this copy.
create function stay_internal.package_snapshot(p_product uuid,p_preferences jsonb default '{}',p_require_choices boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare p record; c jsonb; components jsonb='[]'; raw jsonb; choice text; prefs jsonb='{}';
begin
 select * into p from public.experience_products where id=p_product;
 if not found then raise exception 'experience_unavailable'; end if;
 raw=coalesce(p.details->'components',(select jsonb_agg(jsonb_build_object('name',value,'quantity',1,'frequency','arrival','choices','[]'::jsonb)) from jsonb_array_elements_text(coalesce(p.details->'includes','[]'))),'[]');
 for c in select value from jsonb_array_elements(raw) loop
  choice=p_preferences->>(c->>'name');
  if choice is not null and not(coalesce(c->'choices','[]') ? choice) then raise exception 'invalid_experience_choice'; end if;
  if p_require_choices and jsonb_array_length(coalesce(c->'choices','[]'))>0 and choice is null then raise exception 'experience_choice_required'; end if;
  c=c||jsonb_build_object('choice',choice);
  components=components||jsonb_build_array(c);
  if choice is not null then prefs=prefs||jsonb_build_object(c->>'name',choice); end if;
 end loop;
 return jsonb_build_object('product_id',p.id,'name',p.name,'gross_price_cents',p.price_cents,'components',components,'preferences',prefs);
end $$;

alter function public.add_experience_cart_item_atomic(uuid,uuid,uuid) rename to add_experience_cart_item_base;
revoke all on function public.add_experience_cart_item_base(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.add_experience_cart_item_atomic(p_reservation_id uuid,p_user_id uuid,p_variant_id uuid,p_preferences jsonb default '{}')
returns table(cart_item_id uuid,purchase_mode text,amount_cents bigint,description text)
language plpgsql security definer set search_path=public,pg_catalog as $$
declare prod record; r record; result_rec record; composition jsonb;
begin
 select p.* into prod from public.experience_products p join public.experience_variants v on v.product_id=p.id where v.id=p_variant_id for update of p;
 if not found or prod.details->>'standalone_enabled'='false' then raise exception 'experience_unavailable'; end if;
 select * into r from public.reservations where id=p_reservation_id and user_id=p_user_id;
 if not found then raise exception 'reservation_not_available'; end if;
 if stay_internal.sale_issue(prod.id,r.property_id,r.check_in,r.check_out,r.id,true) is not null then raise exception 'experience_unavailable'; end if;
 composition=stay_internal.package_snapshot(prod.id,p_preferences,true);
 if exists(select 1 from public.experience_order_items i join public.experience_orders o on o.id=i.order_id join public.experience_products other on other.id=i.product_id,
  lateral jsonb_array_elements(coalesce(i.composition_snapshot->'components','[]')) a,
  lateral jsonb_array_elements(composition->'components') b
  where o.reservation_id=r.id and o.status='active' and i.status='active' and other.package_type<>prod.package_type and lower(a->>'name')=lower(b->>'name'))
  then raise exception 'experience_component_conflict'; end if;
 select * into result_rec from public.add_experience_cart_item_base(p_reservation_id,p_user_id,p_variant_id);
 update public.post_booking_cart_items set snapshot=snapshot||jsonb_build_object('composition',composition) where id=result_rec.cart_item_id;
 return query select result_rec.cart_item_id,result_rec.purchase_mode,result_rec.amount_cents,result_rec.description;
end $$;
revoke all on function public.add_experience_cart_item_atomic(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.add_experience_cart_item_atomic(uuid,uuid,uuid,jsonb) to service_role;

alter function public.checkout_experience_cart_item_atomic(uuid,uuid,integer) rename to checkout_experience_cart_item_base;
revoke all on function public.checkout_experience_cart_item_base(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function public.checkout_experience_cart_item_atomic(p_cart_item_id uuid,p_user_id uuid,p_expires_minutes integer)
returns table(charge_id uuid,purchase_mode text,amount_cents bigint,description text,expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_catalog as $$
declare ci record; result_rec record; comp jsonb;
begin
 select * into ci from public.post_booking_cart_items where id=p_cart_item_id and user_id=p_user_id for update;
 if not found then raise exception 'cart_item_not_found'; end if;
 comp=ci.snapshot->'composition';
 if comp is null then comp=stay_internal.package_snapshot((ci.snapshot->>'target_product_id')::uuid,'{}',true); end if;
 select * into result_rec from public.checkout_experience_cart_item_base(p_cart_item_id,p_user_id,p_expires_minutes);
 update public.post_booking_charges set snapshot=snapshot||jsonb_build_object('composition',comp) where id=result_rec.charge_id;
 return query select result_rec.charge_id,result_rec.purchase_mode,result_rec.amount_cents,result_rec.description,result_rec.expires_at;
end $$;
revoke all on function public.checkout_experience_cart_item_atomic(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.checkout_experience_cart_item_atomic(uuid,uuid,integer) to service_role;

create function stay_internal.item_contract() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare rid uuid;
begin
 if tg_op='UPDATE' then
  if new.composition_snapshot is distinct from old.composition_snapshot then raise exception 'composition_is_immutable'; end if;
  return new;
 end if;
 if new.composition_snapshot is null then
  select reservation_id into rid from public.experience_orders where id=new.order_id;
  select c.snapshot->'composition' into new.composition_snapshot from public.post_booking_charges c
   where c.reservation_id=rid and c.target_variant_id=new.variant_id and c.status in ('paid','applied') order by c.created_at desc limit 1;
  if new.composition_snapshot is null then new.composition_snapshot=stay_internal.package_snapshot(new.product_id); end if;
 end if;
 return new;
end $$;
create trigger stay_item_contract before insert or update on public.experience_order_items for each row execute function stay_internal.item_contract();
revoke all on all functions in schema stay_internal from public,anon,authenticated;
