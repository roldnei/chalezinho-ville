-- Moments signup collects identity only when a lodging reservation needs it.
-- This client marker selects an onboarding form; it grants no permissions.
-- Preserve the existing cleaning, PMS invitation and document validation guards.
do $migration$
declare definition text;needle text:='if new.raw_user_meta_data->>''onboarding''=''cleaning'' then return new;end if;';
begin
 definition=pg_get_functiondef('private.register_guest_identity()'::regprocedure);
 if position('onboarding''=''moments' in definition)>0 then return;end if;
 if position(needle in definition)=0 then raise exception 'identity_registration_changed';end if;
 execute replace(definition,needle,needle||'
  if new.raw_user_meta_data->>''onboarding''=''moments'' then return new;end if;');
end $migration$;
