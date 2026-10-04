-- Keep unsent pre-stay reminders aligned with the confirmed stay.
-- Delivered/in-flight messages are immutable; no duplicate notification is created.
create or replace function public.reschedule_pre_stay_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_time time; v_zone text;
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op='UPDATE' then
    if new.check_in is not distinct from old.check_in
       and new.check_out is not distinct from old.check_out
       and new.property_id is not distinct from old.property_id
       and new.status is not distinct from old.status then return new; end if;
  end if;
  select coalesce(check_in_time,time '15:00'),coalesce(nullif(timezone,''),'America/Sao_Paulo')
    into v_time,v_zone from public.properties where id=new.property_id;
  update public.notification_outbox
     set send_after=greatest(now(),((new.check_in+coalesce(v_time,time '15:00')) at time zone coalesce(v_zone,'America/Sao_Paulo'))-interval '24 hours'),
         payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('check_in',new.check_in,'check_out',new.check_out,'property_id',new.property_id)
   where reservation_id=new.id and template_code='pre_stay_important' and status='queued';
  return new;
end $$;
revoke all on function public.reschedule_pre_stay_notification() from public,anon,authenticated;
grant execute on function public.reschedule_pre_stay_notification() to service_role;
drop trigger if exists zz_reschedule_pre_stay_notification on public.reservations;
create trigger zz_reschedule_pre_stay_notification after insert or update on public.reservations
for each row execute function public.reschedule_pre_stay_notification();

update public.notification_outbox n
   set send_after=greatest(now(),((r.check_in+coalesce(p.check_in_time,time '15:00')) at time zone coalesce(nullif(p.timezone,''),'America/Sao_Paulo'))-interval '24 hours'),
       payload=coalesce(n.payload,'{}'::jsonb)||jsonb_build_object('check_in',r.check_in,'check_out',r.check_out,'property_id',r.property_id)
  from public.reservations r join public.properties p on p.id=r.property_id
 where n.reservation_id=r.id and n.template_code='pre_stay_important' and n.status='queued'
   and r.status='confirmed' and r.check_in>=current_date;
