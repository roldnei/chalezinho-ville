create table public.same_day_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 property_id bigint not null references public.properties(id), check_in date not null, check_out date not null,
 guests integer not null check (guests between 1 and 50), guest_name text not null check(length(guest_name) between 2 and 160),
 guest_phone text not null check(length(guest_phone) between 8 and 30), note text not null default '' check(length(note)<=1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','expired','booked')),
 expires_at timestamptz not null, decision_note text, decided_by uuid references auth.users(id), decided_at timestamptz,
 created_at timestamptz not null default now(), check(check_out>check_in), unique(user_id,property_id,check_in,check_out)
);
create index same_day_requests_queue_idx on public.same_day_requests(status,created_at);
alter table public.same_day_requests enable row level security;
revoke all on public.same_day_requests from public,anon,authenticated;
grant select,insert,update on public.same_day_requests to service_role;
insert into public.notification_templates(code,subject,body_text,active,provider_managed) values
 ('same_day_requested','URGENTE: pedido de reserva para hoje','Um hóspede pediu reserva para hoje. Consulte as datas, disponibilidade e dados do pedido no painel: {{approval_url}}. Abrir o link não aprova a reserva.',true,false),
 ('same_day_decided','Seu pedido de reserva foi analisado','Seu pedido está {{request_status}}. Consulte sua área do hóspede. Aprovação não confirma a reserva: é necessário concluir a contratação e o pagamento dentro do prazo.',true,false)
on conflict(code) do nothing;
create or replace function public.notify_same_day_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.admin_notifications(notification_type,severity,title,message,entity_type,entity_id,dedupe_key,payload)
   values('same_day_request','critical','URGENTE · Reserva para hoje',new.guest_name||' solicitou entrada hoje. Análise necessária.','same_day_request',new.id::text,'same-day:'||new.id::text,jsonb_build_object('request_id',new.id));
  insert into public.notification_outbox(user_id,template_code,dedupe_key,payload)
   select u.id,'same_day_requested','same-day-alert:'||new.id::text||':'||u.id::text,jsonb_build_object('request_id',new.id,'approval_url','https://chalezinho-ville-git-feature-guest-directory-roldneicosta-4140.vercel.app/admin.html?view=notifications&request='||new.id::text)
   from auth.users u join public.profiles p on p.id=u.id where p.role='admin' and lower(u.email)='roldneicosta@gmail.com';
 elsif new.status in ('approved','rejected') and old.status='pending' then
  insert into public.notification_outbox(user_id,template_code,dedupe_key,payload)
   values(new.user_id,'same_day_decided','same-day-decision:'||new.id::text,jsonb_build_object('request_status',case when new.status='approved' then 'aprovado para prosseguir ao pagamento' else 'recusado' end));
 end if;
 return new;
end $$;
revoke all on function public.notify_same_day_request() from public,anon,authenticated;
create trigger same_day_request_notification after insert or update of status on public.same_day_requests for each row execute function public.notify_same_day_request();
