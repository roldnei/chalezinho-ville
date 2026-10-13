-- Explicit test stays must not block real inventory. No source data is removed.
create or replace function ops_private.guard_inventory() returns trigger language plpgsql set search_path='' as $$
declare pid bigint;starts date;ends date;own_id uuid;
begin
 perform pg_advisory_xact_lock(710122026);
 if tg_table_name='ops_stays' then
  if new.is_test or new.status<>'confirmed' or new.reservation_id is not null then return new;end if;
  pid=new.property_id;starts=new.check_in;ends=new.check_out;
  perform 1 from public.properties where id=pid for update;
  if new.origin='manual' and (
   exists(select 1 from public.reservations where property_id=pid and status in ('confirmed','hold','pending_payment') and check_in<ends and check_out>starts and (status='confirmed' or hold_expires_at is null or hold_expires_at>now()))
   or exists(select 1 from public.pms_calendar_blocks where property_id=pid and status='active' and start_date<ends and end_date>starts)
  ) then raise exception 'existing_stay_link_required';end if;
  return new;
 elsif tg_table_name='reservations' then
  if new.status not in ('confirmed','hold','pending_payment') then return new;end if;
  pid=new.property_id;starts=new.check_in;ends=new.check_out;own_id=new.id;
 elsif tg_table_name='pms_calendar_blocks' then
  if new.status<>'active' then return new;end if;pid=new.property_id;starts=new.start_date;ends=new.end_date;
 else
  if new.kind<>'modification' or new.status not in ('awaiting_payment','processing','paid') or new.expires_at<=now() then return new;end if;
  pid=new.target_property_id;starts=new.target_check_in;ends=new.target_check_out;own_id=new.reservation_id;
 end if;
 perform 1 from public.properties where id=pid for update;
 if exists(select 1 from public.ops_stays where property_id=pid and reservation_id is null and status='confirmed' and not is_test and check_in<ends and check_out>starts) then raise exception 'operational_period_occupied';end if;
 return new;
end $$;
