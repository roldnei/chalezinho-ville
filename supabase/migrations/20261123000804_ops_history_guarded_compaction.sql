-- Temporary, owner-only maintenance entry point. Removed after verified cleanup.
create function ops_private.compact_verified_history(
 p_from bigint,p_to bigint,p_expected_rows bigint,p_expected_sha256 text
) returns bigint language plpgsql security invoker set search_path='' as $$
declare actual_rows bigint;actual_sha256 text;deleted_rows bigint;
begin
 if current_user <> 'postgres' then raise exception 'database_owner_required';end if;
 if p_from<0 or p_to<=p_from or p_to-p_from>50000 or p_expected_rows<0
  or p_expected_sha256 is null then raise exception 'invalid_compaction_range';end if;
 perform pg_advisory_xact_lock(hashtext('ops_history_verified_compaction'));
 perform set_config('lock_timeout','3s',true);

 with candidates as materialized (
  select * from public.ops_history where id>p_from and id<=p_to
   and entity='ops_calendar_events' and operation='UPDATE'
   and before_value is not null and after_value is not null
   and before_value ?& array['last_seen_at','missing_count']
   and after_value ?& array['last_seen_at','missing_count']
   and (before_value-array['last_seen_at','missing_count'])=
       (after_value-array['last_seen_at','missing_count'])
 ), grouped as (
  select entity_id,actor_id,before_value-array['last_seen_at','missing_count'] as base,
   jsonb_agg(jsonb_build_array(id,created_at,before_value->'last_seen_at',
    before_value->'missing_count',after_value->'last_seen_at',
    after_value->'missing_count') order by id) as entries,min(id) as first_id
  from candidates group by entity_id,actor_id,before_value-array['last_seen_at','missing_count']
 ), archive as (
  select jsonb_build_object('format','ops-history-archive-v1','entity','ops_calendar_events',
   'operation','UPDATE','row_count',(select count(*) from candidates),
   'groups',coalesce(jsonb_agg(to_jsonb(grouped)-'first_id' order by first_id),'[]'::jsonb))::text as plaintext
  from grouped
 ) select (select count(*) from candidates),encode(sha256(convert_to(plaintext,'UTF8')),'hex')
  into actual_rows,actual_sha256 from archive;
 if actual_rows<>p_expected_rows or actual_sha256<>p_expected_sha256 then
  raise exception 'verified_archive_does_not_match';
 end if;

 -- DDL and DELETE share a transaction; any error restores the immutable trigger.
 alter table public.ops_history disable trigger ops_history_immutable;
 delete from public.ops_history where id>p_from and id<=p_to
  and entity='ops_calendar_events' and operation='UPDATE'
  and before_value is not null and after_value is not null
  and before_value ?& array['last_seen_at','missing_count']
  and after_value ?& array['last_seen_at','missing_count']
  and (before_value-array['last_seen_at','missing_count'])=
      (after_value-array['last_seen_at','missing_count']);
 get diagnostics deleted_rows=row_count;
 alter table public.ops_history enable trigger ops_history_immutable;
 if deleted_rows<>p_expected_rows then raise exception 'compaction_count_mismatch';end if;
 return deleted_rows;
end $$;
revoke all on function ops_private.compact_verified_history(bigint,bigint,bigint,text)
 from public,anon,authenticated,service_role;
