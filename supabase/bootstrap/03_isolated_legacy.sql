-- Historical: 20260925021101 phase1_operations_notifications_hardening
create index if not exists post_booking_cart_items_target_variant_idx
  on public.post_booking_cart_items(target_variant_id);

insert into public.property_integrations(property_id,provider,environment_key,active)
select p.id,'booking',case p.code
  when 'CH1' then 'ICAL_BOOKING_CH1'
  when 'CH2' then 'ICAL_BOOKING_CH2'
  when 'CH3' then 'ICAL_BOOKING_CH3'
end,true
from public.properties p
where p.code in ('CH1','CH2','CH3')
  and not exists (
    select 1 from public.property_integrations i
    where i.property_id=p.id and i.provider='booking'
  );

alter table public.notification_outbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_attempt_count_check;
alter table public.notification_outbox
  add constraint notification_outbox_attempt_count_check
  check (attempt_count between 0 and max_attempts and max_attempts between 1 and 20);

create or replace function public.enqueue_phase1_notification_events()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_template text;
  v_user uuid;
  v_reservation uuid;
  v_send_after timestamptz:=now();
  v_payload jsonb:='{}'::jsonb;
  v_key text;
begin
  if tg_table_name='payments' then
    v_user:=new.user_id; v_reservation:=new.reservation_id;
    if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
    v_template:=case new.status
      when 'awaiting_payment' then 'payment_awaiting'
      when 'under_review' then 'payment_under_review'
      when 'paid' then 'payment_paid'
      when 'refused' then 'payment_refused'
      when 'expired' then 'payment_expired'
      when 'refunded' then 'payment_refunded'
      else null end;
    v_payload:=jsonb_build_object('payment_id',new.id,'amount_cents',new.amount_cents,'method',new.method,'status',new.status);
    v_key:='payment:'||new.id::text||':'||new.status;
  elsif tg_table_name='reservations' then
    if new.status<>'confirmed' or (tg_op='UPDATE' and old.status='confirmed') then return new; end if;
    v_template:='reservation_confirmed'; v_user:=new.user_id; v_reservation:=new.id;
    v_payload:=jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'check_out',new.check_out,'total_amount_cents',new.total_amount);
    v_key:='reservation:'||new.id::text||':confirmed';
  elsif tg_table_name='modification_requests' then
    if tg_op<>'INSERT' then return new; end if;
    v_template:='modification_requested'; v_user:=new.user_id; v_reservation:=new.reservation_id;
    v_payload:=jsonb_build_object('request_id',new.id,'requested_check_in',new.requested_check_in,'requested_check_out',new.requested_check_out);
    v_key:='modification:'||new.id::text||':requested';
  elsif tg_table_name='post_booking_charges' then
    if new.status<>'applied' or (tg_op='UPDATE' and old.status='applied') then return new; end if;
    if new.kind not in ('experience','upgrade') then return new; end if;
    v_template:=case when new.kind='upgrade' then 'experience_upgrade_paid' else 'experience_added_paid' end;
    v_user:=new.user_id; v_reservation:=new.reservation_id;
    v_payload:=jsonb_build_object('charge_id',new.id,'kind',new.kind,'description',new.description,'amount_cents',new.amount_cents);
    v_key:='charge:'||new.id::text||':applied';
  end if;

  if v_template is not null then
    insert into public.notification_outbox(user_id,reservation_id,charge_id,template_code,send_after,payload,dedupe_key)
    values(v_user,v_reservation,case when tg_table_name='post_booking_charges' then new.id else null end,v_template,v_send_after,v_payload,v_key)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists phase1_payment_notification_events on public.payments;
create trigger phase1_payment_notification_events
after insert or update of status on public.payments
for each row execute function public.enqueue_phase1_notification_events();

drop trigger if exists phase1_reservation_notification_events on public.reservations;
create trigger phase1_reservation_notification_events
after insert or update of status on public.reservations
for each row execute function public.enqueue_phase1_notification_events();

drop trigger if exists phase1_modification_notification_events on public.modification_requests;
create trigger phase1_modification_notification_events
after insert on public.modification_requests
for each row execute function public.enqueue_phase1_notification_events();

drop trigger if exists phase1_charge_notification_events on public.post_booking_charges;
create trigger phase1_charge_notification_events
after insert or update of status on public.post_booking_charges
for each row execute function public.enqueue_phase1_notification_events();

revoke all on function public.enqueue_phase1_notification_events() from public,anon,authenticated;
grant execute on function public.enqueue_phase1_notification_events() to service_role;;

-- Historical: 20260925021532 revoke_unsafe_guest_table_privileges
revoke insert,update,delete,truncate,references,trigger
on all tables in schema public
from anon,authenticated;

grant update(full_name,phone) on public.profiles to authenticated;
grant insert on public.account_deletion_requests to authenticated;;

-- Historical: 20260925021922 phase1_notification_template_catalog
create table if not exists public.notification_templates(
  code text primary key,
  subject text not null,
  body_text text not null,
  active boolean not null default true,
  provider_managed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_templates enable row level security;
revoke all on public.notification_templates from public,anon,authenticated;
grant all on public.notification_templates to service_role;

insert into public.notification_templates(code,subject,body_text,provider_managed) values
('account_confirmation','Confirme sua conta no Chalezinho Ville','Confirme seu e-mail para concluir a criação da conta e continuar sua reserva.',true),
('password_recovery','Redefina sua senha','Use o link seguro para criar uma nova senha. Se você não pediu esta alteração, ignore esta mensagem.',true),
('reservation_confirmed','Sua reserva está confirmada','Sua reserva {{confirmation_code}} foi confirmada. Consulte datas, experiências, pagamentos e garantia na Área do Hóspede.',false),
('payment_awaiting','Pagamento iniciado','Seu pagamento de {{amount}} foi iniciado. Conclua-o pelo site dentro do prazo apresentado.',false),
('payment_under_review','Pagamento em análise','Recebemos a tentativa de pagamento de {{amount}}. Ela está em análise e nenhuma nova tentativa ou cancelamento fica disponível até a conclusão.',false),
('payment_paid','Pagamento aprovado','Seu pagamento de {{amount}} foi aprovado e aplicado à reserva.',false),
('payment_refused','Pagamento não aprovado','O pagamento não foi aprovado. Quando a cobrança continuar dentro do prazo, tente novamente pelo site.',false),
('payment_expired','Prazo de pagamento encerrado','O prazo desta cobrança terminou. Nenhum item pendente foi aplicado à reserva.',false),
('modification_requested','Recebemos sua solicitação de alteração','Sua solicitação foi enviada para análise. Antes da aprovação, a solicitação não bloqueia nem garante as novas datas e sua reserva original continua válida.',false),
('modification_payment_required','Alteração aprovada — pagamento necessário','A alteração solicitada ainda não está confirmada. Para concluir, realize o pagamento da diferença pelo site até {{payment_due_at}}. As novas datas ficam protegidas somente até esse prazo. Antes da aprovação, a solicitação não garantia as datas.',false),
('modification_payment_reminder','Lembrete: conclua sua alteração','A alteração ainda não está confirmada. Realize o pagamento pelo site até {{payment_due_at}} para concluir.',false),
('modification_cancelled_unpaid','Alteração cancelada por falta de pagamento','O prazo terminou e a alteração foi cancelada. As novas datas foram liberadas e sua reserva original permanece válida.',false),
('experience_added_paid','Experiência adicionada à sua reserva','O pagamento foi aprovado e {{description}} foi adicionada à reserva.',false),
('experience_upgrade_paid','Upgrade confirmado','O pagamento da diferença foi aprovado e o pacote anterior foi substituído por {{description}}.',false),
('pre_stay_important','Informações importantes para sua estadia','Confira na Área do Hóspede as informações da reserva e da garantia antes do check-in.',false)
on conflict(code) do update set subject=excluded.subject,body_text=excluded.body_text,provider_managed=excluded.provider_managed,updated_at=now();;

-- Historical: 20260925021948 schedule_pre_stay_notification_event
create or replace function public.enqueue_phase1_notification_events()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_template text;
  v_user uuid;
  v_reservation uuid;
  v_send_after timestamptz:=now();
  v_payload jsonb:='{}'::jsonb;
  v_key text;
begin
  if tg_table_name='payments' then
    v_user:=new.user_id; v_reservation:=new.reservation_id;
    if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
    v_template:=case new.status
      when 'awaiting_payment' then 'payment_awaiting'
      when 'under_review' then 'payment_under_review'
      when 'paid' then 'payment_paid'
      when 'refused' then 'payment_refused'
      when 'expired' then 'payment_expired'
      when 'refunded' then 'payment_refunded'
      else null end;
    v_payload:=jsonb_build_object('payment_id',new.id,'amount_cents',new.amount_cents,'method',new.method,'status',new.status);
    v_key:='payment:'||new.id::text||':'||new.status;
  elsif tg_table_name='reservations' then
    if new.status<>'confirmed' or (tg_op='UPDATE' and old.status='confirmed') then return new; end if;
    v_template:='reservation_confirmed'; v_user:=new.user_id; v_reservation:=new.id;
    v_payload:=jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'check_out',new.check_out,'total_amount_cents',new.total_amount);
    v_key:='reservation:'||new.id::text||':confirmed';
  elsif tg_table_name='modification_requests' then
    if tg_op<>'INSERT' then return new; end if;
    v_template:='modification_requested'; v_user:=new.user_id; v_reservation:=new.reservation_id;
    v_payload:=jsonb_build_object('request_id',new.id,'requested_check_in',new.requested_check_in,'requested_check_out',new.requested_check_out);
    v_key:='modification:'||new.id::text||':requested';
  elsif tg_table_name='post_booking_charges' then
    if new.status<>'applied' or (tg_op='UPDATE' and old.status='applied') then return new; end if;
    if new.kind not in ('experience','upgrade') then return new; end if;
    v_template:=case when new.kind='upgrade' then 'experience_upgrade_paid' else 'experience_added_paid' end;
    v_user:=new.user_id; v_reservation:=new.reservation_id;
    v_payload:=jsonb_build_object('charge_id',new.id,'kind',new.kind,'description',new.description,'amount_cents',new.amount_cents);
    v_key:='charge:'||new.id::text||':applied';
  end if;

  if v_template is not null then
    insert into public.notification_outbox(user_id,reservation_id,charge_id,template_code,send_after,payload,dedupe_key)
    values(v_user,v_reservation,case when tg_table_name='post_booking_charges' then new.id else null end,v_template,v_send_after,v_payload,v_key)
    on conflict(dedupe_key) do nothing;
  end if;

  if tg_table_name='reservations' and v_template='reservation_confirmed' then
    insert into public.notification_outbox(user_id,reservation_id,template_code,send_after,payload,dedupe_key)
    values(
      new.user_id,new.id,'pre_stay_important',
      greatest(now(),make_timestamptz(extract(year from new.check_in)::int,extract(month from new.check_in)::int,extract(day from new.check_in)::int,15,0,0,'America/Sao_Paulo')-interval '24 hours'),
      jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'action_path','/conta.html'),
      'reservation:'||new.id::text||':pre-stay'
    )
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;

revoke all on function public.enqueue_phase1_notification_events() from public,anon,authenticated;
grant execute on function public.enqueue_phase1_notification_events() to service_role;;

-- Historical: 20260925022012 notification_outbox_delivery_contract
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check
check(status in ('queued','processing','sent','failed','cancelled'));

