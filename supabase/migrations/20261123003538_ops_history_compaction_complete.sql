-- Owner-only compaction was verified in DEV and PROD; retain no maintenance entry point.
set local lock_timeout='3s';
drop function if exists ops_private.compact_verified_history(bigint,bigint,bigint,text);
