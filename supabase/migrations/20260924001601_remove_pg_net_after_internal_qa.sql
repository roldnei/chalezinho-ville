-- 20260924001601_remove_pg_net_after_internal_qa.sql
-- pg_net was enabled only for internal asynchronous HTTP smoke tests.
drop extension if exists pg_net cascade;
