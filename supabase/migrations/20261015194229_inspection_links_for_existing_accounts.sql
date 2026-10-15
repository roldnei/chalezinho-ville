-- Existing email accounts can receive an assigned task capability without being
-- provisioned again or inventing a WhatsApp number. Authorization is unchanged.
do $migration$
declare definition text;needle text:='return (select jsonb_build_object(''phone'',phone,''name'',name) from public.ops_inspection_contacts where user_id=t.assigned_to);';
begin
 definition=pg_get_functiondef('public.inspection_dispatch(uuid,text,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'inspection_link_response_changed';end if;
 definition=replace(definition,'if not exists(select 1 from public.ops_inspection_contacts where user_id=t.assigned_to) then raise exception ''contact_required'';end if;','');
 execute replace(definition,needle,'return (select jsonb_build_object(''phone'',c.phone,''name'',coalesce(c.name,pr.full_name,''Equipe'')) from public.profiles pr left join public.ops_inspection_contacts c on c.user_id=pr.id where pr.id=t.assigned_to);');
end $migration$;
