-- Preserve the original platform CSV as private documentary evidence.
create unique index cost_entries_platform_reference_unique
 on public.cost_entries(channel,external_reference)
 where category='platform_commission' and channel is not null and external_reference is not null;

alter table public.cost_receipts drop constraint cost_receipts_mime_type_check;
alter table public.cost_receipts add constraint cost_receipts_mime_type_check
 check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/csv'));
alter table public.cost_receipts drop constraint cost_receipts_check;
alter table public.cost_receipts add constraint cost_receipts_check
 check(object_path=expense_id::text||'/'||id::text||case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' when 'text/csv' then '.csv' else '.pdf' end);
update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'text/csv')
 where id='cost-receipts' and not ('text/csv'=any(allowed_mime_types));