create or replace function public.claim_notification_outbox(p_limit integer default 20)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  return query
  with picked as (
    select id from public.notification_outbox
    where status='queued' and send_after<=now() and attempt_count<max_attempts
    order by send_after,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update public.notification_outbox o
  set status='processing',attempt_count=o.attempt_count+1,last_attempt_at=now(),last_error=null
  from picked p where o.id=p.id
  returning o.*;
end $$;

create or replace function public.complete_notification_outbox(
  p_id uuid,p_sent boolean,p_error text default null,p_retry_after_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare o public.notification_outbox%rowtype; v_status text;
begin
  select * into o from public.notification_outbox where id=p_id for update;
  if not found then raise exception 'notification_not_found'; end if;
  if o.status='sent' then return 'sent'; end if;
  if o.status<>'processing' then raise exception 'notification_not_processing'; end if;
  if p_sent then
    update public.notification_outbox set status='sent',sent_at=now(),last_error=null where id=o.id;
    return 'sent';
  end if;
  v_status:=case when o.attempt_count>=o.max_attempts then 'failed' else 'queued' end;
  update public.notification_outbox
  set status=v_status,last_error=left(coalesce(p_error,'provider_error'),1000),
      send_after=case when v_status='queued' then now()+make_interval(secs=>greatest(30,least(coalesce(p_retry_after_seconds,300),86400))) else send_after end
  where id=o.id;
  return v_status;
end $$;

revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.complete_notification_outbox(uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.complete_notification_outbox(uuid,boolean,text,integer) to service_role;;

-- Historical: 20260925104735 notification_event_coverage
-- Complete the provider-agnostic notification contract for Phase 1.
insert into public.notification_templates(code,subject,body_text,provider_managed) values
('payment_refunded','Pagamento estornado','O estorno de {{amount}} foi registrado. Consulte os detalhes do pagamento na Área do Hóspede.',false),
('modification_rejected','Solicitação de alteração não aprovada','A solicitação de alteração não foi aprovada. Sua reserva original continua válida e nenhuma nova data foi confirmada.',false),
('modification_approved_confirmation','Alteração aprovada — confirme pelo site','A alteração foi aprovada sem valor adicional. Ela ainda não está confirmada: revise e confirme a alteração pela Área do Hóspede.',false),
('modification_confirmed','Alteração de reserva confirmada','Sua alteração foi confirmada. Consulte as novas datas e a propriedade na Área do Hóspede.',false)
on conflict(code) do update set subject=excluded.subject,body_text=excluded.body_text,provider_managed=excluded.provider_managed,active=true,updated_at=now();

create or replace function public.enqueue_phase1_notification_events()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_template text;v_user uuid;v_reservation uuid;v_charge uuid;v_modification uuid;v_payload jsonb:='{}';v_key text;
begin
 if tg_table_name='payments' then
  v_user:=new.user_id;v_reservation:=new.reservation_id;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
  v_template:=case new.status when 'awaiting_payment' then 'payment_awaiting' when 'under_review' then 'payment_under_review' when 'paid' then 'payment_paid' when 'refused' then 'payment_refused' when 'expired' then 'payment_expired' when 'refunded' then 'payment_refunded' end;
  v_payload:=jsonb_build_object('payment_id',new.id,'amount_cents',new.amount_cents,'method',new.method,'status',new.status);
  v_key:='payment:'||new.id::text||':'||new.status;
 elsif tg_table_name='reservations' then
  if new.status<>'confirmed' or (tg_op='UPDATE' and old.status='confirmed') then return new;end if;
  v_template:='reservation_confirmed';v_user:=new.user_id;v_reservation:=new.id;
  v_payload:=jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'check_out',new.check_out,'total_amount_cents',new.total_amount);
  v_key:='reservation:'||new.id::text||':confirmed';
 elsif tg_table_name='modification_requests' then
  if tg_op='INSERT' then v_template:='modification_requested';
  elsif new.status is not distinct from old.status then return new;
  else v_template:=case new.status when 'rejected' then 'modification_rejected' when 'awaiting_guest_acceptance' then 'modification_approved_confirmation' when 'applied' then 'modification_confirmed' end;
  end if;
  v_user:=new.user_id;v_reservation:=new.reservation_id;v_modification:=new.id;
  v_payload:=jsonb_build_object('request_id',new.id,'status',new.status,'requested_property_id',new.requested_property_id,'requested_check_in',new.requested_check_in,'requested_check_out',new.requested_check_out,'amount_cents',new.admin_additional_amount_cents,'payment_due_at',new.payment_due_at);
  v_key:='modification:'||new.id::text||':'||new.status;
 elsif tg_table_name='post_booking_charges' then
  if new.status<>'applied' or (tg_op='UPDATE' and old.status='applied') or new.kind not in ('experience_add','experience_upgrade') then return new;end if;
  v_template:=case when new.kind='experience_upgrade' then 'experience_upgrade_paid' else 'experience_added_paid' end;
  v_user:=new.user_id;v_reservation:=new.reservation_id;v_charge:=new.id;
  v_payload:=jsonb_build_object('charge_id',new.id,'kind',new.kind,'description',new.description,'amount_cents',new.amount_cents);
  v_key:='charge:'||new.id::text||':applied';
 end if;
 if v_template is not null then
  insert into public.notification_outbox(user_id,reservation_id,modification_request_id,charge_id,template_code,send_after,payload,dedupe_key)
  values(v_user,v_reservation,v_modification,v_charge,v_template,now(),v_payload,v_key)
  on conflict(dedupe_key) do nothing;
 end if;
 if tg_table_name='reservations' and v_template='reservation_confirmed' then
  insert into public.notification_outbox(user_id,reservation_id,template_code,send_after,payload,dedupe_key)
  values(new.user_id,new.id,'pre_stay_important',greatest(now(),make_timestamptz(extract(year from new.check_in)::int,extract(month from new.check_in)::int,extract(day from new.check_in)::int,15,0,0,'America/Sao_Paulo')-interval '24 hours'),jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'action_path','/conta.html'),'reservation:'||new.id::text||':pre-stay')
  on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;

drop trigger if exists phase1_modification_notification_events on public.modification_requests;
create trigger phase1_modification_notification_events after insert or update of status on public.modification_requests for each row execute function public.enqueue_phase1_notification_events();
revoke all on function public.enqueue_phase1_notification_events() from public,anon,authenticated;
grant execute on function public.enqueue_phase1_notification_events() to service_role;;

-- Historical: 20260925111546 enable_noite_romantica_upsell
-- Keep the romantic upgrade path continuous after the initial R$ 300 -> R$ 549 upsell.
-- A guest who owns Noite Romantica can therefore buy only the R$ 50 difference
-- to the next active package, Ultra Premium Lua de Mel.

update public.experience_products
set upsell_enabled=true,
    updated_at=now()
where code='noite_romantica_6a7d18'
  and package_type='romantic';;

-- Historical: 20260925114912 separate_reservation_payment_statuses
-- Reserva e pagamento possuem ciclos de vida independentes.
-- Uma tentativa de pagamento que falhou nunca representa cancelamento de uma
-- reserva confirmada.

alter table public.reservations
  add column if not exists not_confirmed_at timestamptz,
  add column if not exists not_confirmed_reason text,
  add column if not exists cancellation_actor text,
  add column if not exists cancellation_reason text,
  add column if not exists no_show_at timestamptz;

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('hold','pending_payment','confirmed','cancelled','expired','not_confirmed','no_show'));

alter table public.reservations
  drop constraint if exists reservations_not_confirmed_reason_check;
alter table public.reservations
  add constraint reservations_not_confirmed_reason_check
  check (
    not_confirmed_reason is null or not_confirmed_reason in (
      'payment_refused','payment_expired','payment_cancelled','hold_expired',
      'checkout_abandoned','technical_failure'
    )
  );

alter table public.reservations
  drop constraint if exists reservations_cancellation_actor_check;
alter table public.reservations
  add constraint reservations_cancellation_actor_check
  check (cancellation_actor is null or cancellation_actor in ('guest','admin','system'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in (
    'awaiting_payment','action_required','processing','under_review','paid',
    'refused','cancelled','expired','partially_refunded','refunded','disputed','chargeback'
  ));

-- Corrige somente tentativas que nunca chegaram a ser reservas confirmadas.
update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.updated_at,now()),
    not_confirmed_reason=case
      when (select p0.status from public.payments p0 where p0.reservation_id=r.id order by p0.created_at desc limit 1)='refused' then 'payment_refused'
      when (select p0.status from public.payments p0 where p0.reservation_id=r.id order by p0.created_at desc limit 1)='expired' then 'payment_expired'
      else 'hold_expired'
    end,
    cancelled_at=null,
    cancellation_actor=null,
    cancellation_reason=null,
    updated_at=now()
where r.status='expired' and r.confirmed_at is null;

update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.cancelled_at,r.updated_at,now()),
    not_confirmed_reason='payment_cancelled',
    cancelled_at=null,
    cancellation_actor=null,
    cancellation_reason=null,
    updated_at=now()
where r.status='cancelled' and r.confirmed_at is null;

-- Registros antigos sem payment row também são tentativas não confirmadas.
update public.reservations r
set status='not_confirmed',
    not_confirmed_at=coalesce(r.updated_at,now()),
    not_confirmed_reason='hold_expired',
    updated_at=now()
where r.status='expired' and r.confirmed_at is null;

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('hold','pending_payment','confirmed','cancelled','not_confirmed','no_show'));

create or replace function public.update_initial_payment_state_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid,
  p_outcome text
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
  v_guarantee bigint;
begin
  if p_outcome not in ('paid','refused','under_review','expired') then
    raise exception 'invalid_outcome';
  end if;

  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.user_id<>p_user_id then raise exception 'not_found'; end if;
  if coalesce(p.metadata->>'kind','')='post_booking_charge' then
    raise exception 'invalid_payment_kind';
  end if;

  select * into r from public.reservations where id=p.reservation_id for update;
  if not found or r.user_id<>p_user_id then raise exception 'not_found'; end if;

  if p.status=p_outcome and (
    (p_outcome='paid' and r.status='confirmed') or
    (p_outcome='under_review' and r.status='pending_payment') or
    (p_outcome='refused' and r.status='not_confirmed' and r.not_confirmed_reason='payment_refused') or
    (p_outcome='expired' and r.status='not_confirmed' and r.not_confirmed_reason='payment_expired')
  ) then
    return query select p.status,r.status,r.id;
    return;
  end if;

  if p.status not in ('awaiting_payment','processing','under_review')
     or r.status not in ('hold','pending_payment') then
    raise exception 'payment_state_final';
  end if;

  if p_outcome='paid' then
    update public.payments set status='paid',updated_at=now() where id=p.id;
    update public.reservations
       set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),hold_expires_at=null,
           not_confirmed_at=null,not_confirmed_reason=null,updated_at=now()
     where id=r.id;
    update public.experience_orders set status='active'
     where reservation_id=r.id and status='pending';

    select coalesce(pr.guarantee_amount_cents,0) into v_guarantee
      from public.properties pr where pr.id=r.property_id;
    if v_guarantee>0 and not exists (
      select 1 from public.guarantees g where g.reservation_id=r.id
    ) then
      insert into public.guarantees(reservation_id,provider,amount_cents,status)
      values(r.id,'mock',v_guarantee,'pending');
    end if;
  elsif p_outcome='under_review' then
    update public.payments set status='under_review',updated_at=now() where id=p.id;
    -- Uma transação em análise mantém a unidade protegida até a decisão do provider.
    update public.reservations
       set status='pending_payment',hold_expires_at=null,updated_at=now()
     where id=r.id;
  else
    update public.payments set status=p_outcome,updated_at=now() where id=p.id;
    update public.reservations
       set status='not_confirmed',hold_expires_at=now(),not_confirmed_at=now(),
           not_confirmed_reason=case when p_outcome='refused' then 'payment_refused' else 'payment_expired' end,
           updated_at=now()
     where id=r.id;
    update public.experience_orders set status='cancelled'
     where reservation_id=r.id and status='pending';
  end if;

  return query select p_outcome,
    case when p_outcome='paid' then 'confirmed'
         when p_outcome='under_review' then 'pending_payment'
         else 'not_confirmed' end,
    r.id;
end;
$function$;

revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from public;
revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from anon;
revoke all on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) from authenticated;
grant execute on function public.update_initial_payment_state_mock_atomic(uuid,uuid,text) to service_role;

create or replace function public.cancel_pending_payment_mock_atomic(
  p_payment_id uuid,
  p_user_id uuid
)
returns table(
  result_payment_status text,
  result_reservation_status text,
  result_reservation_id uuid
)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  p public.payments%rowtype;
  r public.reservations%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.user_id<>p_user_id then raise exception 'not_found'; end if;
  select * into r from public.reservations where id=p.reservation_id for update;

  if p.status='cancelled' and r.status='not_confirmed' and r.not_confirmed_reason='payment_cancelled' then
    return query select p.status,r.status,r.id;
    return;
  end if;
  if p.status<>'awaiting_payment' or r.status not in ('hold','pending_payment') then
    raise exception 'payment_not_cancellable';
  end if;

  update public.payments set status='cancelled',updated_at=now() where id=p.id;
  update public.reservations
     set status='not_confirmed',hold_expires_at=now(),not_confirmed_at=now(),
         not_confirmed_reason='payment_cancelled',updated_at=now()
   where id=r.id;
  update public.experience_orders set status='cancelled'
   where reservation_id=r.id and status='pending';

  return query select 'cancelled'::text,'not_confirmed'::text,r.id;
end;
$function$;

revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from public;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from anon;
revoke all on function public.cancel_pending_payment_mock_atomic(uuid,uuid) from authenticated;
grant execute on function public.cancel_pending_payment_mock_atomic(uuid,uuid) to service_role;

