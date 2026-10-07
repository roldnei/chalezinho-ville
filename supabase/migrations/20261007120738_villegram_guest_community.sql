-- DEV community. No reservation/customer fields are copied into social profiles.
begin;
create table public.villegram_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 handle text not null unique check(handle ~ '^[a-z][a-z0-9_]{2,23}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 bio text not null default '' check(length(bio)<=240), avatar_path text,
 is_public boolean not null default false, can_post boolean not null default false,
 consented_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.villegram_follows (
 follower_id uuid references public.villegram_profiles(id) on delete cascade,
 followed_id uuid references public.villegram_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(follower_id,followed_id),check(follower_id<>followed_id)
);
create index villegram_follows_target on public.villegram_follows(followed_id);
create table public.villegram_mentions (
 publication_id uuid references public.villegram_publications(id) on delete cascade,
 user_id uuid references public.villegram_profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','removed')),
 created_at timestamptz not null default now(), primary key(publication_id,user_id)
);
create index villegram_mentions_recipient on public.villegram_mentions(user_id,status);
create table public.villegram_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete cascade, publication_id uuid references public.villegram_publications(id) on delete cascade,
 kind text not null check(kind in ('follow','like','comment','mention','published','archived','invite')),
 event_key text not null unique, created_at timestamptz not null default now(), read_at timestamptz
);
create index villegram_notifications_inbox on public.villegram_notifications(user_id,created_at desc);
create index villegram_notifications_actor on public.villegram_notifications(actor_id);
create index villegram_notifications_post on public.villegram_notifications(publication_id);
create table public.villegram_invites (
 id uuid primary key default gen_random_uuid(), inviter_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), expires_at timestamptz not null,
 accepted_by uuid references auth.users(id) on delete cascade, accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index villegram_invites_owner on public.villegram_invites(inviter_id,created_at desc);
create index villegram_invites_accepted on public.villegram_invites(accepted_by);
alter table public.villegram_publications add column moderation_reason text;
create index villegram_publications_author on public.villegram_publications(author_id,created_at desc);
alter table public.villegram_profiles enable row level security;
alter table public.villegram_follows enable row level security;
alter table public.villegram_mentions enable row level security;
alter table public.villegram_notifications enable row level security;
alter table public.villegram_invites enable row level security;
revoke all on public.villegram_profiles,public.villegram_follows,public.villegram_mentions,public.villegram_notifications,public.villegram_invites from anon,authenticated;
grant all on public.villegram_profiles,public.villegram_follows,public.villegram_mentions,public.villegram_notifications,public.villegram_invites to service_role;
-- Only own profile is readable directly, to authorize private uploads. No direct writes.
grant select on public.villegram_profiles to authenticated;
create policy villegram_profile_self on public.villegram_profiles for select to authenticated using(id=(select auth.uid()));
create policy villegram_guest_upload on storage.objects for insert to authenticated with check (
 bucket_id='villegram-media' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.villegram_profiles p where p.id=(select auth.uid()) and p.is_public and (p.can_post or name ~ '\.(webp|jpg)$'))
 -- First path is the immutable owner. Avatar uploads also work before a first stay.
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(webp|jpg|mp4|webm)$'
);
create policy villegram_guest_media_self on storage.objects for select to authenticated using (
 bucket_id='villegram-media' and (storage.foldername(name))[1]=(select auth.uid())::text
);

-- Invoker functions: only the verified Edge Function's service role can execute.
create function public.villegram_accept_invite(actor uuid,token_digest text) returns void language plpgsql security invoker set search_path='' as $$
declare invite public.villegram_invites;
begin
 update public.villegram_invites set accepted_by=actor,accepted_at=now() where token_hash=token_digest and accepted_by is null and revoked_at is null and expires_at>now() and inviter_id<>actor returning * into invite;
 if not found then raise exception 'invalid_invite'; end if;
 update public.villegram_profiles set can_post=true where id=actor;
 insert into public.villegram_notifications(user_id,actor_id,kind,event_key) values(invite.inviter_id,actor,'invite','invite:'||invite.id) on conflict(event_key) do nothing;
