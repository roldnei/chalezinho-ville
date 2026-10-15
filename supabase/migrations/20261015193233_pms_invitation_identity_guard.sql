-- Auth inserts the invited user before invited_at is populated. A server-prepared
-- invitation allows deferred identity collection; client metadata alone never does.
do $migration$
declare definition text;needle text:='if new.raw_user_meta_data->>''onboarding''=''cleaning'' then return new;end if;';
begin
 definition=pg_get_functiondef('private.register_guest_identity()'::regprocedure);
 if position('pms_team' in definition)>0 then return;end if;
 if position(needle in definition)=0 then raise exception 'identity_registration_changed';end if;
 execute replace(definition,needle,needle||'
  if new.raw_user_meta_data->>''onboarding''=''pms_team'' and exists(
   select 1 from public.pms_team_invitations i join public.profiles a on a.id=i.invited_by
   where i.email=lower(new.email) and i.status=''pending'' and i.expires_at>now() and i.cancelled_at is null
   and (i.invited_user_id is null or i.invited_user_id=new.id)
   and a.role=''admin'' and a.pms_access_status=''active''
  ) then return new;end if;');
end $migration$;