create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path='public'
as $function$
declare v_count integer;
begin
  with due as (
    select r.id
    from public.reservations r
    where r.status in ('hold','pending_payment')
      and r.hold_expires_at is not null
      and r.hold_expires_at<=now()
      and not exists (
        select 1 from public.payments p
        where p.reservation_id=r.id and p.status='under_review'
      )
    for update
  )
  update public.payments p
     set status='expired',updated_at=now()
   where p.reservation_id in (select id from due)
     and p.status in ('awaiting_payment','action_required','processing');

  update public.reservations r
     set status='not_confirmed',not_confirmed_at=now(),
         not_confirmed_reason=case
           when exists(select 1 from public.payments p where p.reservation_id=r.id) then 'payment_expired'
           else 'hold_expired'
         end,
         updated_at=now()
   where r.status in ('hold','pending_payment')
     and r.hold_expires_at is not null
     and r.hold_expires_at<=now()
     and not exists (
       select 1 from public.payments p
       where p.reservation_id=r.id and p.status='under_review'
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.expire_stale_reservations() from public;
revoke all on function public.expire_stale_reservations() from anon;
revoke all on function public.expire_stale_reservations() from authenticated;
grant execute on function public.expire_stale_reservations() to service_role;

create index if not exists reservations_status_created_idx
  on public.reservations(status,created_at desc);
;

-- Historical: 20260925115607 reservation_lifecycle_invariants
-- Protege no banco a semântica exibida ao hóspede.
-- Cancelamento/no-show só podem ocorrer depois de uma confirmação real;
-- tentativas não confirmadas precisam registrar o motivo de encerramento.

alter table public.reservations
  drop constraint if exists reservations_lifecycle_consistency_check;

alter table public.reservations
  add constraint reservations_lifecycle_consistency_check
  check (
    (status not in ('cancelled','no_show') or confirmed_at is not null)
    and
    (status <> 'not_confirmed' or (confirmed_at is null and not_confirmed_reason is not null))
  );
;

-- Historical: 20260925194028 email_delivery_provider_contract
-- Provider-neutral delivery metadata. Provider credentials remain Edge Function secrets.
alter table public.notification_outbox
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz;

create index if not exists notification_outbox_provider_message_idx
  on public.notification_outbox(provider,provider_message_id)
  where provider_message_id is not null;

create table if not exists public.notification_delivery_events(
  id bigint generated always as identity primary key,
  outbox_id uuid references public.notification_outbox(id) on delete set null,
  provider text not null,
  provider_message_id text not null,
  event_type text not null,
  event_hash text not null unique,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notification_delivery_events enable row level security;
revoke all on public.notification_delivery_events from public,anon,authenticated;
grant all on public.notification_delivery_events to service_role;
revoke all on sequence public.notification_delivery_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.notification_delivery_events_id_seq to service_role;

comment on column public.notification_outbox.provider is
  'Delivery adapter used for this message. Changing EMAIL_PROVIDER does not change outbox producers or templates.';;

-- Historical: 20260925222144 admin_operations_hub
-- Central operacional da Fase 1: agenda, check-in/out, notas e alertas internos.

alter table public.properties
  add column if not exists check_in_time time not null default '15:00',
  add column if not exists check_out_time time not null default '11:00',
  add column if not exists timezone text not null default 'America/Sao_Paulo';

alter table public.reservations
  add column if not exists operational_status text not null default 'upcoming',
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_operational_status_check;

alter table public.reservations
  add constraint reservations_operational_status_check
  check (operational_status in ('upcoming','preparing','ready','checked_in','checked_out','attention'));

create table if not exists public.reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists reservation_notes_reservation_created_idx
  on public.reservation_notes (reservation_id, created_at desc);
create index if not exists reservation_notes_author_idx
  on public.reservation_notes (author_user_id) where author_user_id is not null;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  title text not null,
  message text,
  reservation_id uuid references public.reservations(id) on delete cascade,
  entity_type text,
  entity_id text,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_unread_created_idx
  on public.admin_notifications (created_at desc) where read_at is null;
create index if not exists admin_notifications_reservation_idx
  on public.admin_notifications (reservation_id, created_at desc);

alter table public.reservation_notes enable row level security;
alter table public.admin_notifications enable row level security;

revoke all on public.reservation_notes from public, anon, authenticated;
revoke all on public.admin_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.reservation_notes to service_role;
grant select, insert, update, delete on public.admin_notifications to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.enqueue_admin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_title text;
  v_message text;
  v_type text;
  v_severity text := 'info';
  v_dedupe text;
begin
  if tg_table_name = 'reservations' then
    v_reservation_id := new.id;
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      v_type := 'reservation_confirmed'; v_severity := 'success';
      v_title := 'Nova reserva confirmada';
      v_message := coalesce(new.guest_name, 'Hóspede') || ' · ' || new.check_in || ' a ' || new.check_out;
      v_dedupe := 'reservation_confirmed:' || new.id;
    elsif new.status = 'cancelled' and old.status is distinct from new.status then
      v_type := 'reservation_cancelled'; v_severity := 'warning';
      v_title := 'Reserva cancelada';
      v_message := coalesce(new.guest_name, 'Hóspede') || ' · ' || coalesce(new.cancellation_reason, 'Sem motivo informado');
      v_dedupe := 'reservation_cancelled:' || new.id;
    else
      return new;
    end if;
  elsif tg_table_name = 'post_booking_charges' then
    if new.status <> 'applied' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then return new; end if;
    v_reservation_id := new.reservation_id;
    v_type := case when new.kind = 'experience_upgrade' then 'experience_upgrade' else 'experience_added' end;
    v_severity := 'success';
    v_title := case when new.kind = 'experience_upgrade' then 'Upgrade comprado' else 'Experiência comprada' end;
    v_message := coalesce(new.description, 'Pacote adicional') || ' · R$ ' || to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
    v_dedupe := 'post_booking_applied:' || new.id;
  elsif tg_table_name = 'modification_requests' then
    if new.status <> 'requested' or tg_op <> 'INSERT' then return new; end if;
    v_reservation_id := new.reservation_id;
    v_type := 'modification_requested'; v_severity := 'warning';
    v_title := 'Alteração solicitada';
    v_message := 'O hóspede solicitou mudança de data ou propriedade.';
    v_dedupe := 'modification_requested:' || new.id;
  elsif tg_table_name = 'payments' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
    if new.status = 'under_review' then
      v_type := 'payment_under_review'; v_severity := 'warning'; v_title := 'Pagamento em análise';
    elsif new.status = 'refused' then
      v_type := 'payment_refused'; v_severity := 'warning'; v_title := 'Pagamento recusado';
    elsif new.status = 'chargeback' then
      v_type := 'payment_chargeback'; v_severity := 'critical'; v_title := 'Contestação de pagamento';
    else
      return new;
    end if;
    v_reservation_id := new.reservation_id;
    v_message := 'Valor: R$ ' || to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
    v_dedupe := 'payment_status:' || new.id || ':' || new.status;
  elsif tg_table_name = 'incidents' then
    v_type := 'guarantee_incident'; v_severity := 'critical';
    v_title := 'Ocorrência de garantia'; v_message := new.description;
    select g.reservation_id into v_reservation_id from public.guarantees g where g.id = new.guarantee_id;
    v_dedupe := 'guarantee_incident:' || new.id;
  else
    return new;
  end if;

  insert into public.admin_notifications (
    notification_type,severity,title,message,reservation_id,entity_type,entity_id,dedupe_key,payload
  ) values (
    v_type,v_severity,v_title,v_message,v_reservation_id,tg_table_name,new.id::text,v_dedupe,
    jsonb_build_object('source_table',tg_table_name)
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_admin_notification() from public, anon, authenticated;

drop trigger if exists reservations_admin_notification on public.reservations;
create trigger reservations_admin_notification
after insert or update of status on public.reservations
for each row execute function private.enqueue_admin_notification();

drop trigger if exists post_booking_charges_admin_notification on public.post_booking_charges;
create trigger post_booking_charges_admin_notification
after insert or update of status on public.post_booking_charges
for each row execute function private.enqueue_admin_notification();

drop trigger if exists modification_requests_admin_notification on public.modification_requests;
create trigger modification_requests_admin_notification
after insert on public.modification_requests
for each row execute function private.enqueue_admin_notification();

drop trigger if exists payments_admin_notification on public.payments;
create trigger payments_admin_notification
after insert or update of status on public.payments
for each row execute function private.enqueue_admin_notification();

drop trigger if exists incidents_admin_notification on public.incidents;
create trigger incidents_admin_notification
after insert on public.incidents
for each row execute function private.enqueue_admin_notification();
;

-- Historical: 20260925235732 pms_operations_core
-- Independent operational layer for housekeeping, inspections and maintenance.
-- It deliberately does not alter booking or financial state machines.

create table if not exists public.pms_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  task_type text not null check (task_type in ('turnover','inspection','maintenance','setup','guest_request')),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','inspection','ready','blocked','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  scheduled_for timestamptz not null,
  due_at timestamptz,
  assigned_name text,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pms_tasks(id) on delete cascade,
  label text not null,
  display_order integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pms_issues (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  title text not null,
  description text,
  area text,
  severity text not null default 'normal' check (severity in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','scheduled','in_progress','resolved','cancelled')),
  assigned_name text,
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_activity_events (
  id bigint generated always as identity primary key,
  task_id uuid references public.pms_tasks(id) on delete cascade,
  issue_id uuid references public.pms_issues(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((task_id is not null) <> (issue_id is not null))
);

create index if not exists pms_tasks_schedule_idx on public.pms_tasks(scheduled_for,status);
create index if not exists pms_tasks_property_idx on public.pms_tasks(property_id,scheduled_for);
create unique index if not exists pms_turnover_per_reservation_idx on public.pms_tasks(reservation_id,task_type) where reservation_id is not null;
create index if not exists pms_task_checklist_task_idx on public.pms_task_checklist_items(task_id,display_order);
create index if not exists pms_issues_open_idx on public.pms_issues(property_id,status,created_at desc);
create index if not exists pms_activity_task_idx on public.pms_activity_events(task_id,created_at desc);
create index if not exists pms_activity_issue_idx on public.pms_activity_events(issue_id,created_at desc);

alter table public.pms_tasks enable row level security;
alter table public.pms_task_checklist_items enable row level security;
alter table public.pms_issues enable row level security;
alter table public.pms_activity_events enable row level security;

revoke all on public.pms_tasks,public.pms_task_checklist_items,public.pms_issues,public.pms_activity_events from public,anon,authenticated;
grant all on public.pms_tasks,public.pms_task_checklist_items,public.pms_issues,public.pms_activity_events to service_role;
revoke all on sequence public.pms_activity_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.pms_activity_events_id_seq to service_role;

comment on table public.pms_tasks is 'Operational PMS tasks. Financial and reservation lifecycle state remain authoritative in their own modules.';
;

-- Historical: 20260926053645 pms_professional_operations
-- Professional PMS additions: reusable checklists, accountable assignments and evidence.
-- Reservation and financial state machines remain isolated and authoritative.

create table if not exists public.pms_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  property_id bigint references public.properties(id) on delete cascade,
  task_type text not null check (task_type in ('turnover','inspection','maintenance','setup','guest_request')),
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pms_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pms_checklist_templates(id) on delete cascade,
  label text not null,
  display_order integer not null default 0,
  required boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pms_tasks add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.pms_issues add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.pms_issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.pms_issues(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pms_template_property_type_idx on public.pms_checklist_templates(property_id,task_type,active);
create index if not exists pms_template_items_order_idx on public.pms_checklist_template_items(template_id,display_order);
create index if not exists pms_tasks_assigned_user_idx on public.pms_tasks(assigned_user_id) where assigned_user_id is not null;
create index if not exists pms_issues_assigned_user_idx on public.pms_issues(assigned_user_id) where assigned_user_id is not null;
create index if not exists pms_issue_attachments_issue_idx on public.pms_issue_attachments(issue_id,created_at);

alter table public.pms_checklist_templates enable row level security;
alter table public.pms_checklist_template_items enable row level security;
alter table public.pms_issue_attachments enable row level security;

revoke all on public.pms_checklist_templates,public.pms_checklist_template_items,public.pms_issue_attachments from public,anon,authenticated;
grant all on public.pms_checklist_templates,public.pms_checklist_template_items,public.pms_issue_attachments to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pms-evidence','pms-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

comment on table public.pms_checklist_templates is 'Reusable operational checklist definitions managed through the PMS service layer.';
comment on table public.pms_issue_attachments is 'Private evidence metadata; files live in the private pms-evidence bucket.';
;

-- Historical: 20260926053716 seed_default_turnover_checklist
with created as (
  insert into public.pms_checklist_templates (property_id,task_type,name,active)
  select null,'turnover','Preparação completa entre estadias',true
  where not exists (
    select 1 from public.pms_checklist_templates where property_id is null and task_type='turnover' and active=true
  )
  returning id
)
insert into public.pms_checklist_template_items (template_id,label,display_order)
select created.id,item.label,item.display_order
from created
cross join (values
  ('Recolher lixo e conferir itens esquecidos',0),
  ('Trocar enxoval e toalhas',1),
  ('Higienizar banheiro, hidro ou spa',2),
  ('Limpar cozinha e conferir utensílios',3),
  ('Repor amenities e itens de boas-vindas',4),
  ('Conferir área externa e equipamentos',5),
  ('Fotografar a vistoria final',6)
) as item(label,display_order);
;

-- Historical: 20260926053744 cover_pms_professional_foreign_keys
create index if not exists pms_templates_created_by_idx
  on public.pms_checklist_templates(created_by) where created_by is not null;

create index if not exists pms_issue_attachments_uploaded_by_idx
  on public.pms_issue_attachments(uploaded_by) where uploaded_by is not null;
;

-- Historical: 20260926153329 pms_full_cycle_operations
-- Complete Phase 1 PMS cycle: operational blocks, staff scope, housekeeping timing and audit.

alter table public.profiles
  add column if not exists pms_property_ids bigint[] not null default '{}'::bigint[],
  add column if not exists pms_permissions jsonb not null default '{"reservations":false,"housekeeping":false,"maintenance":false,"finance":false,"manage_team":false}'::jsonb;

alter table public.pms_tasks
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz;

create table if not exists public.pms_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  block_type text not null default 'maintenance' check (block_type in ('maintenance','owner_use','operational','other')),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);

create index if not exists pms_calendar_blocks_property_dates_idx
  on public.pms_calendar_blocks(property_id,start_date,end_date) where status='active';
create index if not exists pms_tasks_reservation_idx
  on public.pms_tasks(reservation_id,scheduled_for) where reservation_id is not null;

alter table public.pms_calendar_blocks enable row level security;
revoke all on public.pms_calendar_blocks from public,anon,authenticated;
grant all on public.pms_calendar_blocks to service_role;

create or replace function private.enqueue_pms_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_type text;
  v_title text;
  v_message text;
  v_severity text := 'info';
  v_dedupe text;
begin
  if tg_table_name = 'pms_tasks' then
    v_reservation_id := new.reservation_id;
    if tg_op = 'UPDATE' and old.assigned_user_id is distinct from new.assigned_user_id and new.assigned_user_id is not null then
      v_type := 'housekeeping_assigned'; v_severity := 'info'; v_title := 'Limpeza designada';
      v_message := new.title || ' · ' || coalesce(new.assigned_name,'Equipe');
      v_dedupe := 'pms_task_assigned:' || new.id || ':' || new.assigned_user_id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'inspection' then
      v_type := 'housekeeping_inspection'; v_severity := 'warning'; v_title := 'Limpeza aguardando vistoria';
      v_message := new.title;
      v_dedupe := 'pms_task_inspection:' || new.id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'ready' then
      v_type := 'property_ready'; v_severity := 'success'; v_title := 'Imóvel liberado';
      v_message := new.title || ' concluída e vistoriada.';
      v_dedupe := 'pms_task_ready:' || new.id;
    else
      return new;
    end if;
  elsif tg_table_name = 'pms_issues' then
    v_reservation_id := new.reservation_id;
    if tg_op = 'INSERT' then
      v_type := 'pms_issue_opened';
      v_severity := case when new.severity='critical' then 'critical' else 'warning' end;
      v_title := 'Nova ocorrência operacional'; v_message := new.title;
      v_dedupe := 'pms_issue:' || new.id;
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.admin_notifications(notification_type,severity,title,message,reservation_id,entity_type,entity_id,dedupe_key,payload)
  values(v_type,v_severity,v_title,v_message,v_reservation_id,tg_table_name,new.id::text,v_dedupe,jsonb_build_object('property_id',new.property_id))
  on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_pms_notification() from public,anon,authenticated;

drop trigger if exists pms_tasks_admin_notification on public.pms_tasks;
create trigger pms_tasks_admin_notification
after update of assigned_user_id,status on public.pms_tasks
for each row execute function private.enqueue_pms_notification();

drop trigger if exists pms_issues_admin_notification on public.pms_issues;
create trigger pms_issues_admin_notification
after insert on public.pms_issues
for each row execute function private.enqueue_pms_notification();

comment on table public.pms_calendar_blocks is 'Manual operational availability blocks. Read and written only through the PMS service layer.';
;

-- Historical: 20260926154820 notify_initial_pms_assignment
-- Notify the operation when a task is created already assigned, not only on reassignment.

create or replace function private.enqueue_pms_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_type text;
  v_title text;
  v_message text;
  v_severity text := 'info';
  v_dedupe text;
begin
  if tg_table_name = 'pms_tasks' then
    v_reservation_id := new.reservation_id;
    if (tg_op = 'INSERT' and new.assigned_user_id is not null)
      or (tg_op = 'UPDATE' and old.assigned_user_id is distinct from new.assigned_user_id and new.assigned_user_id is not null) then
      v_type := 'housekeeping_assigned'; v_severity := 'info'; v_title := 'Tarefa designada';
      v_message := new.title || ' · ' || coalesce(new.assigned_name,'Equipe');
      v_dedupe := 'pms_task_assigned:' || new.id || ':' || new.assigned_user_id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'inspection' then
      v_type := 'housekeeping_inspection'; v_severity := 'warning'; v_title := 'Tarefa aguardando vistoria';
      v_message := new.title;
      v_dedupe := 'pms_task_inspection:' || new.id;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'ready' then
      v_type := 'property_ready'; v_severity := 'success'; v_title := 'Imóvel liberado';
      v_message := new.title || ' concluída e vistoriada.';
      v_dedupe := 'pms_task_ready:' || new.id;
    else
      return new;
    end if;
  elsif tg_table_name = 'pms_issues' then
    v_reservation_id := new.reservation_id;
    if tg_op = 'INSERT' then
      v_type := 'pms_issue_opened';
      v_severity := case when new.severity='critical' then 'critical' else 'warning' end;
      v_title := 'Nova ocorrência operacional'; v_message := new.title;
      v_dedupe := 'pms_issue:' || new.id;
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.admin_notifications(notification_type,severity,title,message,reservation_id,entity_type,entity_id,dedupe_key,payload)
  values(v_type,v_severity,v_title,v_message,v_reservation_id,tg_table_name,new.id::text,v_dedupe,jsonb_build_object('property_id',new.property_id))
  on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_pms_notification() from public,anon,authenticated;

drop trigger if exists pms_tasks_admin_notification on public.pms_tasks;
create trigger pms_tasks_admin_notification
after insert or update of assigned_user_id,status on public.pms_tasks
for each row execute function private.enqueue_pms_notification();
;

-- Historical: 20260926155539 index_pms_calendar_block_actors
-- Cover actor foreign keys used by audit and cleanup operations.

create index if not exists pms_calendar_blocks_created_by_idx
  on public.pms_calendar_blocks(created_by) where created_by is not null;

create index if not exists pms_calendar_blocks_cancelled_by_idx
  on public.pms_calendar_blocks(cancelled_by) where cancelled_by is not null;
;

-- Historical: 20260926163526 pms_team_access_management
-- Self-service PMS team access, invitations and auditable property scopes.

alter table public.profiles
  add column if not exists pms_access_status text not null default 'active',
  add column if not exists pms_position text,
  add column if not exists pms_last_access_at timestamptz;

alter table public.profiles drop constraint if exists profiles_pms_access_status_check;
alter table public.profiles add constraint profiles_pms_access_status_check
  check (pms_access_status in ('invited','active','suspended'));

create table if not exists public.pms_team_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  role text not null check (role in ('admin','host','staff','service_provider')),
  position text,
  property_ids bigint[] not null default '{}'::bigint[],
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pms_team_invitations_status_idx
  on public.pms_team_invitations(status,expires_at);
create index if not exists profiles_pms_scope_idx
  on public.profiles using gin(pms_property_ids);

alter table public.pms_team_invitations enable row level security;
revoke all on public.pms_team_invitations from public,anon,authenticated;
grant all on public.pms_team_invitations to service_role;

-- Preserve the access existing operators had before empty scope changed to "no property".
update public.profiles
set pms_property_ids = array(select id from public.properties where active=true order by id)
where role in ('host','staff','service_provider') and cardinality(pms_property_ids)=0;

comment on table public.pms_team_invitations is 'PMS operator invitations. Service-layer only; never exposed through the public Data API.';
comment on column public.profiles.pms_access_status is 'Operational login state independent from the guest account state.';
;

-- Historical: 20260927022906 property_media
-- Publicly displayed property images; only admins can upload original files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('property-media','property-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "property_media_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id='property-media' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));

create policy "property_media_admin_delete" on storage.objects
for delete to authenticated
using (bucket_id='property-media' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));
;

-- Historical: 20260927141852 cancel_obsolete_reservation_emails
-- Prevent scheduled arrival and confirmation messages for cancelled stays.
create or replace function public.cancel_obsolete_reservation_emails()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('cancelled', 'no_show') and new.status is distinct from old.status then
    update public.notification_outbox
       set status = 'cancelled',
           last_error = 'reservation_' || new.status || '_before_send'
     where reservation_id = new.id
       and status = 'queued'
       and template_code in (
         'payment_awaiting', 'payment_under_review', 'reservation_confirmed',
         'pre_stay_important', 'experience_added_paid', 'experience_upgrade_paid'
       );
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_obsolete_reservation_emails on public.reservations;
create trigger cancel_obsolete_reservation_emails
after update of status on public.reservations
for each row execute function public.cancel_obsolete_reservation_emails();

revoke all on function public.cancel_obsolete_reservation_emails() from public, anon, authenticated;
;

-- Historical: 20260927180747 immutable_accepted_policies
-- Once a policy is published or accepted, revisions must be new rows with new versions.
create or replace function public.prevent_published_policy_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.document_type,old.code,old.version,old.title,old.body)
      is distinct from
     (new.document_type,new.code,new.version,new.title,new.body)
     and (
       old.status = 'active'
       or exists (select 1 from public.reservation_policy_acceptances a where a.document_id=old.id)
       or exists (select 1 from public.quote_options q where q.cancellation_policy_id=old.id)
     ) then
    raise exception 'published_policy_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_published_policy_rewrite on public.policy_documents;
create trigger prevent_published_policy_rewrite
before update on public.policy_documents
for each row execute function public.prevent_published_policy_rewrite();

-- A quote must retain the policy and price that the guest saw when it was made.
create or replace function public.prevent_quote_policy_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.cancellation_policy_id is distinct from new.cancellation_policy_id then
    raise exception 'quote_policy_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_quote_policy_rewrite on public.quote_options;
create trigger prevent_quote_policy_rewrite
before update on public.quote_options
for each row execute function public.prevent_quote_policy_rewrite();
;

-- Historical: 20260927181004 cancellation_policy_1_1_drafts
-- Prepare the new terms without changing any existing quote, acceptance or active rate plan.
insert into public.policy_documents(document_type,code,version,title,body,status)
values
('cancellation_policy','refundable_v1','1.1','Tarifa reembolsável',
 'Em reservas diretas contratadas pela internet, o hóspede pode exercer o direito de arrependimento em até sete dias contados da contratação, com restituição integral dos valores pagos, conforme a legislação aplicável, inclusive se escolheu tarifa não reembolsável. Além disso, nesta tarifa reembolsável, o cancelamento solicitado até 20 dias completos antes do check-in dá direito à devolução integral da reserva. Após esse prazo contratual, aplicam-se as condições de retenção informadas antes da compra, respeitados os direitos legais. Uma alteração de datas ou imóvel não reinicia o prazo de arrependimento da contratação original.',
 'draft'),
('cancellation_policy','non_refundable_v1','1.1','Tarifa não reembolsável',
 'Em reservas diretas contratadas pela internet, o hóspede pode exercer o direito de arrependimento em até sete dias contados da contratação, com restituição integral dos valores pagos, conforme a legislação aplicável. Após esse prazo, a tarifa de hospedagem não é reembolsável em caso de desistência voluntária, ressalvados os demais direitos legais e situações de falha na prestação do serviço. Uma alteração de datas ou imóvel não reinicia o prazo de arrependimento da contratação original.',
 'draft')
on conflict (code,version) do nothing;
;

-- Historical: 20260927192055 guest_identity_signup
-- The document is stored outside exposed schemas; raw signup metadata is scrubbed.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.guest_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('cpf','passport')),
  issuing_country text not null check (issuing_country ~ '^[A-Z]{2}$'),
  document_number text not null,
  email_at_signup text not null,
  created_at timestamptz not null default now(),
  unique (document_type, issuing_country, document_number)
);
alter table private.guest_identities enable row level security;
revoke all on private.guest_identities from public, anon, authenticated;

create or replace function private.valid_cpf(v text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare n int; i int; total int; digit int;
begin
 if v !~ '^[0-9]{11}$' or v ~ '^([0-9])\1{10}$' then return false; end if;
 for n in 9..10 loop
  total:=0;
  for i in 1..n loop total:=total+substring(v from i for 1)::int*(n+2-i); end loop;
  digit:=(total*10)%11;
  if digit=10 then digit:=0; end if;
  if digit<>substring(v from n+1 for 1)::int then return false; end if;
 end loop;
 return true;
end $$;

create or replace function private.register_guest_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; number text; country text;
begin
 kind:=new.raw_user_meta_data->>'document_type';
 if kind is null then return new; end if; -- existing admin and invitation flows
 number:=upper(regexp_replace(coalesce(new.raw_user_meta_data->>'document_number',''), '[ .-]', '', 'g'));
 country:=upper(coalesce(new.raw_user_meta_data->>'issuing_country',''));
 if kind not in ('cpf','passport') or country !~ '^[A-Z]{2}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='cpf' and (country<>'BR' or not private.valid_cpf(number)) then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='passport' and number !~ '^[A-Z0-9]{5,20}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 insert into private.guest_identities(user_id,document_type,issuing_country,document_number,email_at_signup)
 values(new.id,kind,country,number,lower(new.email));
 -- Auth metadata is user-editable and can appear in JWTs. Remove the sensitive values.
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
   - 'document_type' - 'document_number' - 'issuing_country' where id=new.id;
 return new;
end $$;

drop trigger if exists on_guest_identity_created on auth.users;
create trigger on_guest_identity_created after insert on auth.users
for each row execute function private.register_guest_identity();
;

-- Historical: 20260927195003 guest_identity_checkout_guard
-- Direct e-mail signup must supply a document. Invitations and OAuth users
-- complete their identity separately before starting a reservation payment.
create or replace function private.register_guest_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; number text; country text;
begin
 kind:=new.raw_user_meta_data->>'document_type';
 if kind is null then
  if new.invited_at is null and coalesce(new.raw_app_meta_data->>'provider','email')='email' then
   raise exception 'document_required' using errcode='22023';
  end if;
  return new;
 end if;
 number:=upper(regexp_replace(coalesce(new.raw_user_meta_data->>'document_number',''), '[ .-]', '', 'g'));
 country:=upper(coalesce(new.raw_user_meta_data->>'issuing_country',''));
 if kind not in ('cpf','passport') or country !~ '^[A-Z]{2}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='cpf' and (country<>'BR' or not private.valid_cpf(number)) then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 if kind='passport' and number !~ '^[A-Z0-9]{5,20}$' then
  raise exception 'invalid_document' using errcode='22023';
 end if;
 insert into private.guest_identities(user_id,document_type,issuing_country,document_number,email_at_signup)
 values(new.id,kind,country,number,lower(new.email));
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
   - 'document_type' - 'document_number' - 'issuing_country' where id=new.id;
 return new;
end $$;

create or replace function public.guest_identity_present(p_user_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from private.guest_identities where user_id=p_user_id)$$;
revoke all on function public.guest_identity_present(uuid) from public, anon, authenticated;
grant execute on function public.guest_identity_present(uuid) to service_role;

create or replace function public.register_guest_identity(
 p_user_id uuid, p_document_type text, p_issuing_country text, p_document_number text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized text; country text; guest_email text;
begin
 select lower(email) into guest_email from auth.users where id=p_user_id;
 if guest_email is null then raise exception 'user_not_found'; end if;
 country:=upper(coalesce(p_issuing_country,''));
 normalized:=upper(regexp_replace(coalesce(p_document_number,''), '[ .-]', '', 'g'));
 if p_document_type not in ('cpf','passport') or country !~ '^[A-Z]{2}$' then
  raise exception 'invalid_document';
 end if;
 if p_document_type='cpf' and (country<>'BR' or not private.valid_cpf(normalized)) then
  raise exception 'invalid_document';
 end if;
 if p_document_type='passport' and normalized !~ '^[A-Z0-9]{5,20}$' then
  raise exception 'invalid_document';
 end if;
 insert into private.guest_identities(user_id,document_type,issuing_country,document_number,email_at_signup)
 values(p_user_id,p_document_type,country,normalized,guest_email);
 return true;
end $$;
revoke all on function public.register_guest_identity(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.register_guest_identity(uuid,text,text,text) to service_role;
;

-- Historical: 20260928003929 cancellation_policy_admin
create table public.cancellation_policy_rules (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.policy_documents(id),
  rate_plan_code text not null references public.rate_plans(code),
  withdrawal_days integer not null check (withdrawal_days between 7 and 30),
  full_refund_days_before_checkin integer not null check (full_refund_days_before_checkin between 1 and 365),
  late_accommodation_refund_percent integer not null check (late_accommodation_refund_percent between 0 and 100),
  created_at timestamptz not null default now()
);
create table public.cancellation_policy_assignments (
  environment text not null check (environment = 'development'),
  rate_plan_code text not null references public.rate_plans(code),
  rule_id uuid not null references public.cancellation_policy_rules(id),
  updated_at timestamptz not null default now(),
  primary key (environment, rate_plan_code)
);
alter table public.cancellation_policy_rules enable row level security;
alter table public.cancellation_policy_assignments enable row level security;
revoke all on public.cancellation_policy_rules, public.cancellation_policy_assignments from anon, authenticated;
grant all on public.cancellation_policy_rules, public.cancellation_policy_assignments to service_role;

insert into public.cancellation_policy_rules(document_id,rate_plan_code,withdrawal_days,full_refund_days_before_checkin,late_accommodation_refund_percent)
select d.id,p.code,7,20,case when p.code='refundable' then 50 else 0 end
from public.rate_plans p join public.policy_documents d on d.code=p.code||'_v1' and d.version='1.2'
where p.code in ('refundable','non_refundable')
on conflict (document_id) do nothing;

insert into public.cancellation_policy_assignments(environment,rate_plan_code,rule_id)
select 'development',r.rate_plan_code,r.id from public.cancellation_policy_rules r
join public.policy_documents d on d.id=r.document_id and d.version='1.2'
on conflict (environment,rate_plan_code) do nothing;

create or replace function public.save_development_cancellation_policy(
  p_rate_plan_code text, p_withdrawal_days integer,
  p_full_refund_days_before_checkin integer, p_late_accommodation_refund_percent integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.rate_plans%rowtype;
  v_version text;
  v_document_id uuid;
  v_rule_id uuid;
  v_body text;
begin
  if p_rate_plan_code not in ('refundable','non_refundable')
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
    ||'O hóspede pode desistir em até '||p_withdrawal_days||' dias corridos após a contratação, com devolução integral dos valores pagos, inclusive hospedagem, limpeza e experiências. Essa regra também vale para a tarifa não reembolsável. Direitos legais prevalecem. Se a estadia começar nesse período, o pedido será analisado conforme a legislação aplicável, sem recusa automática.'||E'\n\n'
    ||case when p_rate_plan_code='refundable' then
       'Depois desse prazo, pedidos feitos até '||p_full_refund_days_before_checkin||' dias completos antes do check-in têm devolução integral. Após esse marco e antes do check-in, devolvemos '||p_late_accommodation_refund_percent||'% da hospedagem, 100% da limpeza e das experiências não prestadas.'
      else
       'Depois desse prazo, a desistência voluntária antes do check-in não devolve o valor da hospedagem. Devolvemos 100% da limpeza e das experiências não prestadas.' end||E'\n\n'
    ||'Solicite o cancelamento pela área da reserva ou pelo canal de atendimento da confirmação, guardando o protocolo. A remarcação não reinicia o prazo contado da contratação original. Casos de saída antecipada, força maior, falha do serviço e outras garantias legais são avaliados individualmente. Em alterações de datas, se a nova cotação for maior, cobra-se somente a diferença; se for menor, não há devolução da diferença, desde que o hóspede concorde expressamente antes da alteração.';
  insert into public.policy_documents(document_type,code,version,title,body,status)
  values ('cancellation_policy',p_rate_plan_code||'_v1',v_version,'Política de cancelamento — '||v_plan.name,v_body,'draft')
  returning id into v_document_id;
  insert into public.cancellation_policy_rules(document_id,rate_plan_code,withdrawal_days,full_refund_days_before_checkin,late_accommodation_refund_percent)
  values(v_document_id,p_rate_plan_code,p_withdrawal_days,p_full_refund_days_before_checkin,p_late_accommodation_refund_percent)
  returning id into v_rule_id;
  insert into public.cancellation_policy_assignments(environment,rate_plan_code,rule_id)
  values('development',p_rate_plan_code,v_rule_id)
  on conflict(environment,rate_plan_code) do update set rule_id=excluded.rule_id,updated_at=now();
  return v_document_id;
end;
$$;
revoke all on function public.save_development_cancellation_policy(text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.save_development_cancellation_policy(text,integer,integer,integer) to service_role;
;

-- Historical: 20260928021400 pagbank_sandbox_reconciliation
-- Credentials never live in Postgres. Only the Edge Functions read the sandbox token.
create or replace function public.guest_payment_identity(p_user_id uuid)
returns table(document_type text, document_number text)
language sql stable security definer set search_path = '' as $$
  select g.document_type, g.document_number
  from private.guest_identities g where g.user_id=p_user_id
$$;
revoke all on function public.guest_payment_identity(uuid) from public, anon, authenticated;
grant execute on function public.guest_payment_identity(uuid) to service_role;

create unique index if not exists payments_provider_charge_unique
on public.payments(provider,provider_payment_id) where provider_payment_id is not null;

create or replace function public.reconcile_pagbank_sandbox_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_reservation_status text, result_reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype; v_status text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents then
    raise exception 'payment_mismatch';
  end if;
  select * into r from public.reservations where id=p.reservation_id for update;
  if not found then raise exception 'reservation_missing'; end if;
  v_status:=case p_status
    when 'PAID' then 'paid' when 'WAITING' then 'awaiting_payment'
    when 'IN_ANALYSIS' then 'under_review' when 'AUTHORIZED' then 'processing'
    when 'DECLINED' then 'refused' when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired'
    else null end;
  if v_status is null then raise exception 'unknown_provider_status'; end if;
  if p.status in ('refunded','partially_refunded','disputed','chargeback') then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status='paid' and v_status<>'paid' then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status in ('refused','cancelled','expired') and v_status not in ('paid') then
    return query select p.status,r.status,r.id; return;
  end if;
  if v_status='paid' then
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
      exception when exclusion_violation then
        update public.payments set metadata=metadata||'{"manual_review":"paid_dates_unavailable"}'::jsonb where id=p.id;
      end;
    else
      update public.payments set metadata=metadata||'{"manual_review":"paid_after_hold"}'::jsonb where id=p.id;
    end if;
  elsif v_status in ('refused','cancelled','expired') then
    if p.status not in ('paid','refused','cancelled','expired') then
      update public.payments set status=v_status,updated_at=now() where id=p.id;
      if r.status in ('pending_payment','hold') then
        update public.reservations set status='not_confirmed',not_confirmed_at=now(),
          not_confirmed_reason=case when v_status='refused' then 'payment_refused'
            when v_status='expired' then 'payment_expired' else 'payment_cancelled' end,
          hold_expires_at=now(),updated_at=now() where id=r.id;
        update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';
      end if;
    end if;
  elsif p.status in ('awaiting_payment','processing','under_review') then
    update public.payments set status=v_status,updated_at=now() where id=p.id;
    if v_status='under_review' and r.status='pending_payment' then
      update public.reservations set hold_expires_at=null,updated_at=now() where id=r.id;
    end if;
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.reservations where id=r.id),r.id;
end $$;
revoke all on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) to service_role;
;

-- Historical: 20260928031110 pagbank_reconciliation_idempotent
create or replace function public.reconcile_pagbank_sandbox_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_reservation_status text, result_reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype; v_status text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents then
    raise exception 'payment_mismatch';
  end if;
  select * into r from public.reservations where id=p.reservation_id for update;
  if not found then raise exception 'reservation_missing'; end if;
  v_status:=case p_status
    when 'PAID' then 'paid' when 'WAITING' then 'awaiting_payment'
    when 'IN_ANALYSIS' then 'under_review' when 'AUTHORIZED' then 'processing'
    when 'DECLINED' then 'refused' when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired'
    else null end;
  if v_status is null then raise exception 'unknown_provider_status'; end if;
  if p.status in ('refunded','partially_refunded','disputed','chargeback') then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status='paid' and v_status<>'paid' then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status in ('refused','cancelled','expired') and v_status not in ('paid') then
    return query select p.status,r.status,r.id; return;
  end if;
  if v_status='paid' then
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status='confirmed' then
      update public.payments set metadata=metadata-'manual_review' where id=p.id;
    elsif r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
        update public.payments set metadata=metadata-'manual_review' where id=p.id;
      exception when exclusion_violation then
        update public.payments set metadata=metadata||'{"manual_review":"paid_dates_unavailable"}'::jsonb where id=p.id;
      end;
    else
      update public.payments set metadata=metadata||'{"manual_review":"paid_after_hold"}'::jsonb where id=p.id;
    end if;
  elsif v_status in ('refused','cancelled','expired') then
    if p.status not in ('paid','refused','cancelled','expired') then
      update public.payments set status=v_status,updated_at=now() where id=p.id;
      if r.status in ('pending_payment','hold') then
        update public.reservations set status='not_confirmed',not_confirmed_at=now(),
          not_confirmed_reason=case when v_status='refused' then 'payment_refused'
            when v_status='expired' then 'payment_expired' else 'payment_cancelled' end,
          hold_expires_at=now(),updated_at=now() where id=r.id;
        update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';
      end if;
    end if;
  elsif p.status in ('awaiting_payment','processing','under_review') then
    update public.payments set status=v_status,updated_at=now() where id=p.id;
    if v_status='under_review' and r.status='pending_payment' then
      update public.reservations set hold_expires_at=null,updated_at=now() where id=r.id;
    end if;
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.reservations where id=r.id),r.id;
end $$;
revoke all on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) to service_role;
;

-- Historical: 20260928033246 pagbank_post_booking_reconciliation
-- Reconcile a post-booking charge only after a server-authenticated PagBank lookup.
create or replace function public.reconcile_pagbank_post_booking_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_charge_status text)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; c public.post_booking_charges%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents
     or p.metadata->>'kind'<>'post_booking_charge' then raise exception 'payment_mismatch'; end if;
  select * into c from public.post_booking_charges where payment_id=p.id for update;
  if not found or c.amount_cents<>p.amount_cents or c.user_id<>p.user_id then raise exception 'charge_mismatch'; end if;
  if p_status='PAID' then
    if c.status='applied' and p.status='paid' then
      return query select p.status,c.status; return;
    end if;
    if c.status in ('cancelled','expired') or c.expires_at<=now()
       or p.status in ('refused','expired','cancelled') then
      update public.payments set status='paid',
        metadata=metadata||'{"manual_review":"post_booking_paid_after_deadline"}'::jsonb,
        updated_at=now() where id=p.id;
    else
      begin
        perform public.finalize_post_booking_charge_atomic(p.id,p.user_id);
      exception when others then
        update public.payments set status='paid',
          metadata=metadata||'{"manual_review":"post_booking_apply_failed"}'::jsonb,
          updated_at=now() where id=p.id;
      end;
    end if;
  elsif p.status='paid' or p.status in ('refused','cancelled','expired') then
    null;
  elsif p_status in ('DECLINED','CANCELED','CANCELLED','EXPIRED') then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,
        case when p_status='DECLINED' then 'refused' else 'expired' end);
    end if;
  elsif p_status='IN_ANALYSIS' then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,'under_review');
    end if;
  elsif p_status='AUTHORIZED' then
    update public.payments set status='processing',updated_at=now() where id=p.id;
  elsif p_status<>'WAITING' then
    raise exception 'unknown_provider_status';
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.post_booking_charges where id=c.id);
end $$;
revoke all on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) to service_role;
;

