-- Production incidents reference a guarantee; DEV also supports a direct stay reference.
-- Read both existing shapes without changing incidents, guarantees or financial decisions.
do $migration$
declare definition text;old_join text:='from public.incidents i join public.reservations r on r.id=i.reservation_id';
new_join text:='from public.incidents i left join public.guarantees g on g.id=(to_jsonb(i)->>''guarantee_id'')::uuid join public.reservations r on r.id=coalesce((to_jsonb(i)->>''reservation_id'')::uuid,g.reservation_id)';
begin
 definition=pg_get_functiondef('private.admin_approval_inbox()'::regprocedure);
 if position(old_join in definition)>0 then execute replace(definition,old_join,new_join);
 elsif position(new_join in definition)=0 then raise exception 'approval_incident_query_changed';end if;
end $migration$;
