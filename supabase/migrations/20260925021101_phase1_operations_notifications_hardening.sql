-- Applied as phase1_operations_notifications_hardening; includes the reconciled final definition of the notification contract.
create index if not exists post_booking_cart_items_target_variant_idx
  on public.post_booking_cart_items(target_variant_id);

insert into public.property_integrations(property_id,provider,environment_key,active)
select p.id,'booking',case p.code when 'CH1' then 'ICAL_BOOKING_CH1' when 'CH2' then 'ICAL_BOOKING_CH2' when 'CH3' then 'ICAL_BOOKING_CH3' end,true
from public.properties p
where p.code in ('CH1','CH2','CH3')
and not exists(select 1 from public.property_integrations i where i.property_id=p.id and i.provider='booking');

alter table public.notification_outbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;
alter table public.notification_outbox drop constraint if exists notification_outbox_attempt_count_check;
alter table public.notification_outbox add constraint notification_outbox_attempt_count_check
  check(attempt_count between 0 and max_attempts and max_attempts between 1 and 20);
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check
  check(status in ('queued','processing','sent','failed','cancelled'));

create table if not exists public.notification_templates(
  code text primary key,subject text not null,body_text text not null,
  active boolean not null default true,provider_managed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_templates enable row level security;

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
on conflict(code) do update set subject=excluded.subject,body_text=excluded.body_text,provider_managed=excluded.provider_managed,updated_at=now();

create or replace function public.enqueue_phase1_notification_events()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_template text; v_user uuid; v_reservation uuid; v_payload jsonb:='{}'; v_key text;
begin
 if tg_table_name='payments' then
  v_user:=new.user_id; v_reservation:=new.reservation_id;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  v_template:=case new.status when 'awaiting_payment' then 'payment_awaiting' when 'under_review' then 'payment_under_review' when 'paid' then 'payment_paid' when 'refused' then 'payment_refused' when 'expired' then 'payment_expired' when 'refunded' then 'payment_refunded' end;
  v_payload:=jsonb_build_object('payment_id',new.id,'amount_cents',new.amount_cents,'method',new.method,'status',new.status);
  v_key:='payment:'||new.id::text||':'||new.status;
 elsif tg_table_name='reservations' then
  if new.status<>'confirmed' or (tg_op='UPDATE' and old.status='confirmed') then return new; end if;
  v_template:='reservation_confirmed';v_user:=new.user_id;v_reservation:=new.id;
  v_payload:=jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'check_out',new.check_out,'total_amount_cents',new.total_amount);
  v_key:='reservation:'||new.id::text||':confirmed';
 elsif tg_table_name='modification_requests' then
  if tg_op<>'INSERT' then return new; end if;
  v_template:='modification_requested';v_user:=new.user_id;v_reservation:=new.reservation_id;
  v_payload:=jsonb_build_object('request_id',new.id,'requested_check_in',new.requested_check_in,'requested_check_out',new.requested_check_out);
  v_key:='modification:'||new.id::text||':requested';
 elsif tg_table_name='post_booking_charges' then
  if new.status<>'applied' or (tg_op='UPDATE' and old.status='applied') or new.kind not in ('experience','upgrade') then return new; end if;
  v_template:=case when new.kind='upgrade' then 'experience_upgrade_paid' else 'experience_added_paid' end;
  v_user:=new.user_id;v_reservation:=new.reservation_id;
  v_payload:=jsonb_build_object('charge_id',new.id,'kind',new.kind,'description',new.description,'amount_cents',new.amount_cents);
  v_key:='charge:'||new.id::text||':applied';
 end if;
 if v_template is not null then
  insert into public.notification_outbox(user_id,reservation_id,charge_id,template_code,send_after,payload,dedupe_key)
  values(v_user,v_reservation,case when tg_table_name='post_booking_charges' then new.id else null end,v_template,now(),v_payload,v_key)
  on conflict(dedupe_key) do nothing;
 end if;
 if tg_table_name='reservations' and v_template='reservation_confirmed' then
  insert into public.notification_outbox(user_id,reservation_id,template_code,send_after,payload,dedupe_key)
  values(new.user_id,new.id,'pre_stay_important',greatest(now(),make_timestamptz(extract(year from new.check_in)::int,extract(month from new.check_in)::int,extract(day from new.check_in)::int,15,0,0,'America/Sao_Paulo')-interval '24 hours'),jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'action_path','/conta.html'),'reservation:'||new.id::text||':pre-stay')
  on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;

drop trigger if exists phase1_payment_notification_events on public.payments;
create trigger phase1_payment_notification_events after insert or update of status on public.payments for each row execute function public.enqueue_phase1_notification_events();
drop trigger if exists phase1_reservation_notification_events on public.reservations;
create trigger phase1_reservation_notification_events after insert or update of status on public.reservations for each row execute function public.enqueue_phase1_notification_events();
drop trigger if exists phase1_modification_notification_events on public.modification_requests;
create trigger phase1_modification_notification_events after insert on public.modification_requests for each row execute function public.enqueue_phase1_notification_events();
drop trigger if exists phase1_charge_notification_events on public.post_booking_charges;
create trigger phase1_charge_notification_events after insert or update of status on public.post_booking_charges for each row execute function public.enqueue_phase1_notification_events();

create or replace function public.claim_notification_outbox(p_limit integer default 20)
returns setof public.notification_outbox language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with picked as (
  select id from public.notification_outbox where status='queued' and send_after<=now() and attempt_count<max_attempts
  order by send_after,created_at for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
 ) update public.notification_outbox o set status='processing',attempt_count=o.attempt_count+1,last_attempt_at=now(),last_error=null
 from picked p where o.id=p.id returning o.*;
end $$;

create or replace function public.complete_notification_outbox(p_id uuid,p_sent boolean,p_error text default null,p_retry_after_seconds integer default 300)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.notification_outbox%rowtype;v_status text;
begin
 select * into o from public.notification_outbox where id=p_id for update;
 if not found then raise exception 'notification_not_found'; end if;
 if o.status='sent' then return 'sent'; end if;
 if o.status<>'processing' then raise exception 'notification_not_processing'; end if;
 if p_sent then update public.notification_outbox set status='sent',sent_at=now(),last_error=null where id=o.id;return 'sent';end if;
 v_status:=case when o.attempt_count>=o.max_attempts then 'failed' else 'queued' end;
 update public.notification_outbox set status=v_status,last_error=left(coalesce(p_error,'provider_error'),1000),send_after=case when v_status='queued' then now()+make_interval(secs=>greatest(30,least(coalesce(p_retry_after_seconds,300),86400))) else send_after end where id=o.id;
 return v_status;
end $$;

revoke insert,update,delete,truncate,references,trigger on all tables in schema public from anon,authenticated;
revoke all on public.notification_templates from public,anon,authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
grant insert on public.account_deletion_requests to authenticated;
grant all on public.notification_templates to service_role;
revoke all on function public.enqueue_phase1_notification_events() from public,anon,authenticated;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.complete_notification_outbox(uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.enqueue_phase1_notification_events() to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.complete_notification_outbox(uuid,boolean,text,integer) to service_role;