-- Historical: 20260928123612 pagbank_reservation_refunds
-- A cancellation never releases inventory until every due refund is confirmed.
-- This schema is shared, but the refund endpoint is restricted to development.
create table if not exists public.reservation_cancellations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  actor_user_id uuid not null references auth.users(id),
  accepted_document_id uuid not null references public.policy_documents(id),
  accepted_version text not null,
  accepted_at timestamptz not null,
  reason text not null,
  calculation jsonb not null,
  refund_due_cents bigint not null check (refund_due_cents >= 0),
  status text not null default 'prepared'
    check (status in ('prepared','pending_provider','needs_review','confirmed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  confirmed_at timestamptz
);

create table if not exists public.reservation_refunds (
  id uuid primary key default gen_random_uuid(),
  cancellation_id uuid not null references public.reservation_cancellations(id),
  payment_id uuid not null references public.payments(id),
  charge_id text not null check (charge_id ~ '^CHAR_[A-Za-z0-9-]+$'),
  requested_cents bigint not null check (requested_cents > 0),
  confirmed_cents bigint not null default 0 check (confirmed_cents >= 0 and confirmed_cents <= requested_cents),
  idempotency_key text not null unique,
  state text not null default 'prepared'
    check (state in ('prepared','dispatching','uncertain','confirmed','failed')),
  provider_status text,
  provider_refund_id text,
  sent_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cancellation_id,payment_id)
);

