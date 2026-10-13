-- Import only existing PMS identifiers/names/types into the authenticated owner's account.
-- Unknown cleaning characteristics remain unknown, and automation is never enabled here.
alter table public.cleaning_properties add column pms_import_pending boolean not null default false;
alter table public.cleaning_properties alter column rooms drop not null;
alter table public.cleaning_properties alter column bathrooms drop not null;
alter table public.cleaning_properties add constraint cleaning_complete_property check
 (pms_import_pending or (rooms is not null and bathrooms is not null));

create function public.cleaning_import_pms(p_actor uuid) returns jsonb
language plpgsql set search_path='' as $$
declare n integer;begin
 perform pg_advisory_xact_lock(710122026);
 if not exists(select 1 from public.cleaning_members where user_id=p_actor and owner and not blocked)
 then return '{"imported":0}';end if;
 perform set_config('cleaning.actor',p_actor::text,true);
 insert into public.cleaning_properties(owner_id,name,type,city,bairro,rooms,bathrooms,beds,pms_property_id,pms_import_pending,updated_by)
 select p_actor,left(x.name,100),case when x.property_type in ('apartment','house','chalet') then x.property_type else 'other' end,
 '', '',null,null,'[]',x.id,true,p_actor
 from public.properties x join public.profiles p on p.id=p_actor
 where x.active and p.pms_access_status='active'
 and (p.role='admin' or (p.role='host' and x.id=any(p.pms_property_ids)))
 on conflict(pms_property_id) where pms_property_id is not null do nothing;
 get diagnostics n=row_count;
 return jsonb_build_object('imported',n);
end $$;
revoke all on function public.cleaning_import_pms(uuid) from public,anon,authenticated;
grant execute on function public.cleaning_import_pms(uuid) to service_role;

-- Retain the current financial logic and clear the draft flag only through the validated property command.
do $$declare def text;needle text;begin
 def=pg_get_functiondef('public.cleaning_mutate(uuid,text,jsonb)'::regprocedure);
 needle='supplies=excluded.supplies,updated_by=p_actor,updated_at=now() returning * into prop;';
 if position(needle in def)=0 then raise exception 'cleaning_property_command_changed';end if;
 execute replace(def,needle,'supplies=excluded.supplies,pms_import_pending=false,updated_by=p_actor,updated_at=now() returning * into prop;');
 def=pg_get_functiondef('cleaning_private.quote(uuid,uuid,uuid,jsonb)'::regprocedure);
 needle='if prop.area is null and prop.price_override_cents is null then';
 if position(needle in def)=0 then raise exception 'cleaning_quote_changed';end if;
 execute replace(def,needle,'if prop.pms_import_pending or prop.rooms is null or prop.bathrooms is null then return jsonb_build_object(''quote_required'',true,''reason'',''incomplete_property'');end if; '||needle);
end $$;
