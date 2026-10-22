begin;
create schema if not exists private;
create table public.account_terms_acceptances (
 user_id uuid not null references auth.users(id) on delete cascade,
 terms_version text not null, accepted_at timestamptz not null default now(),
 source text not null check(source='signup_create_account'),
 primary key(user_id,terms_version)
);
alter table public.account_terms_acceptances enable row level security;
revoke all on public.account_terms_acceptances from public,anon,authenticated;
grant select on public.account_terms_acceptances to service_role;
-- Trigger-only, fixed purpose: never grants posting or administrator permissions.
create function private.capture_signup_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'auth' or tg_table_name<>'users' or tg_op<>'INSERT' then raise exception 'invalid_terms_context'; end if;
 if new.raw_user_meta_data->>'terms_version'='2026-10-22.1'
 and new.raw_user_meta_data->>'terms_acceptance_source'='signup_create_account' then
  insert into public.account_terms_acceptances(user_id,terms_version,source)
  values(new.id,'2026-10-22.1','signup_create_account') on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.capture_signup_terms() from public,anon,authenticated;
create trigger capture_ville_signup_terms after insert on auth.users for each row execute function private.capture_signup_terms();
-- A tombstone retains anonymous commercial metrics without retaining the trip.
alter table public.villegram_publications add column deleted_at timestamptz;
create table public.villegram_media_deletions (
 publication_id uuid primary key, author_id uuid not null references auth.users(id) on delete cascade,
 media_paths text[] not null, created_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.villegram_media_deletions enable row level security;
revoke all on public.villegram_media_deletions from public,anon,authenticated;
grant all on public.villegram_media_deletions to service_role;
create index villegram_media_deletions_pending on public.villegram_media_deletions(author_id) where completed_at is null;
create function public.villegram_delete_guest(actor uuid,post_id uuid,revision timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.villegram_publications; paths text[];
begin
 if actor is null then raise exception 'authentication_required'; end if;
 -- Same lock as guest_save: deletion and edits by an author are serialized.
 perform 1 from public.villegram_profiles where id=actor for update;
 select * into p from public.villegram_publications where id=post_id and author_id=actor and source='guest_submission' for update;
 if not found then raise exception 'publication_unavailable'; end if;
 if p.deleted_at is not null then return jsonb_build_object('deleted',true); end if;
 if revision is null or p.updated_at<>revision then raise exception 'edit_conflict'; end if;
 select coalesce(array_agg(distinct path),array[]::text[]) into paths from (
  select m->>'path' path from jsonb_array_elements(p.media) m union all select m->>'poster_path' from jsonb_array_elements(p.media) m
 ) q where path like actor::text||'/%';
 insert into public.villegram_media_deletions(publication_id,author_id,media_paths) values(p.id,actor,paths);
 delete from public.villegram_post_likes where publication_id=p.id;
 delete from public.villegram_post_comments where publication_id=p.id;
 delete from public.villegram_mentions where publication_id=p.id;
 delete from public.villegram_notifications where publication_id=p.id;
 update public.villegram_publications set status='archived',deleted_at=clock_timestamp(),updated_at=clock_timestamp(),
 title='Conteúdo excluído',caption='Conteúdo excluído',author_name='Hóspede',moderation_reason=null,
 media='[{"kind":"photo","url":"assets/content-removed.webp"}]',cover_index=0,featured=false,stay_selection=null
 where id=p.id;
 return jsonb_build_object('deleted',true);
end $$;
revoke all on function public.villegram_delete_guest(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.villegram_delete_guest(uuid,uuid,timestamptz) to service_role;
create function private.prevent_deleted_trip_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.deleted_at is not null then raise exception 'publication_deleted'; end if;
 return new;
end $$;
revoke all on function private.prevent_deleted_trip_update() from public,anon,authenticated;
create trigger protect_deleted_trip before update on public.villegram_publications for each row execute function private.prevent_deleted_trip_update();
commit;
