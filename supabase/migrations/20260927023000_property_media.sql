-- Publicly displayed property images; only admins can upload original files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('property-media','property-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "property_media_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id='property-media' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));

create policy "property_media_admin_delete" on storage.objects
for delete to authenticated
using (bucket_id='property-media' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));
