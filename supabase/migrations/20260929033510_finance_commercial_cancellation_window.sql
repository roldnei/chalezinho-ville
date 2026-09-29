-- Local/development only. Existing accepted rules retain their exact old behavior.
alter table public.cancellation_policy_rules add column commercial_free_cancellation_hours integer not null default 0
 check(commercial_free_cancellation_hours between 0 and 720);
-- Rules, like their accepted documents, must never be edited in place.
create trigger cancellation_policy_rules_immutable before update or delete on public.cancellation_policy_rules
for each row execute function public.finance_immutable();

create or replace function public.save_finance_cancellation_policy(
  p_rate_plan_code text, p_withdrawal_days integer, p_commercial_free_hours integer,
  p_full_refund_days_before_checkin integer, p_late_accommodation_refund_percent integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.rate_plans%rowtype;
  v_version text;
  v_document_id uuid;
  v_rule_id uuid;
  v_body text;
begin
  if p_rate_plan_code is null or p_withdrawal_days is null or p_commercial_free_hours is null
    or p_full_refund_days_before_checkin is null or p_late_accommodation_refund_percent is null
    or p_commercial_free_hours not between 0 and 720 or p_rate_plan_code not in ('refundable','non_refundable')
    or p_withdrawal_days not between 7 and 30
    or p_full_refund_days_before_checkin not between 1 and 365
    or p_late_accommodation_refund_percent not between 0 and 100
    or (p_rate_plan_code='non_refundable' and p_late_accommodation_refund_percent<>0) then
    raise exception 'invalid_policy_configuration';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('development_cancellation_policy'));
  select * into v_plan from public.rate_plans where code=p_rate_plan_code and active=true;
  if not found then raise exception 'rate_plan_not_found'; end if;
  select '1.'||(coalesce(max((substring(version from '^1\.([0-9]+)$'))::integer),0)+1)::text
    into v_version from public.policy_documents
    where code=p_rate_plan_code||'_v1' and version ~ '^1\.[0-9]+$';
  v_body := 'Política de cancelamento — '||v_plan.name||E'\n\n'
    ||'Cancelamento comercial gratuito: até '||p_commercial_free_hours||' horas corridas após a contratação original, antes do início da estadia, para ambas as tarifas. Esta janela não limita direitos legais nem os prazos mais favoráveis descritos abaixo.'||E'\n\n'
    ||'O hóspede pode desistir em até '||p_withdrawal_days||' dias corridos após a contratação, com devolução integral dos valores pagos, inclusive hospedagem, limpeza e experiências. Essa regra também vale para a tarifa não reembolsável. Direitos legais prevalecem. Se a estadia começar nesse período, o pedido será analisado conforme a legislação aplicável, sem recusa automática.'||E'\n\n'
    ||case when p_rate_plan_code='refundable' then
       'Depois desse prazo, pedidos feitos até '||p_full_refund_days_before_checkin||' dias completos antes do check-in têm devolução integral. Após esse marco e antes do check-in, devolvemos '||p_late_accommodation_refund_percent||'% da hospedagem, 100% da limpeza e das experiências não prestadas.'
      else
       'Depois desse prazo, a desistência voluntária antes do check-in não devolve o valor da hospedagem. Devolvemos 100% da limpeza e das experiências não prestadas.' end||E'\n\n'
    ||'Solicite o cancelamento pela área da reserva ou pelo canal de atendimento da confirmação, guardando o protocolo. A remarcação não reinicia o prazo contado da contratação original. Casos de saída antecipada, força maior, falha do serviço e outras garantias legais são avaliados individualmente. Em alterações de datas, se a nova cotação for maior, cobra-se somente a diferença; se for menor, não há devolução da diferença, desde que o hóspede concorde expressamente antes da alteração.';
  insert into public.policy_documents(document_type,code,version,title,body,status)
  values ('cancellation_policy',p_rate_plan_code||'_v1',v_version,'Política de cancelamento — '||v_plan.name,v_body,'draft')
  returning id into v_document_id;
  insert into public.cancellation_policy_rules(document_id,rate_plan_code,withdrawal_days,commercial_free_cancellation_hours,full_refund_days_before_checkin,late_accommodation_refund_percent)
  values(v_document_id,p_rate_plan_code,p_withdrawal_days,p_commercial_free_hours,p_full_refund_days_before_checkin,p_late_accommodation_refund_percent)
  returning id into v_rule_id;
  insert into public.cancellation_policy_assignments(environment,rate_plan_code,rule_id)
  values('development',p_rate_plan_code,v_rule_id)
  on conflict(environment,rate_plan_code) do update set rule_id=excluded.rule_id,updated_at=now();
  return v_document_id;
end;
$$;
revoke all on function public.save_finance_cancellation_policy(text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.save_finance_cancellation_policy(text,integer,integer,integer,integer) to service_role;

-- New development quotations get an explicit 24h commercial window. Accepted
-- document IDs and rules stay immutable, including the additional legacy window.
do $$ declare r record; begin
 for r in select rules.* from public.cancellation_policy_assignments a
 join public.cancellation_policy_rules rules on rules.id=a.rule_id where a.environment='development'
 loop
  perform public.save_finance_cancellation_policy(r.rate_plan_code,r.withdrawal_days,24,
    r.full_refund_days_before_checkin,r.late_accommodation_refund_percent);
 end loop;
end $$;
