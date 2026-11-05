-- New DEV quotes opt into this check. Existing acceptances are immutable and
-- remain readable even after the active assignment moves to a newer version.
create function public.guard_quoted_cancellation_policy_acceptance()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_scope text;
  v_rate text;
  v_quoted uuid;
  v_current uuid;
begin
  if not exists(select 1 from public.policy_documents d
    where d.id = new.document_id and d.document_type = 'cancellation_policy') then
    return new;
  end if;

  select q.pricing_snapshot->>'cancellation_policy_scope', r.rate_plan_code, o.cancellation_policy_id
    into v_scope, v_rate, v_quoted
    from public.reservations r
    join public.quote_options o on o.id = r.quote_option_id
    join public.quotes q on q.id = o.quote_id
    where r.id = new.reservation_id;
  if v_scope is distinct from 'development' then
    return new;
  end if;

  -- The publication transaction changes this assignment row. A shared lock
  -- orders a simultaneous acceptance either before or after that publication.
  select rule.document_id into v_current
    from public.cancellation_policy_assignments a
    join public.cancellation_policy_rules rule on rule.id = a.rule_id
    where a.environment = v_scope and a.rate_plan_code = v_rate
      and rule.rate_plan_code = v_rate
    for share of a;
  if v_current is null or new.document_id is distinct from v_current
    or new.document_id is distinct from v_quoted then
    raise exception 'cancellation_policy_version_changed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_quoted_cancellation_policy_acceptance() from public, anon, authenticated;
create trigger a_guard_quoted_cancellation_policy_acceptance
before insert on public.reservation_policy_acceptances
for each row execute function public.guard_quoted_cancellation_policy_acceptance();
