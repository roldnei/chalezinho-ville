-- First access completes the existing person's contact; it never provisions Auth users.
-- Keep the dispatcher invoker security and all existing grants unchanged.
do $migration$
declare definition text; old_block text:=$old$ if p_action='profile' then
  if length(trim(coalesce(p->>'name','')))<2 then raise exception 'invalid_profile';end if;
  update public.ops_inspection_contacts set name=left(trim(p->>'name'),120),email=left(p->>'email',180),profile_completed_at=now() where user_id=a;
  return jsonb_build_object('ok',true);
 end if;
$old$; new_block text:=$new$ if p_action='profile' then
  declare own_phone text;
  begin
   if length(trim(coalesce(p->>'name','')))<2 then raise exception 'invalid_profile';end if;
   own_phone=regexp_replace(coalesce(nullif(p->>'phone',''),(select phone from public.ops_inspection_contacts where user_id=a),''),'[^0-9]','','g');
   if length(own_phone) in (10,11) then own_phone='55'||own_phone;end if;
   if own_phone !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'invalid_profile';end if;
   -- The authenticated actor or task capability supplies identity. Never trust a user_id from the form.
   insert into public.ops_inspection_contacts(user_id,name,phone,email,profile_completed_at,created_by)
    values(a,left(trim(p->>'name'),120),own_phone,nullif(left(trim(p->>'email'),180),''),now(),a)
    on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,email=coalesce(excluded.email,public.ops_inspection_contacts.email),profile_completed_at=now();
   return jsonb_build_object('ok',true);
  exception when unique_violation then raise exception 'invalid_profile';
  end;
 end if;
$new$;
begin
 definition=pg_get_functiondef('public.inspection_dispatch(uuid,text,text,jsonb)'::regprocedure);
 if position(old_block in definition)=0 or position($oldprofile$case when contact.user_id is not null then jsonb_build_object('name',contact.name,'phone',contact.phone,'completed',contact.profile_completed_at is not null) else null end$oldprofile$ in definition)=0 then raise exception 'inspection_profile_definition_changed';end if;
 definition=replace(definition,old_block,new_block);
 execute replace(definition,$oldprofile$case when contact.user_id is not null then jsonb_build_object('name',contact.name,'phone',contact.phone,'completed',contact.profile_completed_at is not null) else null end$oldprofile$,$newprofile$jsonb_build_object('name',coalesce(contact.name,(select full_name from public.profiles where id=a),'Equipe'),'phone',coalesce(contact.phone,''),'completed',contact.profile_completed_at is not null)$newprofile$);
end $migration$;
