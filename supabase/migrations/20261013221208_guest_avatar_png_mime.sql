-- Avatar output can be PNG on browsers without the requested canvas encoder.
-- Add the image type while preserving the private bucket, limits and other MIME types.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/png')
where id = 'villegram-media'
  and allowed_mime_types is not null
  and not ('image/png' = any(allowed_mime_types));
