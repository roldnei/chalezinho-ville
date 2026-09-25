-- Complete the provider-agnostic notification contract for Phase 1.
-- Delivery remains external; this migration only guarantees durable outbox events.

insert into public.notification_templates(code,subject,body_text,provider_managed) values
('payment_refunded','Pagamento estornado','O estorno de {{amount}} foi registrado. Consulte os detalhes do pagamento na Área do Hóspede.',false),
('modification_rejected','Solicitação de alteração não aprovada','A solicitação de alteração não foi aprovada. Sua reserva original continua válida e nenhuma nova data foi confirmada.',false),
('modification_approved_confirmation','Alteração aprovada — confirme pelo site','A alteração foi aprovada sem valor adicional. Ela ainda não está confirmada: revise e confirme a alteração pela Área do Hóspede.',false),
('modification_confirmed','Alteração de reserva confirmada','Sua alteração foi confirmada. Consulte as novas datas e a propriedade na Área do Hóspede.',false)
on conflict(code) do update set
  subject=excluded.subject,
  body_text=excluded.body_text,
  provider_managed=excluded.provider_managed,
  active=true,
  updated_at=now();

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
  v_charge uuid;
  v_modification uuid;
  v_payload jsonb:='{}';
  v_key text;
begin
  if tg_table_name='payments' then
    v_user:=new.user_id;
    v_reservation:=new.reservation_id;
    if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
    v_template:=case new.status
      when 'awaiting_payment' then 'payment_awaiting'
      when 'under_review' then 'payment_under_review'
      when 'paid' then 'payment_paid'
      when 'refused' then 'payment_refused'
      when 'expired' then 'payment_expired'
      when 'refunded' then 'payment_refunded'
    end;
    v_payload:=jsonb_build_object('payment_id',new.id,'amount_cents',new.amount_cents,'method',new.method,'status',new.status);
    v_key:='payment:'||new.id::text||':'||new.status;
  elsif tg_table_name='reservations' then
    if new.status<>'confirmed' or (tg_op='UPDATE' and old.status='confirmed') then return new; end if;
    v_template:='reservation_confirmed';
    v_user:=new.user_id;
    v_reservation:=new.id;
    v_payload:=jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'check_out',new.check_out,'total_amount_cents',new.total_amount);
    v_key:='reservation:'||new.id::text||':confirmed';
  elsif tg_table_name='modification_requests' then
    if tg_op='INSERT' then
      v_template:='modification_requested';
    elsif new.status is not distinct from old.status then
      return new;
    else
      v_template:=case new.status
        when 'rejected' then 'modification_rejected'
        when 'awaiting_guest_acceptance' then 'modification_approved_confirmation'
        when 'applied' then 'modification_confirmed'
      end;
    end if;
    v_user:=new.user_id;
    v_reservation:=new.reservation_id;
    v_modification:=new.id;
    v_payload:=jsonb_build_object(
      'request_id',new.id,
      'status',new.status,
      'requested_property_id',new.requested_property_id,
      'requested_check_in',new.requested_check_in,
      'requested_check_out',new.requested_check_out,
      'amount_cents',new.admin_additional_amount_cents,
      'payment_due_at',new.payment_due_at
    );
    v_key:='modification:'||new.id::text||':'||new.status;
  elsif tg_table_name='post_booking_charges' then
    if new.status<>'applied' or (tg_op='UPDATE' and old.status='applied') or new.kind not in ('experience_add','experience_upgrade') then return new; end if;
    v_template:=case when new.kind='experience_upgrade' then 'experience_upgrade_paid' else 'experience_added_paid' end;
    v_user:=new.user_id;
    v_reservation:=new.reservation_id;
    v_charge:=new.id;
    v_payload:=jsonb_build_object('charge_id',new.id,'kind',new.kind,'description',new.description,'amount_cents',new.amount_cents);
    v_key:='charge:'||new.id::text||':applied';
  end if;

  if v_template is not null then
    insert into public.notification_outbox(
      user_id,reservation_id,modification_request_id,charge_id,
      template_code,send_after,payload,dedupe_key
    ) values(
      v_user,v_reservation,v_modification,v_charge,
      v_template,now(),v_payload,v_key
    ) on conflict(dedupe_key) do nothing;
  end if;

  if tg_table_name='reservations' and v_template='reservation_confirmed' then
    insert into public.notification_outbox(user_id,reservation_id,template_code,send_after,payload,dedupe_key)
    values(
      new.user_id,new.id,'pre_stay_important',
      greatest(now(),make_timestamptz(extract(year from new.check_in)::int,extract(month from new.check_in)::int,extract(day from new.check_in)::int,15,0,0,'America/Sao_Paulo')-interval '24 hours'),
      jsonb_build_object('confirmation_code',new.confirmation_code,'check_in',new.check_in,'action_path','/conta.html'),
      'reservation:'||new.id::text||':pre-stay'
    ) on conflict(dedupe_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists phase1_modification_notification_events on public.modification_requests;
create trigger phase1_modification_notification_events
after insert or update of status on public.modification_requests
for each row execute function public.enqueue_phase1_notification_events();

revoke all on function public.enqueue_phase1_notification_events() from public,anon,authenticated;
grant execute on function public.enqueue_phase1_notification_events() to service_role;
