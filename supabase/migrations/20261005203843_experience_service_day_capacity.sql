-- Respect the actual service days in each immutable package composition.
create or replace function stay_internal.sale_issue(p_product uuid,p_property bigint,p_start date,p_end date,p_exclude uuid default null,p_require_active boolean default true)
returns text language plpgsql security definer set search_path=public,pg_catalog as $$
declare prod record; prop record; day date; used int; inventory_used int; components jsonb;
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
  select i.composition_snapshot->'components' into components from experience_orders o join experience_order_items i on i.order_id=o.id where o.reservation_id=p_exclude and i.product_id=p_product and o.status='active' and i.status='active' limit 1;
  components=coalesce(components,prod.details->'components','[{"frequency":"arrival"}]'::jsonb);
  for day in select generate_series(p_start::timestamp,p_end::timestamp,'1 day')::date loop
   if not exists(select 1 from jsonb_array_elements(components) c where c->>'frequency'='arrival' and day=p_start or c->>'frequency'='daily' and day<p_end or c->>'frequency'='departure' and day=p_end) then continue; end if;
   select count(*) into used from public.reservations r where r.id is distinct from p_exclude and r.check_in<=day and r.check_out>=day and
    ((r.status in ('hold','pending_payment') and r.hold_expires_at>now() and exists(select 1 from quote_experience_items q where q.quote_id=r.quote_id and q.product_id=p_product and exists(select 1 from jsonb_array_elements(coalesce(q.composition_snapshot->'components','[{"frequency":"arrival"}]'::jsonb)) c where c->>'frequency'='arrival' and day=r.check_in or c->>'frequency'='daily' and day<r.check_out or c->>'frequency'='departure' and day=r.check_out)))
     or (r.status='confirmed' and exists(select 1 from experience_orders o join experience_order_items i on i.order_id=o.id where o.reservation_id=r.id and o.status='active' and i.status='active' and i.product_id=p_product and exists(select 1 from jsonb_array_elements(coalesce(i.composition_snapshot->'components','[{"frequency":"arrival"}]'::jsonb)) c where c->>'frequency'='arrival' and day=r.check_in or c->>'frequency'='daily' and day<r.check_out or c->>'frequency'='departure' and day=r.check_out))));
   if used>=prod.daily_capacity then return 'experience_capacity'; end if;
  end loop;
 end if;
 return null;
end $$;

revoke all on function stay_internal.sale_issue(uuid,bigint,date,date,uuid,boolean) from public,anon,authenticated;
