# Operational history retention

Calendar ingestion, inventory, tasks and financial functions remain unchanged.
Only `ops_private.audit()` treats UPDATEs to `ops_calendar_events` specially:
when removing `last_seen_at` and `missing_count` makes the old/new records equal,
it increments a private per-event daily technical summary instead of duplicating
the entire event in `ops_history`. INSERTs and changes to any other field retain
the existing full audit. In particular, divergence changes, cancellation,
classification, dates, provider sequence and stay links remain fully audited.
Other entities retain their existing audit semantics, including no-op UPDATEs.

Summaries retain 30 days. Only the existing backend service role has table access;
the schema is not exposed to browser roles. A daily pg_cron job expires summaries.
No historical business record is expired automatically.

One-time cleanup requires a verified lossless compressed export of each bounded
ID range. Only non-null calendar UPDATE snapshots equal after excluding the two
technical fields qualify. Historical immutable protection is restored inside
the same transaction as every bounded delete. Never disable triggers globally,
rewrite operational rows or delete audit entries of other entities.

Compaction archives use OpenPGP AES256 with zlib compression through pgcrypto.
The format passphrase `ops-history-archive-v1` is a container convention, not a
security boundary. Keep backups private. Each group contains a shared base JSON
snapshot and entries `[id,created_at,before_last_seen,before_missing_count,
after_last_seen,after_missing_count]`. Both technical keys must exist in both
snapshots. Group metadata preserves entity_id and actor_id. Reconstruct before
and after by merging the base and the respective technical values; entity is
`ops_calendar_events`, operation is `UPDATE`. This is lossless JSONB storage.
Archives are validated through decryption, row counts and a SHA256 over their
canonical plaintext before any corresponding audit rows can be removed.

After deletion, targeted VACUUM FULL may reclaim physical space. It exclusively
locks only the history table; use SKIP_LOCKED to avoid waiting for another transaction and verify operational
snapshots and function hashes afterward. Ordinary autovacuum is insufficient to
guarantee immediate shrinking of the physical file.
