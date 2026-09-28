-- Copy only what the earlier attempts actually retained. Their response
-- bodies and numeric POST summaries were never stored and cannot be inferred.
alter table public.reservation_refund_provider_observations
  add column if not exists evidence_origin text not null default 'live_response'
  check(evidence_origin in ('live_response','historical_attempt'));

insert into public.reservation_refund_provider_observations(
  refund_id,phase,source,charge_id,http_status,error_code,observed_at,evidence_origin)
select a.refund_id,'post','charge',r.charge_id,
  substring(a.provider_status from 'http_([1-5][0-9][0-9])')::integer,
  nullif(substring(a.provider_status from '_code_([a-zA-Z0-9_]+)$'),''),
  a.created_at,'historical_attempt'
from public.reservation_refund_attempts a
join public.reservation_refunds r on r.id=a.refund_id
where a.event='request_uncertain'
  and a.provider_status ~ '^pagbank_charge_operation_http_[1-5][0-9][0-9](_code_[a-zA-Z0-9_]+)?$'
  and not exists(select 1 from public.reservation_refund_provider_observations o
    where o.refund_id=a.refund_id and o.phase='post' and o.evidence_origin='historical_attempt');
