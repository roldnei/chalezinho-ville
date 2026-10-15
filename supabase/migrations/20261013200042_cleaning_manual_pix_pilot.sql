-- Manual pilot: bank transfers are made outside this application and attested by an authorized administrator.
-- No webhook, split, custody, QR generation, bank API or automatic bank confirmation is claimed.
update public.cleaning_config set settings=settings||jsonb_build_object('payment_method','manual_pix','manual_confirmation_minutes',120,'manual_payout_hours',24,'manual_pix',jsonb_build_object('enabled',false,'key_type','random','key','','recipient_name','')),version=version+1,updated_at=now() where id=1;

create function cleaning_private.manual_key(p jsonb) returns void language plpgsql set search_path='' as $$declare k text=trim(coalesce(p->>'key',''));t text=p->>'key_type';begin
 if t is null or t not in ('random','email','phone','cpf','cnpj') or length(k)>254 or length(trim(coalesce(p->>'recipient_name','')))<2 or length(p->>'recipient_name')>100 then raise exception 'invalid_manual_pix';end if;
 if (t='random' and k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (t='email' and k !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (t='phone' and k !~ '^\+[1-9][0-9]{9,14}$') or (t='cpf' and k !~ '^[0-9]{11}$') or (t='cnpj' and k !~ '^[0-9]{14}$') then raise exception 'invalid_manual_pix';end if;
end $$;

alter table public.cleaning_jobs add column payout_paid_at timestamptz;
alter table public.cleaning_jobs add column payout_recorded_by uuid references auth.users(id);

create table public.cleaning_manual_receivers(user_id uuid primary key references public.cleaning_members(user_id),key_type text not null,key text not null,recipient_name text not null,verified boolean not null default false,verification_note text,updated_by uuid references auth.users(id),updated_at timestamptz not null default now());
create table public.cleaning_manual_invoices(payment_id uuid primary key references public.cleaning_payments(id),destination jsonb not null,recipient jsonb not null,reported_at timestamptz,review_until timestamptz,review_note text,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,updated_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.cleaning_manual_entries(id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.cleaning_manual_invoices(payment_id),kind text not null check(kind in ('credit','refund','payout','payout_zero')),bank_reference text not null unique check(length(bank_reference) between 5 and 120),amount_cents integer not null check(amount_cents>0 or (amount_cents=0 and kind='payout_zero')),bank_at timestamptz not null,recorded_by uuid not null references auth.users(id),parent_credit uuid references public.cleaning_manual_entries(id),state text not null check(state in ('applied','review','refund_due','refunded')),created_at timestamptz not null default now());
create index cleaning_manual_entries_payment on public.cleaning_manual_entries(payment_id,created_at);
create unique index cleaning_manual_one_refund on public.cleaning_manual_entries(parent_credit) where kind='refund';
create unique index cleaning_manual_one_payout on public.cleaning_manual_entries(payment_id) where kind in ('payout','payout_zero');
create index cleaning_manual_pending on public.cleaning_manual_entries(state) where kind='credit' and state in ('review','refund_due');
do $$declare t text;begin foreach t in array array['cleaning_manual_receivers','cleaning_manual_invoices','cleaning_manual_entries'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create trigger cleaning_audit after insert or update on public.%I for each row execute function cleaning_private.audit()',t);end loop;end $$;
create function cleaning_private.manual_history_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'financial_history_immutable';end if;
 if tg_table_name='cleaning_manual_invoices' then if new.destination is distinct from old.destination or new.recipient is distinct from old.recipient or new.payment_id<>old.payment_id then raise exception 'financial_history_immutable';end if;
 elsif (to_jsonb(new)-'state') is distinct from (to_jsonb(old)-'state') or new.state<>'refunded' or old.kind<>'credit' or old.state='refunded' then raise exception 'financial_history_immutable';end if;return new;
end $$;
create trigger cleaning_manual_invoice_guard before update or delete on public.cleaning_manual_invoices for each row execute function cleaning_private.manual_history_guard();
create trigger cleaning_manual_entry_guard before update or delete on public.cleaning_manual_entries for each row execute function cleaning_private.manual_history_guard();

create function public.cleaning_manual(p_actor uuid,p_action text,p jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare is_admin boolean;cfg jsonb;j public.cleaning_jobs;pay public.cleaning_payments;inv public.cleaning_manual_invoices;receiver public.cleaning_manual_receivers;entry public.cleaning_manual_entries;old_entry public.cleaning_manual_entries;attempt int;n int;amount int;bank_time timestamptz;ref text;valid boolean;begin
 if not exists(select 1 from public.profiles where id=p_actor) then raise exception 'login_required';end if;
 perform pg_advisory_xact_lock(710122026);perform set_config('cleaning.actor',p_actor::text,true);
 select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;select settings into cfg from public.cleaning_config where id=1;
 if p_action='receiver' then
  if nullif(p->>'user_id','') is not null and (p->>'user_id')::uuid<>p_actor and not is_admin then raise exception 'cleaning_admin_required';end if;
  perform cleaning_private.manual_key(p);select * into receiver from public.cleaning_manual_receivers where user_id=coalesce(nullif(p->>'user_id','')::uuid,p_actor) for update;
  if not exists(select 1 from public.cleaning_members where user_id=coalesce(nullif(p->>'user_id','')::uuid,p_actor) and worker) then raise exception 'professional_required';end if;
  if not is_admin and p->>'verified'='true' then raise exception 'cleaning_admin_required';end if;
  valid=is_admin and coalesce((p->>'verified')::boolean,false);if valid and length(trim(coalesce(p->>'verification_note','')))<5 then raise exception 'receiver_verification_required';end if;
  insert into public.cleaning_manual_receivers(user_id,key_type,key,recipient_name,verified,verification_note,updated_by) values(coalesce(nullif(p->>'user_id','')::uuid,p_actor),p->>'key_type',trim(p->>'key'),trim(p->>'recipient_name'),valid,case when is_admin then p->>'verification_note' end,p_actor)
  on conflict(user_id) do update set key_type=excluded.key_type,key=excluded.key,recipient_name=excluded.recipient_name,verified=case when is_admin then valid when excluded.key_type=cleaning_manual_receivers.key_type and excluded.key=cleaning_manual_receivers.key and excluded.recipient_name=cleaning_manual_receivers.recipient_name then cleaning_manual_receivers.verified else false end,verification_note=case when is_admin then excluded.verification_note when excluded.key_type=cleaning_manual_receivers.key_type and excluded.key=cleaning_manual_receivers.key and excluded.recipient_name=cleaning_manual_receivers.recipient_name then cleaning_manual_receivers.verification_note else null end,updated_by=p_actor,updated_at=now();return '{"saved":true}';
 end if;
 if p_action='claim' then
  perform public.cleaning_maintenance();select * into j from public.cleaning_jobs where id=(p->>'job_id')::uuid for update;
  if j.id is null or j.owner_id<>p_actor then raise exception 'job_not_found';end if;if j.is_test then raise exception 'test_service_not_real';end if;
  if j.state<>'awaiting_pix' or j.pay_until<=now() or j.change_pending is not null then raise exception 'payment_not_allowed';end if;
  if cfg->>'payment_method' is distinct from 'manual_pix' or j.snapshot->'conditions'->>'payment_method' is distinct from 'manual_pix' then raise exception 'payment_method_changed';end if;
  if not coalesce((cfg->'manual_pix'->>'enabled')::boolean,false) then raise exception 'manual_pix_not_configured';end if;perform cleaning_private.manual_key(cfg->'manual_pix');
  select * into pay from public.cleaning_payments where job_id=j.id and status in ('pending','paid','uncertain','refund_pending','creating') order by attempt desc limit 1;
  if pay.id is not null then if pay.provider<>'manual_pix' then raise exception 'payment_method_changed';end if;return jsonb_build_object('payment_id',pay.id,'new',false);end if;
  select * into receiver from public.cleaning_manual_receivers where user_id=j.worker_id and verified;if receiver.user_id is null then raise exception 'receiver_verification_required';end if;
  if not exists(select 1 from public.cleaning_members where user_id=j.worker_id and worker_approved and not blocked) then raise exception 'service_unavailable';end if;
  select coalesce(max(x.attempt),0)+1 into attempt from public.cleaning_payments x where x.job_id=j.id;
  insert into public.cleaning_payments(job_id,attempt,worker_id,provider,environment,reference_id,amount_cents,net_cents,platform_cents,status,expires_at,receiver_id) values(j.id,attempt,j.worker_id,'manual_pix',cfg->'provider'->>'environment','manual_'||replace(j.id::text,'-','')||'_'||attempt,(j.snapshot->>'owner_total_cents')::int,(j.snapshot->>'worker_net_cents')::int,(j.snapshot->>'platform_cents')::int,'pending',j.pay_until,j.worker_id::text) returning * into pay;
  insert into public.cleaning_manual_invoices(payment_id,destination,recipient,updated_by) values(pay.id,(cfg->'manual_pix')-'enabled',jsonb_build_object('key_type',receiver.key_type,'key',receiver.key,'recipient_name',receiver.recipient_name),p_actor);
  return jsonb_build_object('payment_id',pay.id,'new',true);
 end if;
 select * into pay from public.cleaning_payments where id=(p->>'payment_id')::uuid and provider='manual_pix' for update;if pay.id is null then raise exception 'payment_not_found';end if;
 select * into j from public.cleaning_jobs where id=pay.job_id for update;select * into inv from public.cleaning_manual_invoices where payment_id=pay.id for update;
 if p_action='report' then
  if j.owner_id<>p_actor then raise exception 'job_not_found';end if;
  if pay.status<>'pending' or pay.expires_at<=now() or j.state<>'awaiting_pix' or j.worker_id is distinct from pay.worker_id then raise exception 'payment_not_allowed';end if;
  if inv.reported_at is null then update public.cleaning_manual_invoices set reported_at=now(),review_until=now()+make_interval(mins=>(j.snapshot->'conditions'->>'manual_confirmation_minutes')::int),updated_by=p_actor where payment_id=pay.id;perform cleaning_private.notify(j,'Cliente informou que fez o Pix. Aguarda conferência do crédito no extrato pela administração.');end if;return '{"saved":true,"paid":false}';
 end if;
 if not is_admin then raise exception 'cleaning_admin_required';end if;if j.is_test then raise exception 'test_service_not_real';end if;
 if p_action='not_received' then
  if p->>'checked_statement' is distinct from 'true' or length(trim(coalesce(p->>'note','')))<5 or exists(select 1 from public.cleaning_manual_entries where payment_id=pay.id and kind='credit' and state<>'refunded') or pay.status not in ('pending','expired') then raise exception 'manual_statement_required';end if;
  if inv.reported_at is null and pay.expires_at>now() then raise exception 'payment_not_allowed';end if;
  update public.cleaning_manual_invoices set review_note=p->>'note',reviewed_by=p_actor,reviewed_at=now(),updated_by=p_actor where payment_id=pay.id;update public.cleaning_payments set status='expired',updated_at=now() where id=pay.id;
  if j.state='awaiting_pix' and j.worker_id=pay.worker_id and j.accepted_at<=pay.created_at then update public.cleaning_jobs set pay_until=least(pay_until,now()-interval '1 millisecond') where id=j.id;end if;perform public.cleaning_maintenance();return '{"saved":true}';
 elsif p_action='payout_start' then
  if pay.status<>'paid' or j.state<>'approved' or j.payout not in ('authorized','processing','paid') or j.change_pending is not null or exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') then raise exception 'payout_not_allowed';end if;
  if j.payout='paid' then return '{"saved":true,"paid":true}';end if;
  update public.cleaning_jobs set payout='processing',updated_by=p_actor,updated_at=now() where id=j.id and payout='authorized';return '{"saved":true,"paid":false}';
 end if;
 if p_action not in ('credit','refund','payout') then raise exception 'invalid_action';end if;
 ref=trim(coalesce(p->>'bank_reference',''));amount=(p->>'amount_cents')::int;bank_time=(p->>'bank_at')::timestamptz;
 if p->>'checked_statement' is distinct from 'true' or length(ref) not between 5 and 120 or amount is null or amount<0 or bank_time is null or bank_time>now()+interval '5 minutes' or bank_time<pay.created_at-interval '5 minutes' then raise exception 'manual_statement_required';end if;
 select * into old_entry from public.cleaning_manual_entries where bank_reference=ref;if old_entry.id is not null then
  if old_entry.payment_id<>pay.id or (p_action='refund' and old_entry.parent_credit is distinct from (p->>'credit_id')::uuid) or old_entry.amount_cents<>amount or old_entry.kind<>(case when p_action='payout' and amount=0 then 'payout_zero' else case p_action when 'credit' then 'credit' when 'refund' then 'refund' else 'payout' end end) then raise exception 'bank_reference_already_used';end if;
  return jsonb_build_object('entry_id',old_entry.id,'state',old_entry.state,'replayed',true);
 end if;
 if p_action='credit' then
  if amount<=0 then raise exception 'manual_statement_required';end if;
  valid=pay.status='pending' and j.state='awaiting_pix' and j.worker_id=pay.worker_id and j.accepted_at<=pay.created_at and j.change_pending is null and coalesce(inv.review_until,pay.expires_at)>=now() and bank_time<=pay.expires_at and amount=pay.amount_cents and not exists(select 1 from public.cleaning_payments x where x.job_id=j.id and x.attempt>pay.attempt);
  insert into public.cleaning_manual_entries(payment_id,kind,bank_reference,amount_cents,bank_at,recorded_by,state) values(pay.id,'credit',ref,amount,bank_time,p_actor,case when valid then 'applied' when pay.status='paid' or pay.status in ('expired','refunded','refund_pending') or coalesce(inv.review_until,pay.expires_at)<now() then 'refund_due' else 'review' end) returning * into entry;
  if not valid and entry.state='refund_due' then perform cleaning_private.notify(j,'Crédito repetido ou fora do prazo registrado. A administração vai analisar e registrar a devolução; não confirma outra faxina.');end if;
  if valid then update public.cleaning_payments set status='paid',paid_at=bank_time,updated_at=now() where id=pay.id;update public.cleaning_jobs set state='confirmed',updated_by=p_actor,updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Administração conferiu o crédito do Pix no extrato. Faxina confirmada.');
  elsif pay.status='pending' and entry.state='review' then update public.cleaning_payments set status='uncertain',provider_error='manual_amount_review',updated_at=now() where id=pay.id;perform cleaning_private.notify(j,'Transferência com valor ou condições divergentes. Aguarda análise administrativa; faxina ainda não confirmada.');end if;
 elsif p_action='refund' then
  select * into entry from public.cleaning_manual_entries where id=(p->>'credit_id')::uuid and payment_id=pay.id and kind='credit' for update;
  if entry.id is null or amount<>entry.amount_cents or entry.state='refunded' or bank_time<entry.bank_at or (entry.state='applied' and (j.state<>'refund_pending' or j.payout='paid')) then raise exception 'refund_not_authorized';end if;
  insert into public.cleaning_manual_entries(payment_id,kind,bank_reference,amount_cents,bank_at,recorded_by,parent_credit,state) values(pay.id,'refund',ref,amount,bank_time,p_actor,entry.id,'applied');update public.cleaning_manual_entries set state='refunded' where id=entry.id;
  if not exists(select 1 from public.cleaning_manual_entries where payment_id=pay.id and kind='credit' and state<>'refunded') then
   update public.cleaning_payments set status='refunded',refunded_at=bank_time,updated_at=now() where id=pay.id;
   if j.state='refund_pending' and not exists(select 1 from public.cleaning_payments x where x.job_id=j.id and x.attempt>pay.attempt) then update public.cleaning_jobs set state='refunded',payout='not_authorized',updated_by=p_actor,updated_at=now() where id=j.id;end if;
  end if;perform cleaning_private.notify(j,'Devolução registrada após conferência da transferência bancária pela administração.');
 elsif p_action='payout' then
  if pay.status<>'paid' or j.state<>'approved' or j.payout not in ('authorized','processing') or j.change_pending is not null or exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') or amount<>pay.net_cents or bank_time<j.approved_at or not exists(select 1 from public.cleaning_manual_entries where payment_id=pay.id and kind='credit' and state='applied') then raise exception 'payout_not_allowed';end if;
  insert into public.cleaning_manual_entries(payment_id,kind,bank_reference,amount_cents,bank_at,recorded_by,state) values(pay.id,case when amount=0 then 'payout_zero' else 'payout' end,ref,amount,bank_time,p_actor,'applied');update public.cleaning_jobs set payout='paid',payout_reference=ref,payout_paid_at=bank_time,payout_recorded_by=p_actor,updated_by=p_actor,updated_at=now() where id=j.id;perform cleaning_private.notify(j,case when amount=0 then 'Repasse encerrado: líquido acordado de zero, sem transferência bancária.' else 'Administração registrou o Pix enviado à profissional após conferir a transferência.' end);
 end if;
 return jsonb_build_object('entry_id',entry.id,'state',entry.state,'saved',true);
end $$;

create function public.cleaning_manual_read(p_actor uuid,p_job uuid default null) returns jsonb language plpgsql set search_path='' as $$declare is_admin boolean;j public.cleaning_jobs;result jsonb;begin
 select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;
 if p_job is not null then
  select * into j from public.cleaning_jobs where id=p_job;if j.id is null or not cleaning_private.allowed(p_actor,j) then raise exception 'job_not_found';end if;
  if not is_admin and j.owner_id<>p_actor then return 'null';end if;
  return (select jsonb_build_object('payment_id',x.id,'method','manual_pix','status',x.status,'environment',x.environment,'amount_cents',x.amount_cents,'expires_at',x.expires_at,'reported_at',i.reported_at,'review_until',i.review_until,'destination',case when is_admin or (x.status='pending' and i.reported_at is null and x.expires_at>now()) then i.destination end,'entries',case when is_admin then coalesce((select jsonb_agg(e) from public.cleaning_manual_entries e where payment_id=x.id),'[]') else '[]'::jsonb end) from public.cleaning_payments x join public.cleaning_manual_invoices i on i.payment_id=x.id where x.job_id=j.id order by x.attempt desc limit 1);
 end if;
 result=jsonb_build_object('receiver',(select to_jsonb(x) from public.cleaning_manual_receivers x where x.user_id=p_actor));
 if is_admin then result=result||jsonb_build_object('receivers',coalesce((select jsonb_agg(x) from public.cleaning_manual_receivers x),'[]'),'payments',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('property_name',pr.name,'owner_name',m.name,'worker_name',w.name,'job_state',job_row.state,'payout',job_row.payout,'destination',i.destination,'recipient',i.recipient,'reported_at',i.reported_at,'review_until',i.review_until,'entries',coalesce((select jsonb_agg(e order by e.created_at) from public.cleaning_manual_entries e where e.payment_id=x.id),'[]')) order by x.created_at desc) from public.cleaning_payments x join public.cleaning_manual_invoices i on i.payment_id=x.id join public.cleaning_jobs job_row on job_row.id=x.job_id join public.cleaning_properties pr on pr.id=job_row.property_id join public.cleaning_members m on m.user_id=job_row.owner_id join public.cleaning_members w on w.user_id=x.worker_id),'[]'));end if;return result;
end $$;

-- Extend existing validated functions without replacing their latest PMS/execution behavior.
do $$declare def text;needle text;begin
 def=pg_get_functiondef('cleaning_private.validate_settings(jsonb)'::regprocedure);
 def=replace(def,'begin','begin
 if c->>''payment_method'' is null or c->>''payment_method'' not in (''manual_pix'',''pagbank'') or coalesce(c->>''manual_confirmation_minutes'','''') !~ ''^\d+$'' or (c->>''manual_confirmation_minutes'')::int not between 1 and 1440 or coalesce(c->>''manual_payout_hours'','''') !~ ''^\d+$'' or (c->>''manual_payout_hours'')::int not between 1 and 720 then raise exception ''invalid_manual_pix'';end if;
 if jsonb_typeof(c->''manual_pix''->''enabled'') is distinct from ''boolean'' then raise exception ''invalid_manual_pix'';end if;
 if coalesce((c->''manual_pix''->>''enabled'')::boolean,false) then perform cleaning_private.manual_key(c->''manual_pix'');end if;');execute def;
 def=pg_get_functiondef('cleaning_private.quote(uuid,uuid,uuid,jsonb)'::regprocedure);execute replace(def,'''conditions'',c-''provider''-''categories''-''addons''','''conditions'',c-''provider''-''manual_pix''-''categories''-''addons''');
 def=pg_get_functiondef('public.cleaning_read(uuid,uuid)'::regprocedure);def=replace(def,'c-''provider''','c-''provider''-''manual_pix''');execute replace(def,'''scope'',x.snapshot','''payment_method'',x.snapshot->''conditions''->>''payment_method'',''scope'',x.snapshot');
 def=pg_get_functiondef('public.cleaning_payment_claim(uuid,uuid)'::regprocedure);execute replace(def,'select settings->''provider'' into c','if exists(select 1 from public.cleaning_config where id=1 and settings->>''payment_method''=''manual_pix'') then raise exception ''payment_method_changed'';end if; select settings->''provider'' into c');
 def=pg_get_functiondef('public.cleaning_maintenance()'::regprocedure);needle='select settings into c from public.cleaning_config where id=1;';
 if position(needle in def)=0 then raise exception 'cleaning_maintenance_changed';end if;
 def=replace(def,needle,needle||' update public.cleaning_payments x set status=''expired'',updated_at=now() from public.cleaning_manual_invoices i where i.payment_id=x.id and x.provider=''manual_pix'' and x.status=''pending'' and coalesce(i.review_until,x.expires_at)<now();');
 execute replace(def,'''Conferência encerrada. Repasse autorizado; aguardando processamento pelo intermediador.''','case when j.snapshot->''conditions''->>''payment_method''=''manual_pix'' then ''Conferência encerrada. Repasse autorizado; a administração fará e registrará o Pix à profissional.'' else ''Conferência encerrada. Repasse autorizado; aguardando processamento pelo intermediador.'' end');
end $$;
create function cleaning_private.manual_payout_forecast() returns trigger language plpgsql set search_path='' as $$begin
 if new.state='approved' and old.state<>'approved' and new.snapshot->'conditions'->>'payment_method'='manual_pix' then new.payout_expected_at=new.approved_at+make_interval(hours=>(new.snapshot->'conditions'->>'manual_payout_hours')::int);end if;return new;
end $$;
create trigger cleaning_manual_forecast before update on public.cleaning_jobs for each row execute function cleaning_private.manual_payout_forecast();
revoke all on function public.cleaning_manual(uuid,text,jsonb),public.cleaning_manual_read(uuid,uuid),cleaning_private.manual_key(jsonb),cleaning_private.manual_history_guard(),cleaning_private.manual_payout_forecast() from public,anon,authenticated;
grant execute on function public.cleaning_manual(uuid,text,jsonb),public.cleaning_manual_read(uuid,uuid),cleaning_private.manual_key(jsonb),cleaning_private.manual_history_guard(),cleaning_private.manual_payout_forecast() to service_role;