create table if not exists public.reservation_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.reservation_refunds(id),
  event text not null check (event in ('claim','request_accepted','request_uncertain','provider_confirmed','provider_unknown','provider_failed')),
  provider_status text,
  created_at timestamptz not null default now()
);

create index if not exists reservation_refunds_payment_idx on public.reservation_refunds(payment_id);
create index if not exists reservation_refund_attempts_refund_idx on public.reservation_refund_attempts(refund_id,created_at);
alter table public.reservation_cancellations enable row level security;
alter table public.reservation_refunds enable row level security;
alter table public.reservation_refund_attempts enable row level security;
revoke all on public.reservation_cancellations,public.reservation_refunds,public.reservation_refund_attempts from anon,authenticated;
grant all on public.reservation_cancellations,public.reservation_refunds,public.reservation_refund_attempts to service_role;

-- This claim is the only gate to a POST at PagBank. A duplicate click, a
-- timeout or a repeated webhook can never claim the same attempt again.
create or replace function public.claim_reservation_refund(p_refund_id uuid)
returns table(charge_id text, requested_cents bigint, idempotency_key text)
language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found or v.state <> 'prepared' then return; end if;
  update public.reservation_refunds set state='dispatching',sent_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event) values(v.id,'claim');
  return query select v.charge_id,v.requested_cents,v.idempotency_key;
