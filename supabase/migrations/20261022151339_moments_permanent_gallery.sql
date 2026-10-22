begin;
-- Trusted service computes popularity from deduplicated first-view records.
create function public.villegram_gallery_views(post_ids uuid[]) returns table(publication_id uuid,views bigint) language sql stable security invoker set search_path='' as $$
 select s.publication_id,count(distinct s.view_id) from public.villegram_signals s
 where s.kind='view' and s.publication_id=any(post_ids) group by s.publication_id;
$$;
revoke all on function public.villegram_gallery_views(uuid[]) from public,anon,authenticated;
grant execute on function public.villegram_gallery_views(uuid[]) to service_role;
commit;
