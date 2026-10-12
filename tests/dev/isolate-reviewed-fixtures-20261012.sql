-- DEV ONLY. Explicit records reviewed on 2026-10-12 after owner reported
-- nonexistent November bookings. Never infer fixtures from guest names at runtime.
-- Not included in the production migration bundle.
begin;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='ops_project_url' and decrypted_secret='https://pxfqmnhqodqyaaqeyjgr.supabase.co') then raise exception 'DEV target required'; end if;
end $$;
update public.ops_stays set is_test=true
where id in (
 '6d8909a8-c994-4ea4-9e96-f3cc567e28fe'::uuid,
 '39791242-d4c4-4561-867a-0699ed7972aa'::uuid,
 'aa97ad03-797e-4e4d-a0b2-04aaba53c9d2'::uuid,
 'c3082672-73bf-4261-b6aa-a9144597e90b'::uuid,
 '49d0c6c2-fa70-42c7-8aa0-3a12867b42cd'::uuid,
 '364f63cd-1b9f-4513-9ae4-c3205d139adc'::uuid,
 '65a61a78-d65d-417f-9fd9-10cdb3fc0117'::uuid,
 '5a6eab12-40fe-4e27-8843-4c94254092c7'::uuid,
 '5f012780-3156-4793-a77d-8ac75ef518da'::uuid,
 '6175801e-fc11-4609-9060-f17ed7e32c3d'::uuid,
 'd56c4da8-1b32-4797-a7bd-e885d2c075e0'::uuid,
 'f18fee76-1dfd-4d7f-b902-f4d4bcafbe22'::uuid,
 '8cb82089-9260-4a02-acac-4e9f9a1d523a'::uuid,
 'd28422e8-8792-4773-8a79-280651fdd726'::uuid,
 '205af121-dec6-4d86-bd45-4241c350f31b'::uuid,
 '07c6e43a-2a31-495b-bec5-89124233bc7f'::uuid,
 '4cc7ad0a-2a63-4a8b-ba0a-b81077fcc758'::uuid,
 'a68fa09e-f9e0-4e6b-80b9-2a34509551f1'::uuid,
 'd684c67d-f94e-46b9-be9f-debbe5ef5ecd'::uuid,
 'e25ccad6-3c50-41d6-99ce-fe10165d0bd1'::uuid,
 '084aa662-fcd3-4f93-bd93-c420d8390140'::uuid,
 '54acab44-0c85-448a-a6b7-8eca8a6410d9'::uuid
) and not is_test;
select public.ops_refresh_tasks();
commit;
