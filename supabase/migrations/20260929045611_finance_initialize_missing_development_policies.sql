-- Fresh isolated databases may lack policies formerly inserted through the admin UI.
-- Initialize only missing development assignments; preserve every existing choice.
do $$
declare p record;
begin
  for p in select code from public.rate_plans
    where active and code in ('refundable','non_refundable')
  loop
    if not exists(select 1 from public.cancellation_policy_assignments
      where environment='development' and rate_plan_code=p.code) then
      perform public.save_finance_cancellation_policy(p.code,7,24,20,
        case when p.code='refundable' then 50 else 0 end);
    end if;
  end loop;
end $$;
