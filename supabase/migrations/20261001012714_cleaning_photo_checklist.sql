-- Private evidence, separate from issue attachments. Only the authenticated Edge API writes.
create table public.pms_task_photos (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.pms_tasks(id) on delete cascade,
 point_key text not null check (point_key in ('glasses','drain','tub','bath_towels','face_towels','bed','bathroom')),
 storage_path text not null unique,
 content_type text not null check(content_type in ('image/jpeg','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 524288),
 uploaded_by uuid not null references auth.users(id),
 uploaded_name text not null,
 created_at timestamptz not null default now(),
 unique(task_id,point_key)
);
alter table public.pms_task_photos enable row level security;
revoke all on public.pms_task_photos from public,anon,authenticated;
grant all on public.pms_task_photos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cleaning-evidence','cleaning-evidence',false,524288,array['image/jpeg','image/webp']);

-- Lock the parent row so photo replacement and inspection cannot race.
create function public.guard_cleaning_photo() returns trigger language plpgsql set search_path=public as $$
declare t public.pms_tasks;
begin
 select * into t from public.pms_tasks where id=new.task_id for update;
 if t.task_type<>'turnover' or t.status not in ('todo','in_progress','blocked') then
  raise exception 'task_photos_locked';
 end if;
 if tg_op='UPDATE' and (new.task_id<>old.task_id or new.point_key<>old.point_key) then raise exception 'invalid_photo'; end if;
 return new;
end $$;
create trigger guard_cleaning_photo before insert or update on public.pms_task_photos for each row execute function public.guard_cleaning_photo();

create function public.require_cleaning_photos() returns trigger language plpgsql set search_path=public as $$
begin
 if new.task_type='turnover' and new.status in ('inspection','ready') and new.status is distinct from old.status then
  if (select count(distinct point_key) from public.pms_task_photos where task_id=new.id)<>7 then
   raise exception 'cleaning_photos_incomplete';
  end if;
 end if;
 return new;
end $$;
create trigger require_cleaning_photos before update on public.pms_tasks for each row execute function public.require_cleaning_photos();
revoke all on function public.guard_cleaning_photo(),public.require_cleaning_photos() from public,anon,authenticated;
