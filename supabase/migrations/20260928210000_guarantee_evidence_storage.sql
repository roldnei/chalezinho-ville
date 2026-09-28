-- Evidence is private, immutable through the client, and readable only by admins.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('guarantee-evidence','guarantee-evidence',false,8388608,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "guarantee_evidence_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id='guarantee-evidence' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));

create policy "guarantee_evidence_admin_select" on storage.objects
for select to authenticated
using (bucket_id='guarantee-evidence' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));
