-- Serialize direct inventory and operational blocks on the same property row.
-- API preflight alone leaves a race between a booking and maintenance closure.
create or replace function private.guard_operational_inventory()
returns trigger language plpgsql security invoker set search_path='' as $$
declare property_key bigint; starts date; ends date; own_reservation uuid;
begin
 if tg_table_name='post_booking_charges' then
   if new.kind<>'modification' or new.status not in ('awaiting_payment','processing','paid') or new.expires_at<=now() then return new; end if;
   property_key:=new.target_property_id; starts:=new.target_check_in; ends:=new.target_check_out; own_reservation:=new.reservation_id;
 elsif tg_table_name='reservations' then
   if new.status not in ('hold','pending_payment','confirmed') then return new; end if;
   property_key:=new.property_id; starts:=new.check_in; ends:=new.check_out; own_reservation:=new.id;
 else
   if new.status<>'active' then return new; end if;
   property_key:=new.property_id; starts:=new.start_date; ends:=new.end_date;
 end if;
 if property_key is null or starts is null or ends is null then raise exception 'invalid_inventory_period'; end if;
 perform 1 from public.properties where id=property_key for update;
 if exists(select 1 from public.pms_calendar_blocks b where b.property_id=property_key and b.status='active' and b.start_date<ends and b.end_date>starts and (tg_table_name<>'pms_calendar_blocks' or b.id<>new.id)) then
   raise exception 'operational_period_occupied' using errcode='23P01';
 end if;
 if tg_table_name='pms_calendar_blocks' and (
   exists(select 1 from public.reservations r where r.property_id=property_key and r.status in ('hold','pending_payment','confirmed') and r.check_in<ends and r.check_out>starts)
   or exists(select 1 from public.post_booking_charges c where c.kind='modification' and c.target_property_id=property_key and c.status in ('awaiting_payment','processing','paid') and c.expires_at>now() and c.target_check_in<ends and c.target_check_out>starts)
 ) then raise exception 'operational_period_occupied' using errcode='23P01'; end if;
 return new;
end $$;
revoke all on function private.guard_operational_inventory() from public,anon,authenticated;
create trigger guard_operational_blocks before insert or update of property_id,start_date,end_date,status on public.pms_calendar_blocks for each row execute function private.guard_operational_inventory();
create trigger guard_reservation_operational_blocks before insert or update of property_id,check_in,check_out,status on public.reservations for each row execute function private.guard_operational_inventory();
create trigger guard_modification_operational_blocks before insert or update of target_property_id,target_check_in,target_check_out,status,expires_at on public.post_booking_charges for each row execute function private.guard_operational_inventory();