end $$;
create function public.villegram_save_guest(actor uuid,post_id uuid,revision timestamptz,value jsonb,tagged_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.villegram_publications; person public.villegram_profiles; tag uuid;
begin
 select * into person from public.villegram_profiles where id=actor and is_public for update;
 if not found then raise exception 'profile_required'; end if;
 if cardinality(tagged_ids)>10 then raise exception 'invalid_mentions'; end if;
 if value->>'status' not in ('draft','pending_review','archived') then raise exception 'invalid_status'; end if;
 if post_id is null then
  if (select count(*) from public.villegram_publications where author_id=actor and created_at>now()-interval '1 day')>=10 then raise exception 'post_limit'; end if;
  insert into public.villegram_publications(author_id,author_name,source,type,title,caption,media,cover_index,property_id,cta,status)
  values(actor,person.display_name,'guest_submission',case when (value->>'property_id') is not null then 'property' else 'trust' end,value->>'title',value->>'caption',value->'media',(value->>'cover_index')::int,(value->>'property_id')::bigint,case when (value->>'property_id') is not null then 'property' else 'dates' end,value->>'status') returning * into p;
 else
  update public.villegram_publications set title=value->>'title',caption=value->>'caption',media=value->'media',cover_index=(value->>'cover_index')::int,
   property_id=(value->>'property_id')::bigint,type=case when (value->>'property_id') is not null then 'property' else 'trust' end,
   cta=case when (value->>'property_id') is not null then 'property' else 'dates' end,status=value->>'status',published_at=null,moderation_reason=null,updated_at=clock_timestamp(),author_name=person.display_name
  where id=post_id and author_id=actor and source='guest_submission' and updated_at=revision returning * into p;
  if not found then raise exception 'edit_conflict'; end if;
 end if;
 delete from public.villegram_mentions where publication_id=p.id and not(user_id=any(tagged_ids));
 -- Editing changes context; accepted tags need consent again. Removed associations stay removed.
 update public.villegram_mentions set status='pending' where publication_id=p.id and status='accepted';
 foreach tag in array tagged_ids loop
  if tag<>actor and exists(select 1 from public.villegram_profiles where id=tag and is_public) then
   insert into public.villegram_mentions(publication_id,user_id) values(p.id,tag) on conflict do nothing;
  end if;
 end loop;
 return to_jsonb(p);
end $$;
create function public.villegram_moderate(actor uuid,post_id uuid,revision timestamptz,decision text,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare p public.villegram_publications;
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and pms_access_status='active') then raise exception 'admin_required'; end if;
 if decision not in ('published','archived') or (decision='archived' and length(trim(reason))=0) then raise exception 'invalid_decision'; end if;
 update public.villegram_publications set status=decision,published_at=case when decision='published' then now() else published_at end,moderation_reason=case when decision='archived' then left(reason,500) else null end,updated_at=clock_timestamp()
 where id=post_id and source='guest_submission' and updated_at=revision and (status='pending_review' or decision='archived' and status='published')
 and (decision='archived' or exists(select 1 from public.villegram_profiles where id=author_id and is_public)) returning * into p;
 if not found then raise exception 'edit_conflict'; end if;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,new_value) values(actor,'villegram_guest_moderated','villegram_publication',p.id,jsonb_build_object('status',decision,'reason',reason));
end $$;

create function public.villegram_community_notify() returns trigger language plpgsql security invoker set search_path='' as $$
declare recipient uuid; post uuid; actor uuid; event text; kind text;
begin
 if TG_TABLE_NAME='villegram_follows' then recipient:=new.followed_id; actor:=new.follower_id;kind:='follow';event:='follow:'||actor||':'||recipient;
 elsif TG_TABLE_NAME='villegram_post_likes' or TG_TABLE_NAME='villegram_post_comments' then
  post:=new.publication_id; actor:=new.user_id;select author_id into recipient from public.villegram_publications where id=post and status='published';
  kind:=case when TG_TABLE_NAME='villegram_post_likes' then 'like' else 'comment' end;
  if kind='comment' then event:='comment:'||new.id; else event:='like:'||post||':'||actor; end if;
 elsif TG_TABLE_NAME='villegram_publications' then
  if new.source<>'guest_submission' or new.status=old.status or new.status not in ('published','archived') then return new; end if;
  recipient:=new.author_id;post:=new.id;kind:=new.status;event:=kind||':'||post||':'||new.updated_at;
  if new.status='published' then
   insert into public.villegram_notifications(user_id,actor_id,publication_id,kind,event_key)
   select m.user_id,new.author_id,new.id,'mention','mention:'||new.id||':'||m.user_id||':'||new.updated_at from public.villegram_mentions m where m.publication_id=new.id and m.status='pending' on conflict(event_key) do nothing;
  end if;
 end if;
 if recipient is not null and recipient is distinct from actor then
  insert into public.villegram_notifications(user_id,actor_id,publication_id,kind,event_key) values(recipient,actor,post,kind,event) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger villegram_follow_notice after insert on public.villegram_follows for each row execute function public.villegram_community_notify();
create trigger villegram_like_notice after insert on public.villegram_post_likes for each row execute function public.villegram_community_notify();
create trigger villegram_comment_notice after insert on public.villegram_post_comments for each row execute function public.villegram_community_notify();
create trigger villegram_moderation_notice after update on public.villegram_publications for each row execute function public.villegram_community_notify();
revoke all on function public.villegram_accept_invite(uuid,text), public.villegram_save_guest(uuid,uuid,timestamptz,jsonb,uuid[]),public.villegram_moderate(uuid,uuid,timestamptz,text,text),public.villegram_community_notify() from public,anon,authenticated;
grant execute on function public.villegram_accept_invite(uuid,text),public.villegram_save_guest(uuid,uuid,timestamptz,jsonb,uuid[]),public.villegram_moderate(uuid,uuid,timestamptz,text,text),public.villegram_community_notify() to service_role;
commit;
