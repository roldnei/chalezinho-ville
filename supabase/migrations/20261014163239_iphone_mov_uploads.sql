-- Accept QuickTime without changing ownership, publishing rights or size limits.
update storage.buckets set allowed_mime_types=array(select distinct unnest(allowed_mime_types || array['video/quicktime'])) where id='villegram-media' and allowed_mime_types is not null;
alter policy villegram_guest_upload on storage.objects with check (
 bucket_id='villegram-media' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.villegram_profiles p where p.id=(select auth.uid()) and p.is_public and (p.can_post or name ~ '[.](webp|jpg)$'))
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.](webp|jpg|mp4|webm|mov)$'
);
