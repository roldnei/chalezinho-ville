-- Cover actor foreign keys used by audit and cleanup operations.

create index if not exists pms_calendar_blocks_created_by_idx
  on public.pms_calendar_blocks(created_by) where created_by is not null;

create index if not exists pms_calendar_blocks_cancelled_by_idx
  on public.pms_calendar_blocks(cancelled_by) where cancelled_by is not null;
