alter table public.stay_offers add column if not exists villegram jsonb not null default '{}'::jsonb;
create table public.villegram_likes (
 offer_id uuid not null references public.stay_offers(id), user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), primary key(offer_id,user_id)
);
create table public.villegram_comments (
 id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.stay_offers(id),
 user_id uuid not null references auth.users(id), display_name text not null check(length(display_name) between 1 and 80),
 body text not null check(length(body) between 1 and 500), status text not null default 'visible' check(status in ('visible','removed')),
 created_at timestamptz not null default now(), removed_at timestamptz
);
create index villegram_comments_offer on public.villegram_comments(offer_id,created_at desc);
create index villegram_comments_author on public.villegram_comments(user_id,created_at desc);
alter table public.villegram_likes enable row level security;
alter table public.villegram_comments enable row level security;
revoke all on public.villegram_likes,public.villegram_comments from anon,authenticated;
grant all on public.villegram_likes,public.villegram_comments to service_role;
-- Writes only through the existing authenticated booking engine, with moderation and limits.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('villegram-audio','villegram-audio',true,10485760,array['audio/mpeg','audio/mp4','audio/ogg','audio/wav'])
on conflict(id) do nothing;
create policy villegram_audio_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='villegram-audio' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and pms_access_status='active'));
-- Commit the processed image reference across public media, without changing contracts.
create function public.villegram_replace_media(p_old text,p_new text) returns void language plpgsql security invoker set search_path=public as $$
begin
 update properties set cover_image=case when cover_image=p_old then p_new else cover_image end,
 gallery=replace(gallery::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,updated_at=now()
 where cover_image=p_old or gallery::text like '%'||p_old||'%';
 update experience_media set media_url=p_new where media_url=p_old;
 update stay_offers set media=replace(media::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,
 villegram=replace(villegram::text,to_jsonb(p_old)::text,to_jsonb(p_new)::text)::jsonb,updated_at=now()
 where media::text like '%'||p_old||'%' or villegram::text like '%'||p_old||'%';
end $$;
revoke all on function public.villegram_replace_media(text,text) from public,anon,authenticated;
grant execute on function public.villegram_replace_media(text,text) to service_role;
