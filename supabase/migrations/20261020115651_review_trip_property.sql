-- A reviewer can attach a chalet without changing guest content or restarting
-- an already published Trip. Approval and its optional link share a transaction.
create function public.villegram_review_property(actor uuid,post_id uuid,revision timestamptz,property_id bigint,decision text,reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.villegram_publications;previous_property bigint;
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and pms_access_status='active') then raise exception 'admin_required';end if;
 if decision is not null and decision<>'published' then raise exception 'invalid_decision';end if;
 select * into p from public.villegram_publications where id=post_id and source='guest_submission' and updated_at=revision and status in ('pending_review','published') for update;
 if not found or (decision='published' and p.status<>'pending_review') then raise exception 'edit_conflict';end if;
 if $4 is not null and not exists(select 1 from public.properties x where x.id=$4 and x.active) then raise exception 'invalid_link';end if;
 previous_property=p.property_id;
 if p.property_id is distinct from $4 or p.type is distinct from (case when $4 is null then 'trust' else 'property' end) or p.cta is distinct from (case when $4 is null then 'dates' else 'property' end) then
  update public.villegram_publications set property_id=$4,type=case when $4 is null then 'trust' else 'property' end,cta=case when $4 is null then 'dates' else 'property' end,updated_at=clock_timestamp()
   where id=p.id returning * into p;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value)
   values(actor,'villegram_guest_property_linked','villegram_publication',p.id,jsonb_build_object('previous_property_id',previous_property,'property_id',p.property_id));
 end if;
 if decision='published' then
  perform public.villegram_moderate(actor,p.id,p.updated_at,decision,reason);
  select * into p from public.villegram_publications where id=p.id;
 end if;
 return to_jsonb(p);
end $$;
revoke all on function public.villegram_review_property(uuid,uuid,timestamptz,bigint,text,text) from public,anon,authenticated;
grant execute on function public.villegram_review_property(uuid,uuid,timestamptz,bigint,text,text) to service_role;
