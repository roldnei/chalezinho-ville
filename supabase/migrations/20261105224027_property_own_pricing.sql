alter table public.properties add column own_pricing jsonb;

comment on column public.properties.own_pricing is
  'Tabela própria PMS: weekdays_cents em ordem domingo-sábado; periods com início e fim inclusivos.';

create function private.guard_property_own_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pricing jsonb := new.own_pricing;
  item jsonb;
  previous_end date;
  first_day date;
  last_day date;
  value_cents numeric;
  discount_kind text;
  discount_days numeric;
  min_days integer;
  max_days integer;
  kinds text[] := '{}';
begin
  if pricing is null then
    -- Existing active properties can continue using their existing integration.
    if new.active and (tg_op = 'INSERT' or not old.active or old.own_pricing is not null) then
      raise exception 'own_pricing_required' using errcode = '23514';
    end if;
    return new;
  end if;

  if jsonb_typeof(pricing -> 'weekdays_cents') is distinct from 'array'
     or jsonb_typeof(pricing -> 'periods') is distinct from 'array' then
    raise exception 'invalid_own_pricing' using errcode = '23514';
  end if;
  if jsonb_array_length(pricing -> 'weekdays_cents') <> 7
     or jsonb_array_length(pricing -> 'periods') > 1000 then
    raise exception 'invalid_own_pricing' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(pricing -> 'weekdays_cents')
  loop
    if jsonb_typeof(item) <> 'number' then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
    value_cents := (item #>> '{}')::numeric;
    if value_cents <> trunc(value_cents) or value_cents not between 1 and 10000000 then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(pricing -> 'periods') order by value ->> 'start'
  loop
    if jsonb_typeof(item -> 'cents') is distinct from 'number'
       or coalesce(item ->> 'start', '') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
       or coalesce(item ->> 'end', '') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
    first_day := (item ->> 'start')::date;
    last_day := (item ->> 'end')::date;
    value_cents := (item ->> 'cents')::numeric;
    if last_day < first_day or value_cents <> trunc(value_cents)
       or value_cents not between 1 and 10000000 then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
    if first_day <= previous_end then
      raise exception 'overlapping_own_pricing' using errcode = '23514';
    end if;
    previous_end := last_day;
  end loop;
  if pricing ? 'mode' and (pricing ->> 'mode' is null or pricing ->> 'mode' not in ('own','auto')) then
    raise exception 'invalid_own_pricing' using errcode = '23514';
  end if;
  if pricing ? 'discounts' then
    if jsonb_typeof(pricing -> 'discounts') is distinct from 'array' then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
    if jsonb_array_length(pricing -> 'discounts') > 4 then
      raise exception 'invalid_own_pricing' using errcode = '23514';
    end if;
    for item in select value from jsonb_array_elements(pricing -> 'discounts')
    loop
      discount_kind := item ->> 'kind';
      if discount_kind is null or discount_kind = any(kinds)
         or discount_kind not in ('weekly','monthly','advance','last_minute')
         or jsonb_typeof(item -> 'bps') is distinct from 'number'
         or jsonb_typeof(item -> 'days') is distinct from 'number' then
        raise exception 'invalid_own_pricing' using errcode = '23514';
      end if;
      kinds := array_append(kinds, discount_kind);
      min_days := case discount_kind when 'weekly' then 7 when 'monthly' then 28 when 'advance' then 1 else 0 end;
      max_days := case when discount_kind in ('weekly','monthly') then 1125 else 365 end;
      discount_days := (item ->> 'days')::numeric;
      value_cents := (item ->> 'bps')::numeric;
      if discount_days <> trunc(discount_days) or discount_days not between min_days and max_days
         or value_cents <> trunc(value_cents) or value_cents not between 1 and 9900 then
        raise exception 'invalid_own_pricing' using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_property_own_pricing() from public, anon, authenticated;

create trigger property_own_pricing_guard
before insert or update of active, own_pricing on public.properties
for each row execute function private.guard_property_own_pricing();