end $$;
revoke all on function public.claim_reservation_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_refund(uuid) to service_role;

-- A confirmed refund must be tied to its original captured payment. Amount
-- caps include both confirmed and in-flight refunds across cancellation IDs.
create or replace function public.reserve_reservation_refund(
  p_cancellation_id uuid,p_payment_id uuid,p_charge_id text,p_amount_cents bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; c public.reservation_cancellations%rowtype;
  v_reserved bigint; v_id uuid;
begin
  select * into p from public.payments where id=p_payment_id for update;
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or p.id is null or p.reservation_id<>c.reservation_id
     or p.provider<>'pagbank_sandbox' or p.status<>'paid'
     or p.provider_payment_id is distinct from p_charge_id
     or p_amount_cents<=0 then raise exception 'refund_payment_mismatch'; end if;
  select id into v_id from public.reservation_refunds
    where cancellation_id=c.id and payment_id=p.id;
  if found then return v_id; end if;
  select coalesce(sum(requested_cents),0) into v_reserved
    from public.reservation_refunds where payment_id=p.id and state<>'failed';
  if v_reserved+p_amount_cents>p.amount_cents then raise exception 'refund_exceeds_captured'; end if;
  insert into public.reservation_refunds(cancellation_id,payment_id,charge_id,requested_cents,idempotency_key)
  values(c.id,p.id,p_charge_id,p_amount_cents,'refund-'||gen_random_uuid()::text)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reserve_reservation_refund(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_reservation_refund(uuid,uuid,text,bigint) to service_role;

create or replace function public.confirm_reservation_refund(
  p_refund_id uuid,p_charge_id text,p_provider_status text,p_confirmed_cents bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  c public.reservation_cancellations%rowtype;
  v_confirmed bigint; v_due bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.charge_id is distinct from p_charge_id or p_provider_status<>'CANCELED'
     or p_confirmed_cents is distinct from v.requested_cents then
    raise exception 'provider_refund_unconfirmed';
  end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  if v.state not in ('dispatching','uncertain') then raise exception 'refund_not_sent'; end if;
  select * into p from public.payments where id=v.payment_id for update;
  select * into c from public.reservation_cancellations where id=v.cancellation_id for update;
  if p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from v.charge_id
     or p.amount_cents<v.requested_cents or c.reservation_id is distinct from p.reservation_id then
    raise exception 'refund_payment_mismatch';
  end if;
  update public.reservation_refunds set state='confirmed',confirmed_cents=p_confirmed_cents,
    provider_status=p_provider_status,checked_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event,provider_status)
    values(v.id,'provider_confirmed',p_provider_status);
  insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
    values(c.reservation_id,p.id,'refund',-p_confirmed_cents,'Estorno PagBank confirmado');
  if p_confirmed_cents=p.amount_cents then
    update public.payments set status='refunded',updated_at=now() where id=p.id;
  end if;
  select coalesce(sum(confirmed_cents),0) into v_confirmed from public.reservation_refunds where cancellation_id=c.id;
  select coalesce(sum(requested_cents),0) into v_due from public.reservation_refunds where cancellation_id=c.id;
  if v_confirmed=c.refund_due_cents and v_due=c.refund_due_cents
     and not exists(select 1 from public.reservation_refunds where cancellation_id=c.id and state<>'confirmed') then
    update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
    update public.reservations set status='cancelled',cancelled_at=now(),
      cancellation_actor='admin',cancellation_reason=c.reason,updated_at=now()
      where id=c.reservation_id and status='confirmed';
  end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_reservation_refund(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund(uuid,text,text,bigint) to service_role;

-- A policy may retain every captured cent. The cancellation still requires
-- explicit administrator approval and cannot be inferred from a table edit.
create or replace function public.confirm_zero_refund_cancellation(p_cancellation_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.reservation_cancellations%rowtype;
begin
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or c.refund_due_cents<>0 or c.status<>'pending_provider'
     or exists(select 1 from public.reservation_refunds where cancellation_id=c.id) then
    raise exception 'zero_refund_cancellation_invalid';
  end if;
  update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
  update public.reservations set status='cancelled',cancelled_at=now(),
    cancellation_actor='admin',cancellation_reason=c.reason,updated_at=now()
    where id=c.reservation_id and status='confirmed';
  if not found then raise exception 'reservation_changed'; end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_zero_refund_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.confirm_zero_refund_cancellation(uuid) to service_role;
;

-- Historical: 20260928134432 reservation_financial_cases
-- Guest requests and discretionary refunds share one auditable refund ledger.
create table if not exists public.reservation_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  guest_user_id uuid not null references auth.users(id),
  reason text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'requested' check(status in ('requested','rejected','approved','processing','completed')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  cancellation_id uuid references public.reservation_cancellations(id)
);
create unique index if not exists reservation_cancel_requests_active_idx
  on public.reservation_cancel_requests(reservation_id)
  where status in ('requested','approved','processing');
alter table public.reservation_cancel_requests enable row level security;
revoke all on public.reservation_cancel_requests from anon,authenticated;
grant all on public.reservation_cancel_requests to service_role;

alter table public.reservation_cancellations
  add column if not exists kind text not null default 'policy_cancellation'
    check(kind in ('policy_cancellation','voluntary_refund')),
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists guest_request_id uuid references public.reservation_cancel_requests(id),
  add column if not exists operation_key uuid unique;
alter table public.reservation_cancellations
  drop constraint if exists reservation_cancellations_reservation_id_key;
create unique index if not exists reservation_policy_cancellation_once_idx
  on public.reservation_cancellations(reservation_id) where kind='policy_cancellation';
create unique index if not exists reservation_cancellation_guest_request_idx
  on public.reservation_cancellations(guest_request_id) where guest_request_id is not null;

alter table public.reservation_refunds
  add column if not exists provider_refunded_cents bigint
    check(provider_refunded_cents>=0),
  add column if not exists provider_paid_cents bigint
    check(provider_paid_cents>=0);

-- Only one claim against a charge can be in flight. The original key is
-- retained through timeouts; a second click cannot create a new request.
create or replace function public.claim_reservation_refund(p_refund_id uuid)
returns table(charge_id text, requested_cents bigint, idempotency_key text)
language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found or v.state<>'prepared' then return; end if;
  perform 1 from public.payments where id=v.payment_id for update;
  if exists(select 1 from public.reservation_refunds x where x.payment_id=v.payment_id
    and x.id<>v.id and x.state in ('dispatching','uncertain')) then return; end if;
  update public.reservation_refunds set state='dispatching',sent_at=null where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event) values(v.id,'claim');
  return query select v.charge_id,v.requested_cents,v.idempotency_key;
end $$;
revoke all on function public.claim_reservation_refund(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_refund(uuid) to service_role;

-- This is called only before the HTTP POST. No provider request was made, so
-- the same intent may be claimed again after the problem is fixed.
create or replace function public.refund_precheck_failed(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set state='prepared',sent_at=null
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_precheck_state_changed'; end if;
  insert into public.reservation_refund_attempts(refund_id,event)
    values(p_refund_id,'provider_unknown');
end $$;
revoke all on function public.refund_precheck_failed(uuid) from public,anon,authenticated;
grant execute on function public.refund_precheck_failed(uuid) to service_role;

-- The call boundary is persisted before contacting PagBank. A timeout after
-- this point remains uncertain and must never cause an automatic new POST.
create or replace function public.mark_refund_dispatch(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set sent_at=now()
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_dispatch_state_changed'; end if;
end $$;
revoke all on function public.mark_refund_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.mark_refund_dispatch(uuid) to service_role;

drop function if exists public.confirm_reservation_refund(uuid,text,text,bigint);
create function public.confirm_reservation_refund(
  p_refund_id uuid,p_charge_id text,p_provider_status text,
  p_provider_paid_cents bigint,p_provider_refunded_cents bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  c public.reservation_cancellations%rowtype;
  v_prior bigint; v_case_confirmed bigint; v_case_due bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  if v.state not in ('dispatching','uncertain') or v.sent_at is null or
     v.charge_id is distinct from p_charge_id or p_provider_status not in ('PAID','CANCELED') then
    raise exception 'provider_refund_unconfirmed';
  end if;
  select * into p from public.payments where id=v.payment_id for update;
  select * into c from public.reservation_cancellations where id=v.cancellation_id for update;
  if p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from v.charge_id
     or p.reservation_id is distinct from c.reservation_id
     or p_provider_paid_cents is distinct from p.amount_cents then
    raise exception 'refund_payment_mismatch';
  end if;
  select coalesce(sum(confirmed_cents),0) into v_prior from public.reservation_refunds
    where payment_id=p.id and id<>v.id and state='confirmed';
  -- Exact cumulative provider total is the receipt for this intent. A larger
  -- total may reflect an external refund and therefore needs manual review.
  if p_provider_refunded_cents is distinct from v_prior+v.requested_cents
     or p_provider_refunded_cents>p.amount_cents then
    raise exception 'provider_refund_amount_mismatch';
  end if;
  update public.reservation_refunds set state='confirmed',confirmed_cents=v.requested_cents,
    provider_status=p_provider_status,provider_paid_cents=p_provider_paid_cents,
    provider_refunded_cents=p_provider_refunded_cents,checked_at=now() where id=v.id;
  insert into public.reservation_refund_attempts(refund_id,event,provider_status)
    values(v.id,'provider_confirmed',p_provider_status);
  insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
    values(c.reservation_id,p.id,'refund',-v.requested_cents,'Estorno PagBank confirmado');
  if p_provider_refunded_cents=p.amount_cents then
    update public.payments set status='refunded',updated_at=now() where id=p.id;
  end if;
  select coalesce(sum(confirmed_cents),0),coalesce(sum(requested_cents),0)
    into v_case_confirmed,v_case_due from public.reservation_refunds where cancellation_id=c.id;
  if v_case_confirmed=c.refund_due_cents and v_case_due=c.refund_due_cents and
     not exists(select 1 from public.reservation_refunds where cancellation_id=c.id and state<>'confirmed') then
    update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
    if c.kind='policy_cancellation' then
      update public.reservations set status='cancelled',cancelled_at=now(),
        cancellation_actor=case when c.guest_request_id is null then 'admin' else 'guest' end,
        cancellation_reason=c.reason,updated_at=now()
        where id=c.reservation_id and status='confirmed';
      if not found then raise exception 'reservation_changed'; end if;
      update public.reservation_cancel_requests set status='completed'
        where id=c.guest_request_id and status in ('approved','processing');
      update public.experience_order_items set status='cancelled'
        where order_id in (select id from public.experience_orders where reservation_id=c.reservation_id)
          and status='active';
      update public.experience_orders set status='cancelled'
        where reservation_id=c.reservation_id and status='active';
    end if;
  end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_reservation_refund(uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund(uuid,text,text,bigint,bigint) to service_role;

create or replace function public.confirm_zero_refund_cancellation(p_cancellation_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.reservation_cancellations%rowtype;
begin
  select * into c from public.reservation_cancellations where id=p_cancellation_id for update;
  if not found or c.kind<>'policy_cancellation' or c.refund_due_cents<>0
    or c.status<>'pending_provider'
    or exists(select 1 from public.reservation_refunds where cancellation_id=c.id) then
    raise exception 'zero_refund_cancellation_invalid';
  end if;
  update public.reservation_cancellations set status='confirmed',confirmed_at=now() where id=c.id;
  update public.reservations set status='cancelled',cancelled_at=now(),
    cancellation_actor=case when c.guest_request_id is null then 'admin' else 'guest' end,
    cancellation_reason=c.reason,updated_at=now()
    where id=c.reservation_id and status='confirmed';
  if not found then raise exception 'reservation_changed'; end if;
  update public.reservation_cancel_requests set status='completed' where id=c.guest_request_id;
  update public.experience_order_items set status='cancelled'
    where order_id in (select id from public.experience_orders where reservation_id=c.reservation_id)
      and status='active';
  update public.experience_orders set status='cancelled'
    where reservation_id=c.reservation_id and status='active';
  return 'confirmed';
end $$;
revoke all on function public.confirm_zero_refund_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.confirm_zero_refund_cancellation(uuid) to service_role;
;

-- Historical: 20260928145523 refund_precheck_event
-- A failed read before dispatch is distinguishable from a request with
-- uncertain delivery. Neither event confirms that money moved.
alter table public.reservation_refund_attempts
  drop constraint if exists reservation_refund_attempts_event_check;
alter table public.reservation_refund_attempts
  add constraint reservation_refund_attempts_event_check
  check(event in ('claim','precheck_failed','request_accepted','request_uncertain',
    'provider_confirmed','provider_unknown','provider_failed'));

create or replace function public.refund_precheck_failed(p_refund_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_refunds set state='prepared',sent_at=null
    where id=p_refund_id and state='dispatching' and sent_at is null;
  if not found then raise exception 'refund_precheck_state_changed'; end if;
  insert into public.reservation_refund_attempts(refund_id,event)
    values(p_refund_id,'precheck_failed');
end $$;
revoke all on function public.refund_precheck_failed(uuid) from public,anon,authenticated;
grant execute on function public.refund_precheck_failed(uuid) to service_role;
;

-- Historical: 20260928153832 refund_provider_observations
-- Only provider identifiers, numeric charge totals and response codes are kept.
-- Never persist raw provider bodies, Authorization headers or card details.
create table if not exists public.reservation_refund_provider_observations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.reservation_refunds(id),
  phase text not null check (phase in ('post','get')),
  source text not null check (source in ('charge','order')),
  charge_id text not null check (charge_id ~ '^CHAR_[A-Za-z0-9-]+$'),
  http_status integer check (http_status between 100 and 599),
  error_code text check (error_code ~ '^[a-zA-Z0-9_]{1,40}$'),
  charge_status text check (charge_status ~ '^[A-Z_]{1,40}$'),
  amount_value bigint check (amount_value >= 0),
  summary_total bigint check (summary_total >= 0),
  summary_paid bigint check (summary_paid >= 0),
  summary_refunded bigint check (summary_refunded >= 0),
  observed_at timestamptz not null default now()
);
create index if not exists refund_observations_refund_idx
  on public.reservation_refund_provider_observations(refund_id,observed_at desc);
alter table public.reservation_refund_provider_observations enable row level security;
revoke all on public.reservation_refund_provider_observations from anon,authenticated;
grant all on public.reservation_refund_provider_observations to service_role;

-- Receipt fallback is intentionally narrower than GET confirmation: a
-- validated POST receipt AND a later GET of the identical paid charge are
-- required. Any conflicting provider summary prevents this path.
create or replace function public.confirm_reservation_refund_from_receipt(
  p_refund_id uuid,p_charge_id text,p_get_status text,p_get_amount bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  v_post public.reservation_refund_provider_observations%rowtype;
  v_get public.reservation_refund_provider_observations%rowtype;
  v_prior bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  select * into p from public.payments where id=v.payment_id;
  select * into v_post from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='post' and http_status between 200 and 299
      and charge_id=v.charge_id and summary_paid=p.amount_cents
      and summary_refunded=v.provider_refunded_cents
    order by observed_at desc limit 1;
  select * into v_get from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='get' and charge_id=v.charge_id
      and charge_status=p_get_status and amount_value=p_get_amount
      and observed_at>v_post.observed_at
    order by observed_at desc limit 1;
  select coalesce(sum(confirmed_cents),0) into v_prior
    from public.reservation_refunds where payment_id=p.id and id<>v.id and state='confirmed';
  if v.state not in ('dispatching','uncertain') or v.sent_at is null
    or v.charge_id is distinct from p_charge_id
    or p.provider<>'pagbank_sandbox' or p.status not in ('paid','refunded')
    or p.provider_payment_id is distinct from v.charge_id
    or v_post.id is null or v_get.id is null or v_get.http_status<>200
    or v_get.summary_refunded is not null
    or p_get_status not in ('PAID','CANCELED') or p_get_amount<>p.amount_cents
    or v.provider_paid_cents is distinct from p.amount_cents
    or v.provider_refunded_cents is distinct from v_prior+v.requested_cents
    or v.provider_refunded_cents>p.amount_cents
    or not exists(select 1 from public.reservation_refund_attempts
      where refund_id=v.id and event='request_accepted') then
    raise exception 'provider_receipt_not_reconciled';
  end if;
  return public.confirm_reservation_refund(v.id,v.charge_id,p_get_status,
    v.provider_paid_cents,v.provider_refunded_cents);
end $$;
revoke all on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  to service_role;
;

-- Historical: 20260928154243 refund_historical_observations
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
;

-- Historical: 20260928154340 refund_receipt_strictness
-- Strengthen receipt fallback checks before use.
create or replace function public.confirm_reservation_refund_from_receipt(
  p_refund_id uuid,p_charge_id text,p_get_status text,p_get_amount bigint
) returns text language plpgsql security definer set search_path = '' as $$
declare v public.reservation_refunds%rowtype; p public.payments%rowtype;
  v_post public.reservation_refund_provider_observations%rowtype;
  v_get public.reservation_refund_provider_observations%rowtype;
  v_prior bigint;
begin
  select * into v from public.reservation_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund_not_found'; end if;
  if v.state='confirmed' then return 'confirmed'; end if;
  select * into p from public.payments where id=v.payment_id;
  select * into v_post from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='post' and http_status between 200 and 299
      and source='charge' and charge_id=v.charge_id
      and amount_value=p.amount_cents and summary_total=p.amount_cents
      and summary_paid=p.amount_cents
      and summary_refunded=v.provider_refunded_cents
    order by observed_at desc limit 1;
  select * into v_get from public.reservation_refund_provider_observations
    where refund_id=v.id and phase='get' and source='charge' and charge_id=v.charge_id
      and charge_status=p_get_status and amount_value=p_get_amount
      and observed_at>v_post.observed_at
    order by observed_at desc limit 1;
  select coalesce(sum(confirmed_cents),0) into v_prior
    from public.reservation_refunds where payment_id=p.id and id<>v.id and state='confirmed';
  if v.state not in ('dispatching','uncertain') or v.sent_at is null
    or v.charge_id is distinct from p_charge_id
    or p.provider<>'pagbank_sandbox' or p.status not in ('paid','refunded')
    or p.provider_payment_id is distinct from v.charge_id
    or v_post.id is null or v_get.id is null or v_get.http_status<>200
    or v_get.summary_refunded is not null or v_get.summary_paid is not null
    or p_get_status not in ('PAID','CANCELED') or p_get_amount<>p.amount_cents
    or v.provider_paid_cents is distinct from p.amount_cents
    or v.provider_refunded_cents is distinct from v_prior+v.requested_cents
    or v.provider_refunded_cents>p.amount_cents
    or not exists(select 1 from public.reservation_refund_attempts
      where refund_id=v.id and event='request_accepted') then
    raise exception 'provider_receipt_not_reconciled';
  end if;
  return public.confirm_reservation_refund(v.id,v.charge_id,p_get_status,
    v.provider_paid_cents,v.provider_refunded_cents);
end $$;
revoke all on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.confirm_reservation_refund_from_receipt(uuid,text,text,bigint)
  to service_role;
;

-- Historical: 20260928162935 pagbank_buyer_interest_reconciliation
-- PagBank installment interest is part of the captured amount and refund allocation.
create or replace function public.reconcile_pagbank_sandbox_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_reservation_status text, result_reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype; v_status text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents then
    raise exception 'payment_mismatch';
  end if;
  select * into r from public.reservations where id=p.reservation_id for update;
  if not found then raise exception 'reservation_missing'; end if;
  v_status:=case p_status
    when 'PAID' then 'paid' when 'WAITING' then 'awaiting_payment'
    when 'IN_ANALYSIS' then 'under_review' when 'AUTHORIZED' then 'processing'
    when 'DECLINED' then 'refused' when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired'
    else null end;
  if v_status is null then raise exception 'unknown_provider_status'; end if;
  if p.status in ('refunded','partially_refunded','disputed','chargeback') then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status='paid' and v_status<>'paid' then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status in ('refused','cancelled','expired') and v_status not in ('paid') then
    return query select p.status,r.status,r.id; return;
  end if;
  if v_status='paid' then
    if coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)>0
       and coalesce((p.metadata->>'buyer_fee_applied')::boolean,false)=false then
      update public.reservations set total_amount=round((total_amount+
        (p.metadata->>'buyer_interest_cents')::bigint/100.0)::numeric,2),updated_at=now()
        where id=r.id;
      update public.payments set metadata=metadata||'{"buyer_fee_applied":true}'::jsonb where id=p.id;
    end if;
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status='confirmed' then
      update public.payments set metadata=metadata-'manual_review' where id=p.id;
    elsif r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
        update public.payments set metadata=metadata-'manual_review' where id=p.id;
      exception when exclusion_violation then
        update public.payments set metadata=metadata||'{"manual_review":"paid_dates_unavailable"}'::jsonb where id=p.id;
      end;
    else
      update public.payments set metadata=metadata||'{"manual_review":"paid_after_hold"}'::jsonb where id=p.id;
    end if;
  elsif v_status in ('refused','cancelled','expired') then
    if p.status not in ('paid','refused','cancelled','expired') then
      update public.payments set status=v_status,updated_at=now() where id=p.id;
      if r.status in ('pending_payment','hold') then
        update public.reservations set status='not_confirmed',not_confirmed_at=now(),
          not_confirmed_reason=case when v_status='refused' then 'payment_refused'
            when v_status='expired' then 'payment_expired' else 'payment_cancelled' end,
          hold_expires_at=now(),updated_at=now() where id=r.id;
        update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';
      end if;
    end if;
  elsif p.status in ('awaiting_payment','processing','under_review') then
    update public.payments set status=v_status,updated_at=now() where id=p.id;
    if v_status='under_review' and r.status='pending_payment' then
      update public.reservations set hold_expires_at=null,updated_at=now() where id=r.id;
    end if;
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.reservations where id=r.id),r.id;
end $$;
revoke all on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) to service_role;

-- Reconcile a post-booking charge only after a server-authenticated PagBank lookup.
create or replace function public.reconcile_pagbank_post_booking_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_charge_status text)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; c public.post_booking_charges%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents
     or p.metadata->>'kind'<>'post_booking_charge' then raise exception 'payment_mismatch'; end if;
  select * into c from public.post_booking_charges where payment_id=p.id for update;
  if not found or c.amount_cents<>coalesce((p.metadata->>'base_amount_cents')::bigint,p.amount_cents)
     or p.amount_cents<>c.amount_cents+coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)
     or c.user_id<>p.user_id then raise exception 'charge_mismatch'; end if;
  if p_status='PAID' then
    if c.status='applied' and p.status='paid' then
      return query select p.status,c.status; return;
    end if;
    if c.status in ('cancelled','expired') or c.expires_at<=now()
       or p.status in ('refused','expired','cancelled') then
      update public.payments set status='paid',
        metadata=metadata||'{"manual_review":"post_booking_paid_after_deadline"}'::jsonb,
        updated_at=now() where id=p.id;
    else
      begin
        perform public.finalize_post_booking_charge_atomic(p.id,p.user_id);
        if coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)>0 then
          insert into public.financial_entries(reservation_id,payment_id,entry_type,amount_cents,description)
            values(c.reservation_id,p.id,
              case when c.kind='modification' then 'additional_charge'
                   when c.snapshot->>'purchase_mode'='upgrade' then 'upgrade'
                   else 'experience' end,
              (p.metadata->>'buyer_interest_cents')::bigint,'Juros do parcelamento assumidos pelo hóspede');
          update public.reservations set total_amount=round((total_amount+
            (p.metadata->>'buyer_interest_cents')::bigint/100.0)::numeric,2),
            updated_at=now() where id=c.reservation_id;
        end if;
      exception when others then
        update public.payments set status='paid',
          metadata=metadata||'{"manual_review":"post_booking_apply_failed"}'::jsonb,
          updated_at=now() where id=p.id;
      end;
    end if;
  elsif p.status='paid' or p.status in ('refused','cancelled','expired') then
    null;
  elsif p_status in ('DECLINED','CANCELED','CANCELLED','EXPIRED') then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,
        case when p_status='DECLINED' then 'refused' else 'expired' end);
    end if;
  elsif p_status='IN_ANALYSIS' then
    if c.status in ('awaiting_payment','processing') then
      perform public.update_post_booking_payment_state_atomic(p.id,p.user_id,'under_review');
    end if;
  elsif p_status='AUTHORIZED' then
    update public.payments set status='processing',updated_at=now() where id=p.id;
  elsif p_status<>'WAITING' then
    raise exception 'unknown_provider_status';
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.post_booking_charges where id=c.id);
end $$;
revoke all on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reconcile_pagbank_post_booking_payment(uuid,text,text,bigint) to service_role;
;

-- Historical: 20260928192703 guarantee_provider_lifecycle
-- Sandbox guarantee operations are isolated from booking payments. Provider
-- outcomes must be observed before money or the guarantee status is final.
alter table public.guarantees
  add column if not exists provider_order_id text,
  add column if not exists provider_capture_before timestamptz,
  add column if not exists provider_last_status text,
  add column if not exists provider_error_code text,
  add column if not exists requested_capture_cents bigint,
  add column if not exists authorization_attempt integer not null default 0;

create unique index if not exists guarantees_one_per_reservation
  on public.guarantees(reservation_id);

alter table public.guarantees drop constraint if exists guarantees_status_check;
alter table public.guarantees add constraint guarantees_status_check check(status in
  ('pending','authorizing','authorization_uncertain','guaranteed','released',
   'release_requested','release_uncertain','incident_reported','capture_requested',
   'capture_uncertain','captured','disputed','resolved'));

alter table public.guarantees add constraint guarantees_requested_capture_bounds
  check(requested_capture_cents is null or
    (requested_capture_cents>0 and requested_capture_cents<=amount_cents));

-- The Edge Function uses service_role. Guests retain SELECT on their own
-- guarantee; there is no guest INSERT/UPDATE grant or policy for money states.
;

-- Historical: 20260928224139 guarantee_evidence_storage
-- Evidence is private, immutable through the client, and readable only by admins.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('guarantee-evidence','guarantee-evidence',false,8388608,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "guarantee_evidence_admin_insert" on storage.objects
for insert to authenticated
with check (bucket_id='guarantee-evidence' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));

create policy "guarantee_evidence_admin_select" on storage.objects
for select to authenticated
using (bucket_id='guarantee-evidence' and exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));
;

-- Historical: 20260929001017 guarantee_card_tokens
-- The provider's opaque card token is kept server-side and scoped to one reservation.
-- No card number, CVV, or encrypted card payload is persisted.
create table if not exists public.guarantee_card_tokens (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  provider text not null default 'pagbank_sandbox' check (provider = 'pagbank_sandbox'),
  card_token text not null check (card_token ~ '^CARD_[A-Za-z0-9-]+$'),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.guarantee_card_tokens enable row level security;
revoke all on public.guarantee_card_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.guarantee_card_tokens to service_role;

-- Tokens for reservations that never reached payment confirmation are discarded.
create or replace function public.purge_unconfirmed_guarantee_tokens()
returns void language sql security invoker set search_path = public as $$
  delete from public.guarantee_card_tokens t using public.reservations r
  where t.reservation_id=r.id and r.status in ('cancelled','expired','not_confirmed')
    and r.confirmed_at is null;
$$;
revoke all on function public.purge_unconfirmed_guarantee_tokens() from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_guarantee_tokens() to service_role;

-- The dispatch credential is generated in the database and read only by the
-- scheduler. The Edge Function checks it through a service-role-only RPC.
select vault.create_secret(encode(gen_random_bytes(32),'hex'),'guarantee_dispatch_secret')
where not exists (select 1 from vault.secrets where name='guarantee_dispatch_secret');

create or replace function public.verify_guarantee_dispatch_secret(p_secret text)
returns boolean language sql security definer set search_path = public, vault as $$
  select coalesce(length(p_secret)>=32 and exists (
    select 1 from vault.decrypted_secrets
    where name='guarantee_dispatch_secret' and decrypted_secret=p_secret
  ),false);
$$;
revoke all on function public.verify_guarantee_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_guarantee_dispatch_secret(text) to service_role;

;

-- Historical: 20260929010445 create_sandbox_guarantee_on_payment
-- PagBank installment interest is part of the captured amount and refund allocation.
create or replace function public.reconcile_pagbank_sandbox_payment(
  p_payment_id uuid, p_charge_id text, p_status text, p_amount_cents bigint
) returns table(result_payment_status text, result_reservation_status text, result_reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype; v_status text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.provider<>'pagbank_sandbox' or p.provider_payment_id is distinct from p_charge_id
     or p.amount_cents is distinct from p_amount_cents then
    raise exception 'payment_mismatch';
  end if;
  select * into r from public.reservations where id=p.reservation_id for update;
  if not found then raise exception 'reservation_missing'; end if;
  v_status:=case p_status
    when 'PAID' then 'paid' when 'WAITING' then 'awaiting_payment'
    when 'IN_ANALYSIS' then 'under_review' when 'AUTHORIZED' then 'processing'
    when 'DECLINED' then 'refused' when 'CANCELED' then 'cancelled'
    when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired'
    else null end;
  if v_status is null then raise exception 'unknown_provider_status'; end if;
  if p.status in ('refunded','partially_refunded','disputed','chargeback') then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status='paid' and v_status<>'paid' then
    return query select p.status,r.status,r.id; return;
  end if;
  if p.status in ('refused','cancelled','expired') and v_status not in ('paid') then
    return query select p.status,r.status,r.id; return;
  end if;
  if v_status='paid' then
    if coalesce((p.metadata->>'buyer_interest_cents')::bigint,0)>0
       and coalesce((p.metadata->>'buyer_fee_applied')::boolean,false)=false then
      update public.reservations set total_amount=round((total_amount+
        (p.metadata->>'buyer_interest_cents')::bigint/100.0)::numeric,2),updated_at=now()
        where id=r.id;
      update public.payments set metadata=metadata||'{"buyer_fee_applied":true}'::jsonb where id=p.id;
    end if;
    update public.payments set status='paid',updated_at=now() where id=p.id;
    if r.status='confirmed' then
      update public.payments set metadata=metadata-'manual_review' where id=p.id;
    elsif r.status in ('pending_payment','hold') and
       (r.hold_expires_at>now() or (r.hold_expires_at is null and p.status='under_review')) then
      begin
        update public.reservations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
          hold_expires_at=null,not_confirmed_at=null,not_confirmed_reason=null,updated_at=now() where id=r.id;
        update public.experience_orders set status='active'
          where reservation_id=r.id and status='pending';
        update public.payments set metadata=metadata-'manual_review' where id=p.id;
      exception when exclusion_violation then
        update public.payments set metadata=metadata||'{"manual_review":"paid_dates_unavailable"}'::jsonb where id=p.id;
      end;
    else
      update public.payments set metadata=metadata||'{"manual_review":"paid_after_hold"}'::jsonb where id=p.id;
    end if;
    -- A confirmed booking must have a guarantee row for the token scheduler.
    -- This also repairs an idempotent PAID callback that ran before the row existed.
    insert into public.guarantees(reservation_id,provider,amount_cents,status)
      select r.id,'pagbank_sandbox',pr.guarantee_amount_cents,'pending'
      from public.reservations confirmed
      join public.properties pr on pr.id=confirmed.property_id
      where confirmed.id=r.id and confirmed.status='confirmed'
        and pr.guarantee_amount_cents>0
      on conflict (reservation_id) do nothing;
  elsif v_status in ('refused','cancelled','expired') then
    if p.status not in ('paid','refused','cancelled','expired') then
      update public.payments set status=v_status,updated_at=now() where id=p.id;
      if r.status in ('pending_payment','hold') then
        update public.reservations set status='not_confirmed',not_confirmed_at=now(),
          not_confirmed_reason=case when v_status='refused' then 'payment_refused'
            when v_status='expired' then 'payment_expired' else 'payment_cancelled' end,
          hold_expires_at=now(),updated_at=now() where id=r.id;
        update public.experience_orders set status='cancelled' where reservation_id=r.id and status='pending';
      end if;
    end if;
  elsif p.status in ('awaiting_payment','processing','under_review') then
    update public.payments set status=v_status,updated_at=now() where id=p.id;
    if v_status='under_review' and r.status='pending_payment' then
      update public.reservations set hold_expires_at=null,updated_at=now() where id=r.id;
    end if;
  end if;
  return query select (select status from public.payments where id=p.id),
    (select status from public.reservations where id=r.id),r.id;
end $$;
revoke all on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_sandbox_payment(uuid,text,text,bigint) to service_role;

-- Restore already confirmed sandbox bookings with a vault token, without
-- authorizing cards or modifying existing guarantee lifecycles.
insert into public.guarantees(reservation_id,provider,amount_cents,status)
  select r.id,'pagbank_sandbox',pr.guarantee_amount_cents,'pending'
  from public.reservations r
  join public.properties pr on pr.id=r.property_id
  join public.guarantee_card_tokens t on t.reservation_id=r.id and t.user_id=r.user_id
  where r.status='confirmed' and pr.guarantee_amount_cents>0
    and exists (select 1 from public.payments p where p.reservation_id=r.id
      and p.provider='pagbank_sandbox' and p.status='paid')
  on conflict (reservation_id) do nothing;
;

