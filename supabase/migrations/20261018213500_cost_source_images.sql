-- Screenshots supplied by the owner can be preserved as private evidence,
-- beside the existing UTF-8 CSV platform statements.
alter table public.cost_source_documents alter column content drop not null;
alter table public.cost_source_documents add column body_base64 text;
alter table public.cost_source_documents drop constraint cost_source_documents_mime_type_check;
alter table public.cost_source_documents drop constraint cost_source_documents_check;
alter table public.cost_source_documents add constraint cost_source_documents_payload_check check (
 (mime_type='text/csv' and content is not null and body_base64 is null and octet_length(content)=size_bytes)
 or
 (mime_type='image/jpeg' and content is null and body_base64 is not null and octet_length(decode(body_base64,'base64'))=size_bytes)
);
