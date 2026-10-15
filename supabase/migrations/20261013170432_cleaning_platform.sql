-- Independent marketplace: no writes to lodging reservations or payments.
create schema cleaning_private;
revoke all on schema cleaning_private from public,anon,authenticated;
create table public.cleaning_admins(user_id uuid primary key references auth.users(id),active boolean not null default true,created_by uuid references auth.users(id),created_at timestamptz not null default now());
insert into public.cleaning_admins(user_id) select id from public.profiles where role='admin' and pms_access_status='active';
create table public.cleaning_config(id smallint primary key check(id=1),version integer not null default 1,settings jsonb not null,updated_by uuid references auth.users(id),updated_at timestamptz not null default now());
insert into public.cleaning_config(id,settings) values(1,'{
 "pilot":true,"public_registration":true,"categories":[{"id":"35","area":35,"rooms":1,"bathrooms":1,"cents":10000},{"id":"55","area":55,"rooms":1,"bathrooms":1,"cents":13000},{"id":"70-1","area":70,"rooms":2,"bathrooms":1,"cents":15500},{"id":"70-2","area":70,"rooms":2,"bathrooms":2,"cents":18000},{"id":"90","area":90,"rooms":3,"bathrooms":2,"cents":22000},{"id":"120","area":120,"rooms":3,"bathrooms":2,"cents":28000},{"id":"160","area":160,"rooms":4,"bathrooms":3,"cents":35000},{"id":"200","area":200,"rooms":5,"bathrooms":4,"cents":42000}],
 "beds":{"types":[{"id":"double","label":"Casal"},{"id":"single","label":"Solteiro"}],"double_type":"double","single_type":"single","double_included":1,"single_included":2,"mixed":"double_first","extra_cents":500},
 "owner_fee":{"type":"percent","value":1000},"worker_fee":{"type":"percent","value":0},
 "service":{"name":"Limpeza padrão","scope":"Limpar pisos, superfícies acessíveis, cozinha e banheiros. Arrumar camas e trocar o enxoval limpo fornecido pelo proprietário. Não inclui lavagem de enxoval, limpeza pesada, pós-obra, vidros altos ou serviços especiais.","linen_change":true,"checklist":[{"label":"Banheiro limpo","photo":true},{"label":"Quarto e camas prontos","photo":true},{"label":"Cozinha e pisos limpos","photo":true}]},
 "addons":[],"duration_minutes":120,"travel_minutes":30,"payment_minutes":30,"review_hours":24,"rating_hours":72,"incident_hours":72,"lead_hours":24,"ready_minutes":30,"distribution":"offer","expiry":"reoffer","cancellation":{"unpaid":"free","paid":"admin_review"},
 "provider":{"enabled":false,"environment":"sandbox","split_verified":false,"pix_custody_verified":false,"settlement_verified":false,"evidence":"","custody_days":90},
 "terms_version":"pilot-draft-1","terms":"Proposta para revisão jurídica: preço e escopo são informados antes do aceite. A profissional escolhe os serviços que deseja realizar. Problemas são analisados com evidências e direito de resposta. Não há desconto automático por alegações de danos. Não anunciamos seguro nem volume garantido. Lavagem de enxoval é contratada separadamente."
}');
create table public.cleaning_members(user_id uuid primary key references auth.users(id),name text not null check(length(name) between 2 and 100),phone text not null,owner boolean not null default false,worker boolean not null default false,city text,bairros text[] not null default '{}',availability jsonb not null default '{"days":[0,1,2,3,4,5,6],"start":"08:00","end":"18:00"}',services text[] not null default '{standard}',owner_released boolean not null default false,worker_released boolean not null default false,worker_approved boolean not null default false,blocked boolean not null default false,interest_at timestamptz,owner_fee jsonb,worker_fee jsonb,updated_by uuid references auth.users(id),updated_at timestamptz not null default now());
create table public.cleaning_receivers(user_id uuid primary key references public.cleaning_members(user_id),account_id text not null,verified boolean not null default false,verification_reference text,updated_by uuid references auth.users(id),updated_at timestamptz not null default now());
create table public.cleaning_properties(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.cleaning_members(user_id),name text not null check(length(name) between 2 and 100),type text not null check(type in ('apartment','house','chalet','other')),city text not null,bairro text not null,area numeric check(area>0 and area<=100000),rooms integer not null check(rooms between 0 and 100),bathrooms integer not null check(bathrooms between 0 and 100),beds jsonb not null default '[]',environments text[] not null default '{}',supplies text[] not null default '{}',favorite uuid references public.cleaning_members(user_id),price_override_cents integer check(price_override_cents>=0),rules jsonb not null default '{}',pms_property_id bigint references public.properties(id),show_pms boolean not null default false,auto_clean boolean not null default false,updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),check(not auto_clean or (show_pms and pms_property_id is not null)),check(not show_pms or pms_property_id is not null));
create unique index cleaning_pms_property_unique on public.cleaning_properties(pms_property_id) where pms_property_id is not null;
create table public.cleaning_access(property_id uuid primary key references public.cleaning_properties(id),address text not null,instructions text not null default '',care text not null default '',updated_by uuid references auth.users(id),updated_at timestamptz not null default now());
create table public.cleaning_jobs(id uuid primary key default gen_random_uuid(),property_id uuid not null references public.cleaning_properties(id),owner_id uuid not null references public.cleaning_members(user_id),worker_id uuid references public.cleaning_members(user_id),target_worker uuid references public.cleaning_members(user_id),state text not null default 'requested' check(state in ('routine','requested','awaiting_pix','confirmed','in_progress','review','correction','approved','cancelled','refund_pending','refunded')),starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),duration_minutes integer not null check(duration_minutes>0),travel_minutes integer not null check(travel_minutes>=0),snapshot jsonb not null,accepted_at timestamptz,pay_until timestamptz,started_at timestamptz,submitted_at timestamptz,review_until timestamptz,approved_at timestamptz,payout text not null default 'not_authorized' check(payout in ('not_authorized','authorized','processing','paid')),payout_reference text,payout_expected_at timestamptz,ops_task_id uuid unique references public.ops_tasks(id),routine_stay_id uuid references public.ops_stays(id),routine_kind text check(routine_kind in ('arrival','departure')),stay_version integer,change_pending jsonb,window_conflict boolean not null default false,is_test boolean not null default false,request_key uuid not null unique,updated_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(routine_stay_id,routine_kind));
create index cleaning_worker_schedule on public.cleaning_jobs(worker_id,starts_at,ends_at) where state in ('awaiting_pix','confirmed','in_progress','review','correction');
create index cleaning_owner_jobs on public.cleaning_jobs(owner_id,created_at desc);
create index cleaning_property_jobs on public.cleaning_jobs(property_id);
create table public.cleaning_results(job_id uuid not null references public.cleaning_jobs(id),item integer not null,result boolean not null,author_id uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(job_id,item));
create table public.cleaning_photos(id uuid primary key,job_id uuid not null references public.cleaning_jobs(id),property_id uuid not null references public.cleaning_properties(id),item integer not null,author_id uuid not null references auth.users(id),path text not null unique,sha256 text not null,content_type text not null check(content_type in ('image/jpeg','image/webp')),size_bytes integer not null check(size_bytes between 12 and 524288),status text not null default 'pending' check(status in ('pending','ready')),created_at timestamptz not null default now(),completed_at timestamptz);
create table public.cleaning_incidents(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.cleaning_jobs(id),author_id uuid not null references auth.users(id),description text not null check(length(description) between 5 and 4000),severity text not null default 'normal' check(severity in ('normal','serious')),state text not null default 'open' check(state in ('open','resolved')),due_at timestamptz not null,resolution text,resolved_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.cleaning_incident_messages(id uuid primary key default gen_random_uuid(),incident_id uuid not null references public.cleaning_incidents(id),author_id uuid not null references auth.users(id),body text not null check(length(body) between 2 and 4000),photo_id uuid references public.cleaning_photos(id),created_at timestamptz not null default now());
create table public.cleaning_ratings(job_id uuid not null references public.cleaning_jobs(id),author_id uuid not null references auth.users(id),subject_id uuid not null references auth.users(id),stars integer not null check(stars between 1 and 5),comment text not null default '' check(length(comment)<=2000),indicators jsonb not null default '{}',published_at timestamptz,hidden boolean not null default false,moderation_reason text,moderated_by uuid references auth.users(id),created_at timestamptz not null default now(),primary key(job_id,author_id));
create index cleaning_ratings_subject on public.cleaning_ratings(subject_id,published_at);
create table public.cleaning_favorites(owner_id uuid not null references public.cleaning_members(user_id),worker_id uuid not null references public.cleaning_members(user_id),primary key(owner_id,worker_id));
create table public.cleaning_payments(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.cleaning_jobs(id),attempt integer not null,worker_id uuid not null references public.cleaning_members(user_id),provider text not null default 'pagbank',environment text not null check(environment in ('sandbox','production')),reference_id text not null unique,amount_cents integer not null check(amount_cents>0),net_cents integer not null check(net_cents>=0),platform_cents integer not null check(platform_cents>=0),status text not null default 'creating' check(status in ('creating','pending','paid','expired','refund_pending','refunded','uncertain')),order_id text unique,charge_id text unique,split_id text,qr_text text,expires_at timestamptz not null,custody_until timestamptz,paid_at timestamptz,refunded_at timestamptz,receiver_id text not null,provider_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(job_id,attempt),check(net_cents+platform_cents=amount_cents));
create unique index cleaning_one_payment on public.cleaning_payments(job_id) where status in ('creating','pending','uncertain');
create table public.cleaning_provider_events(id bigint generated always as identity primary key,payment_id uuid not null references public.cleaning_payments(id),event_key text not null unique,status text not null,evidence jsonb not null,created_at timestamptz not null default now());
create table public.cleaning_history(id bigint generated always as identity primary key,entity text not null,entity_id text,actor_id uuid references auth.users(id),operation text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
create table public.cleaning_notifications(id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),job_id uuid references public.cleaning_jobs(id),message text not null,read_at timestamptz,created_at timestamptz not null default now());
create index cleaning_notifications_user on public.cleaning_notifications(user_id,created_at desc);
-- All access passes through authenticated Edge; no client status/price writes.
do $$declare t text;begin foreach t in array array['cleaning_admins','cleaning_config','cleaning_members','cleaning_receivers','cleaning_properties','cleaning_access','cleaning_jobs','cleaning_results','cleaning_photos','cleaning_incidents','cleaning_incident_messages','cleaning_ratings','cleaning_favorites','cleaning_payments','cleaning_provider_events','cleaning_history','cleaning_notifications'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
grant usage,select on all sequences in schema public to service_role;
create function cleaning_private.audit() returns trigger language plpgsql set search_path='' as $$begin insert into public.cleaning_history(entity,entity_id,actor_id,operation,before_value,after_value) values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'user_id',to_jsonb(new)->>'job_id',to_jsonb(new)->>'property_id'),coalesce(nullif(current_setting('cleaning.actor',true),'')::uuid,nullif(to_jsonb(new)->>'updated_by','')::uuid,nullif(to_jsonb(new)->>'author_id','')::uuid),tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));return new;end $$;
do $$declare t text;begin foreach t in array array['cleaning_admins','cleaning_config','cleaning_members','cleaning_receivers','cleaning_properties','cleaning_access','cleaning_jobs','cleaning_results','cleaning_photos','cleaning_incidents','cleaning_incident_messages','cleaning_ratings','cleaning_payments','cleaning_provider_events'] loop execute format('create trigger cleaning_audit after insert or update on public.%I for each row execute function cleaning_private.audit()',t);end loop;end $$;
create function cleaning_private.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'cleaning_history_immutable';end $$;
create trigger cleaning_history_immutable before update or delete on public.cleaning_history for each row execute function cleaning_private.immutable();
create trigger cleaning_photos_no_delete before delete on public.cleaning_photos for each row execute function cleaning_private.immutable();
create trigger cleaning_provider_no_change before update or delete on public.cleaning_provider_events for each row execute function cleaning_private.immutable();
create function cleaning_private.fee(cents integer,rule jsonb) returns integer language plpgsql immutable set search_path='' as $$declare v integer;begin if rule->>'type' not in ('fixed','percent') or coalesce(rule->>'value','') !~ '^\d+$' then raise exception 'invalid_fee';end if;v=(rule->>'value')::integer;if rule->>'type'='percent' and v>10000 then raise exception 'invalid_fee';end if;return case when rule->>'type'='fixed' then v else ((cents::bigint*v+5000)/10000)::integer end;end $$;
create function cleaning_private.validate_settings(c jsonb) returns void language plpgsql set search_path='' as $$declare v jsonb;n text;ids text[]='{}';begin
 if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'categories')<>'array' or jsonb_array_length(c->'categories')=0 then raise exception 'invalid_configuration';end if;
 for v in select * from jsonb_array_elements(c->'categories') loop if coalesce(v->>'id','')='' or v->>'id'=any(ids) then raise exception 'invalid_categories';end if;ids=array_append(ids,v->>'id');foreach n in array array['area','rooms','bathrooms','cents'] loop if coalesce(v->>n,'') !~ '^\d+$' or (v->>n)::numeric>100000000 then raise exception 'invalid_categories';end if;end loop;if (v->>'area')::int<=0 or (v->>'cents')::int<=0 then raise exception 'invalid_categories';end if;end loop;
 perform cleaning_private.fee(10000,c->'owner_fee');perform cleaning_private.fee(10000,c->'worker_fee');
 foreach n in array array['duration_minutes','payment_minutes','review_hours','rating_hours','incident_hours','lead_hours','ready_minutes','travel_minutes'] loop if coalesce(c->>n,'') !~ '^\d+$' or (c->>n)::int>10080 or (n not in ('travel_minutes','ready_minutes') and (c->>n)::int<1) then raise exception 'invalid_configuration';end if;end loop;
 foreach n in array array['extra_cents','double_included','single_included'] loop if coalesce(c->'beds'->>n,'') !~ '^\d+$' or (c->'beds'->>n)::int>100000 then raise exception 'invalid_beds';end if;end loop;
 if c->'beds'->>'mixed'<>'double_first' or jsonb_typeof(c->'beds'->'types')<>'array' then raise exception 'invalid_beds';end if;ids='{}';for v in select * from jsonb_array_elements(c->'beds'->'types') loop if coalesce(v->>'id','') !~ '^[a-z][a-z0-9_]{0,30}$' or v->>'id'=any(ids) or length(coalesce(v->>'label',''))<1 then raise exception 'invalid_beds';end if;ids=array_append(ids,v->>'id');end loop;if not (c->'beds'->>'double_type'=any(ids) and c->'beds'->>'single_type'=any(ids)) or c->'beds'->>'double_type'=c->'beds'->>'single_type' then raise exception 'invalid_beds';end if;
 if length(coalesce(c->'service'->>'scope',''))<20 or length(coalesce(c->>'terms',''))<20 or coalesce(c->>'terms_version','')='' or jsonb_typeof(c->'service'->'linen_change')<>'boolean' then raise exception 'invalid_scope';end if;
 if jsonb_typeof(c->'service'->'checklist')<>'array' or jsonb_array_length(c->'service'->'checklist') not between 1 and 30 then raise exception 'invalid_checklist';end if;for v in select * from jsonb_array_elements(c->'service'->'checklist') loop if length(coalesce(v->>'label',''))<2 or jsonb_typeof(v->'photo')<>'boolean' then raise exception 'invalid_checklist';end if;end loop;
 if jsonb_typeof(c->'addons')<>'array' then raise exception 'invalid_addons';end if;ids='{}';for v in select * from jsonb_array_elements(c->'addons') loop if coalesce(v->>'id','')='' or v->>'id'=any(ids) or coalesce(v->>'cents','') !~ '^\d+$' or length(coalesce(v->>'label',''))<2 then raise exception 'invalid_addons';end if;ids=array_append(ids,v->>'id');end loop;
 if jsonb_typeof(c->'pilot')<>'boolean' or jsonb_typeof(c->'public_registration')<>'boolean' or c->>'distribution' not in ('manual','offer') or c->>'expiry' not in ('reoffer','cancel') or c->'cancellation'->>'unpaid'<>'free' or c->'cancellation'->>'paid'<>'admin_review' then raise exception 'invalid_configuration';end if;
 if c->'provider'->>'environment' not in ('sandbox','production') or coalesce(c->'provider'->>'custody_days','') !~ '^\d+$' or (c->'provider'->>'custody_days')::int not between 1 and 365 then raise exception 'invalid_provider';end if;
 if (c->'provider'->>'enabled')::boolean and (not coalesce((c->'provider'->>'split_verified')::boolean,false) or not coalesce((c->'provider'->>'pix_custody_verified')::boolean,false) or not coalesce((c->'provider'->>'settlement_verified')::boolean,false) or length(coalesce(c->'provider'->>'evidence',''))<20) then raise exception 'provider_verification_required';end if;
end $$;
create function cleaning_private.validate_property(p jsonb,c jsonb) returns void language plpgsql set search_path='' as $$declare room jsonb;k text;v text;total int;begin
 if length(coalesce(p->>'name',''))<2 or length(coalesce(p->>'city',''))<2 or length(coalesce(p->>'bairro',''))<2 or length(coalesce(p->>'address',''))<5 or p->>'type' not in ('apartment','house','chalet','other') then raise exception 'invalid_property';end if;
 if coalesce(p->>'rooms','') !~ '^\d+$' or coalesce(p->>'bathrooms','') !~ '^\d+$' or (p->>'rooms')::int>100 or (p->>'bathrooms')::int>100 or jsonb_typeof(p->'beds')<>'array' or jsonb_array_length(p->'beds')<>(p->>'rooms')::int then raise exception 'invalid_beds';end if;
 for room in select * from jsonb_array_elements(p->'beds') loop if jsonb_typeof(room)<>'object' then raise exception 'invalid_beds';end if;total=0;for k,v in select key,value from jsonb_each_text(room) loop if not exists(select 1 from jsonb_array_elements(c->'beds'->'types') x where x->>'id'=k) or coalesce(v,'') !~ '^\d+$' or v::int>100 then raise exception 'invalid_beds';end if;total=total+v::int;end loop;if total>100 then raise exception 'invalid_beds';end if;end loop;
end $$;
create function cleaning_private.quote(p_id uuid,p_owner uuid,p_worker uuid default null,p_addons jsonb default '[]') returns jsonb language plpgsql set search_path='' as $$declare prop public.cleaning_properties;config public.cleaning_config;c jsonb;cat jsonb;room jsonb;a jsonb;d int;s int;total int;extras int=0;addon_total int=0;base int;service int;ofee int;wfee int;owner_rule jsonb;worker_rule jsonb;rule jsonb;begin
 select * into prop from public.cleaning_properties where id=p_id;if prop.id is null or prop.owner_id<>p_owner then raise exception 'property_not_found';end if;select * into config from public.cleaning_config where id=1;c=config.settings||prop.rules;
 if prop.area is null and prop.price_override_cents is null then return jsonb_build_object('quote_required',true,'reason','unknown_area');end if;
 select x into cat from jsonb_array_elements(c->'categories') x where (x->>'area')::numeric>=prop.area and (x->>'rooms')::int>=prop.rooms and (x->>'bathrooms')::int>=prop.bathrooms order by (x->>'cents')::int,x->>'id' limit 1;base=coalesce(prop.price_override_cents,(cat->>'cents')::int);if base is null then return jsonb_build_object('quote_required',true,'reason','above_limits');end if;
 for room in select * from jsonb_array_elements(prop.beds) loop select coalesce(sum(value::int),0) into total from jsonb_each_text(room);d=coalesce((room->>(c->'beds'->>'double_type'))::int,0);s=coalesce((room->>(c->'beds'->>'single_type'))::int,0);extras=extras+total-case when d>0 then least(d,(c->'beds'->>'double_included')::int) else least(s,(c->'beds'->>'single_included')::int) end;end loop;
 if jsonb_typeof(p_addons)<>'array' or jsonb_array_length(p_addons)<>(select count(distinct x) from jsonb_array_elements_text(p_addons) x) then raise exception 'invalid_addons';end if;
 for a in select * from jsonb_array_elements(p_addons) loop select x into rule from jsonb_array_elements(c->'addons') x where x->>'id'=a#>>'{}';if rule is null then raise exception 'invalid_addons';end if;addon_total=addon_total+(rule->>'cents')::int;end loop;
 service=base+extras*(c->'beds'->>'extra_cents')::int+addon_total;select coalesce(owner_fee,c->'owner_fee') into owner_rule from public.cleaning_members where user_id=p_owner;select coalesce(worker_fee,c->'worker_fee') into worker_rule from public.cleaning_members where user_id=p_worker;worker_rule=coalesce(worker_rule,c->'worker_fee');ofee=cleaning_private.fee(service,owner_rule);wfee=cleaning_private.fee(service,worker_rule);if wfee>service then raise exception 'worker_fee_exceeds_service';end if;
 return jsonb_build_object('quote_required',false,'version',config.version,'category',cat,'base_cents',base,'extra_beds',extras,'beds_cents',extras*(c->'beds'->>'extra_cents')::int,'addons',p_addons,'addons_cents',addon_total,'service_cents',service,'owner_fee',owner_rule,'owner_fee_cents',ofee,'worker_fee',worker_rule,'worker_fee_cents',wfee,'owner_total_cents',service+ofee,'worker_net_cents',service-wfee,'platform_cents',ofee+wfee,'service',c->'service','terms_version',c->>'terms_version','terms',c->>'terms','conditions',c-'provider'-'categories'-'addons');
end $$;
create function cleaning_private.allowed(p_actor uuid,job public.cleaning_jobs) returns boolean language sql stable set search_path='' as $$select coalesce(p_actor=job.owner_id or p_actor=job.worker_id,false) or exists(select 1 from public.cleaning_admins where user_id=p_actor and active)$$;
create function cleaning_private.notify(j public.cleaning_jobs,message text) returns void language sql set search_path='' as $$insert into public.cleaning_notifications(user_id,job_id,message) select distinct u,j.id,message from unnest(array[j.owner_id,j.worker_id]) u where u is not null$$;
-- One routine per eligible stay/purpose. Confirmed contracts are never silently
-- cancelled/rescheduled by calendar changes or property switches.
create function public.cleaning_reconcile() returns integer language plpgsql set search_path='' as $$
declare prop public.cleaning_properties;s public.ops_stays;j public.cleaning_jobs;t public.ops_tasks;tpl public.ops_templates;c jsonb;q jsonb;arrival timestamptz;departure timestamptz;starts timestamptz;ends timestamptz;kind text;next_arrival timestamptz;n int=0;begin
 perform pg_advisory_xact_lock(710122026);perform pg_advisory_xact_lock(13102026);
 select settings into c from public.cleaning_config where id=1;
 for prop in select * from public.cleaning_properties where show_pms and pms_property_id is not null loop
  for s in select * from public.ops_stays where property_id=prop.pms_property_id loop
   select (s.check_in+coalesce(p.check_in_time,'15:00')) at time zone coalesce(p.timezone,'America/Sao_Paulo'),(s.check_out+coalesce(p.check_out_time,'11:00')) at time zone coalesce(p.timezone,'America/Sao_Paulo') into arrival,departure from public.properties p where p.id=prop.pms_property_id;
   for j in select * from public.cleaning_jobs where routine_stay_id=s.id loop
    if not prop.auto_clean or s.status<>'confirmed' or s.is_test or s.checked_out_at is not null or s.departure_reported_on is not null or departure<=now() then
     if j.state in ('routine','requested') then update public.cleaning_jobs set state='cancelled',change_pending=jsonb_build_object('reason','no_longer_eligible'),updated_at=now() where id=j.id;
     elsif j.state in ('awaiting_pix','confirmed','in_progress','correction','review') and j.change_pending is null then update public.cleaning_jobs set change_pending=jsonb_build_object('reason',case when not prop.auto_clean then 'automation_disabled' else 'stay_changed_review_required' end),updated_at=now() where id=j.id;perform cleaning_private.notify(j,'A rotina mudou. Revise o serviço com a administração.');end if;
    elsif s.version<>j.stay_version and j.state not in ('routine','requested','cancelled') and j.change_pending is null then
     update public.cleaning_jobs set change_pending=jsonb_build_object('reason','dates_changed','stay_version',s.version),updated_at=now() where id=j.id;perform cleaning_private.notify(j,'As datas da hospedagem mudaram. A faxina aguarda análise.');
    end if;
   end loop;
   if not prop.auto_clean or s.status<>'confirmed' or s.is_test or s.checked_out_at is not null or s.departure_reported_on is not null or departure<=now() or s.needs_review is not null then continue;end if;
   if arrival>now() and s.checked_in_at is null then
    kind='arrival';select * into t from public.ops_tasks where stay_id=s.id and stay_version=s.version and stage='preparation' and status in ('pending','blocked') order by created_at desc limit 1;
    if t.id is null then continue;end if;starts=greatest(now(),t.scheduled_for);ends=t.due_at;
   else
    kind='departure';t=null;starts=departure;
    select min((x.check_in+coalesce(p.check_in_time,'15:00')) at time zone coalesce(p.timezone,'America/Sao_Paulo')) into next_arrival from public.ops_stays x join public.properties p on p.id=x.property_id where x.property_id=s.property_id and x.id<>s.id and x.status='confirmed' and not x.is_test and x.check_in>=s.check_out;
    ends=least(departure+make_interval(hours=>coalesce((prop.rules->>'lead_hours')::int,(c->>'lead_hours')::int)),coalesce(next_arrival-make_interval(mins=>(c->>'ready_minutes')::int),departure+interval '1 day'));
   end if;
   if ends<=starts then ends=starts+interval '1 minute';end if;
   q=cleaning_private.quote(prop.id,prop.owner_id,prop.favorite);
   select * into j from public.cleaning_jobs where routine_stay_id=s.id and routine_kind=kind for update;
   if j.id is not null and j.state not in ('routine','requested','cancelled') then continue;end if;
   if j.id is not null and j.state='cancelled' and j.change_pending->>'reason' is distinct from 'no_longer_eligible' then continue;end if;
   if kind='departure' and j.id is null then
    select * into tpl from public.ops_templates where stage='preparation' and (property_id=s.property_id or property_id is null) order by property_id nulls last,version desc limit 1;
    insert into public.ops_tasks(property_id,stay_id,stage,title,scheduled_for,due_at,template_id,template_version,checklist_snapshot,notes) values(s.property_id,s.id,'preparation','Faxina após hospedagem · '||prop.name,starts,ends,tpl.id,tpl.version,tpl.items,'Rotina da plataforma; ainda não contratada.') returning * into t;
   elsif kind='departure' then select * into t from public.ops_tasks where id=j.ops_task_id;end if;
   insert into public.cleaning_jobs(property_id,owner_id,target_worker,state,starts_at,ends_at,duration_minutes,travel_minutes,snapshot,ops_task_id,routine_stay_id,routine_kind,stay_version,request_key,window_conflict)
    values(prop.id,prop.owner_id,prop.favorite,'routine',starts,ends,coalesce((prop.rules->>'duration_minutes')::int,(c->>'duration_minutes')::int),(c->>'travel_minutes')::int,q,t.id,s.id,kind,s.version,gen_random_uuid(),starts+make_interval(mins=>coalesce((prop.rules->>'duration_minutes')::int,(c->>'duration_minutes')::int))>ends)
    on conflict(routine_stay_id,routine_kind) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,stay_version=excluded.stay_version,ops_task_id=excluded.ops_task_id,window_conflict=excluded.window_conflict,state=case when public.cleaning_jobs.state='cancelled' then 'routine' else public.cleaning_jobs.state end,change_pending=null,updated_at=now();n=n+1;
  end loop;
 end loop;return n;
end $$;
create function cleaning_private.stay_sync() returns trigger language plpgsql set search_path='' as $$begin perform public.cleaning_reconcile();return new;end $$;
create trigger zz_cleaning_stay_sync after insert or update on public.ops_stays for each row execute function cleaning_private.stay_sync();
create function public.cleaning_maintenance() returns void language plpgsql set search_path='' as $$declare j public.cleaning_jobs;c jsonb;begin
 perform pg_advisory_xact_lock(710122026);
 select settings into c from public.cleaning_config where id=1;
 for j in select * from public.cleaning_jobs where state='awaiting_pix' and pay_until<now() for update loop
  -- Uncertain provider calls keep their lease until reconciled; never reassign
  -- a service with a potentially paid Pix.
  if exists(select 1 from public.cleaning_payments where job_id=j.id and status in ('creating','pending','uncertain','paid','refund_pending')) then continue;end if;
  update public.cleaning_jobs set state=case when j.snapshot->'conditions'->>'expiry'='cancel' then 'cancelled' else 'requested' end,worker_id=null,pay_until=null,updated_at=now() where id=j.id;perform cleaning_private.notify(j,'O prazo do Pix terminou. O serviço ainda não está confirmado.');
 end loop;
 for j in select * from public.cleaning_jobs where state='review' and review_until<=now() and change_pending is null for update loop
  if exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') then continue;end if;
  update public.cleaning_jobs set state='approved',approved_at=now(),payout='authorized',updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Conferência encerrada. Repasse autorizado; aguardando processamento pelo intermediador.');
 end loop;
 update public.cleaning_ratings r set published_at=now() where published_at is null and (exists(select 1 from public.cleaning_ratings x where x.job_id=r.job_id and x.author_id<>r.author_id) or r.created_at+make_interval(hours=>(select coalesce((rated.snapshot->'conditions'->>'rating_hours')::int,(c->>'rating_hours')::int) from public.cleaning_jobs rated where rated.id=r.job_id))<=now());
 perform public.cleaning_reconcile();
end $$;
create function public.cleaning_mutate(p_actor uuid,p_action text,p jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare a public.cleaning_members;worker public.cleaning_members;is_admin boolean;c public.cleaning_config;prop public.cleaning_properties;j public.cleaning_jobs;i public.cleaning_incidents;photo public.cleaning_photos;cfg jsonb;q jsonb;result jsonb;fee_rule jsonb;wf int;k text;v_item int;starts timestamptz;ends timestamptz;begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'login_required';end if;perform pg_advisory_xact_lock(710122026);
 perform set_config('cleaning.actor',p_actor::text,true);select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;select * into c from public.cleaning_config where id=1;cfg=c.settings;select * into a from public.cleaning_members where user_id=p_actor;
 if p_action='member' then
  if a.user_id is null and not (cfg->>'public_registration')::boolean and not is_admin then raise exception 'registration_closed';end if;
  if coalesce(p->>'phone','') !~ '^\+?[0-9 ()-]{10,20}$' or (not coalesce((p->>'owner')::boolean,false) and not coalesce((p->>'worker')::boolean,false)) then raise exception 'invalid_member';end if;
  if coalesce((p->>'worker')::boolean,false) then
   if length(coalesce(p->>'city',''))<2 or jsonb_array_length(coalesce(p->'bairros','[]'))=0 or jsonb_array_length(coalesce(p->'services','[]'))=0 then raise exception 'invalid_availability';end if;
   if p->'availability'->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p->'availability'->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p->'availability'->>'start'>=p->'availability'->>'end' or jsonb_typeof(p->'availability'->'days')<>'array' or jsonb_array_length(p->'availability'->'days')=0 or exists(select 1 from jsonb_array_elements_text(p->'availability'->'days') x where x !~ '^[0-6]$') then raise exception 'invalid_availability';end if;
  end if;
  insert into public.cleaning_members(user_id,name,phone,owner,worker,city,bairros,availability,services,interest_at,updated_by)
   values(p_actor,p->>'name',p->>'phone',coalesce((p->>'owner')::boolean,false),coalesce((p->>'worker')::boolean,false),p->>'city',array(select jsonb_array_elements_text(coalesce(p->'bairros','[]'))),coalesce(p->'availability',a.availability,'{"days":[0,1,2,3,4,5,6],"start":"08:00","end":"18:00"}'),array(select jsonb_array_elements_text(coalesce(p->'services','["standard"]'))),now(),p_actor)
   on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,owner=excluded.owner,worker=excluded.worker,city=excluded.city,bairros=excluded.bairros,availability=excluded.availability,services=excluded.services,updated_by=p_actor,updated_at=now() returning to_jsonb(cleaning_members.*) into result;return result;
 end if;
 if p_action in ('config','release','receiver','admin','property_rules','resolve','moderate') and not is_admin then raise exception 'cleaning_admin_required';end if;
 if p_action='config' then
  if (p->>'expected_version')::int<>c.version then raise exception 'configuration_changed_reload';end if;perform cleaning_private.validate_settings(p->'settings');
  update public.cleaning_config set settings=p->'settings',version=version+1,updated_by=p_actor,updated_at=now() where id=1 returning to_jsonb(cleaning_config.*) into result;return result;
 elsif p_action='admin' then
  if (p->>'user_id')::uuid=p_actor and p->>'active'='false' then raise exception 'cannot_remove_self';end if;
  insert into public.cleaning_admins(user_id,active,created_by) values((p->>'user_id')::uuid,(p->>'active')::boolean,p_actor) on conflict(user_id) do update set active=excluded.active;return '{"saved":true}';
 elsif p_action='release' then
  if p->'owner_fee' is not null and p->'owner_fee'<>'null' then perform cleaning_private.fee(10000,p->'owner_fee');end if;if p->'worker_fee' is not null and p->'worker_fee'<>'null' then perform cleaning_private.fee(10000,p->'worker_fee');end if;
  update public.cleaning_members set owner_released=(p->>'owner_released')::boolean,worker_released=(p->>'worker_released')::boolean,worker_approved=(p->>'worker_approved')::boolean,blocked=(p->>'blocked')::boolean,owner_fee=nullif(p->'owner_fee','null'),worker_fee=nullif(p->'worker_fee','null'),updated_by=p_actor,updated_at=now() where user_id=(p->>'user_id')::uuid returning to_jsonb(cleaning_members.*) into result;if result is null then raise exception 'member_not_found';end if;return result;
 elsif p_action='receiver' then
  if coalesce(p->>'account_id','') !~ '^ACCO_[a-zA-Z0-9-]+$' or (p->>'verified'='true' and length(coalesce(p->>'verification_reference',''))<10) then raise exception 'receiver_verification_required';end if;
  insert into public.cleaning_receivers(user_id,account_id,verified,verification_reference,updated_by) values((p->>'user_id')::uuid,p->>'account_id',(p->>'verified')::boolean,p->>'verification_reference',p_actor) on conflict(user_id) do update set account_id=excluded.account_id,verified=excluded.verified,verification_reference=excluded.verification_reference,updated_by=p_actor,updated_at=now();return '{"saved":true}';
 elsif p_action='property' then
  if a.user_id is null or not a.owner or a.blocked then raise exception 'owner_required';end if;perform cleaning_private.validate_property(p,cfg);
  if nullif(p->>'id','') is not null then select * into prop from public.cleaning_properties where id=(p->>'id')::uuid for update;if prop.id is null or (prop.owner_id<>p_actor and not is_admin) then raise exception 'property_not_found';end if;end if;
  insert into public.cleaning_properties(id,owner_id,name,type,city,bairro,area,rooms,bathrooms,beds,environments,supplies,updated_by) values(coalesce(prop.id,gen_random_uuid()),coalesce(prop.owner_id,p_actor),p->>'name',p->>'type',p->>'city',p->>'bairro',nullif(p->>'area','')::numeric,(p->>'rooms')::int,(p->>'bathrooms')::int,p->'beds',array(select jsonb_array_elements_text(coalesce(p->'environments','[]'))),array(select jsonb_array_elements_text(coalesce(p->'supplies','[]'))),p_actor)
   on conflict(id) do update set name=excluded.name,type=excluded.type,city=excluded.city,bairro=excluded.bairro,area=excluded.area,rooms=excluded.rooms,bathrooms=excluded.bathrooms,beds=excluded.beds,environments=excluded.environments,supplies=excluded.supplies,updated_by=p_actor,updated_at=now() returning * into prop;
  insert into public.cleaning_access(property_id,address,instructions,care,updated_by) values(prop.id,p->>'address',coalesce(p->>'instructions',''),coalesce(p->>'care',''),p_actor) on conflict(property_id) do update set address=excluded.address,instructions=excluded.instructions,care=excluded.care,updated_by=p_actor,updated_at=now();return to_jsonb(prop);
 elsif p_action='property_rules' then
  select * into prop from public.cleaning_properties where id=(p->>'property_id')::uuid for update;if prop.id is null then raise exception 'property_not_found';end if;
  if nullif(p->>'pms_property_id','') is not null and not exists(select 1 from public.profiles x where x.id=p_actor and x.pms_access_status='active' and (x.role='admin' or (nullif(p->>'pms_property_id','')::bigint=any(x.pms_property_ids) and x.role='host'))) then raise exception 'pms_link_not_authorized';end if;
  if exists(select 1 from jsonb_object_keys(coalesce(p->'rules','{}')) x where x not in ('service','duration_minutes','lead_hours','distribution')) then raise exception 'invalid_property_rules';end if;perform cleaning_private.validate_settings(cfg||coalesce(p->'rules','{}'));
  update public.cleaning_properties set pms_property_id=nullif(p->>'pms_property_id','')::bigint,show_pms=(p->>'show_pms')::boolean,auto_clean=(p->>'auto_clean')::boolean,favorite=nullif(p->>'favorite','')::uuid,price_override_cents=nullif(p->>'price_override_cents','')::int,rules=coalesce(p->'rules','{}'),updated_by=p_actor,updated_at=now() where id=prop.id returning to_jsonb(cleaning_properties.*) into result;
  -- Disabled properties are also reconciled (the public loop only shows linked).
  if p->>'auto_clean'='false' then
   for j in select * from public.cleaning_jobs where property_id=prop.id and routine_stay_id is not null and state in ('routine','requested','awaiting_pix','confirmed','in_progress','review','correction') loop
    update public.cleaning_jobs set state=case when state in ('routine','requested') then 'cancelled' else state end,change_pending=jsonb_build_object('reason',case when state in ('routine','requested') then 'no_longer_eligible' else 'automation_disabled' end),updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Geração automática desativada. Serviços já aceitos precisam de revisão.');
   end loop;
  end if;perform public.cleaning_reconcile();return result;
 elsif p_action='quote' then return cleaning_private.quote((p->>'property_id')::uuid,p_actor,nullif(p->>'worker_id','')::uuid,coalesce(p->'addons','[]'));
 elsif p_action='favorite' then
  if a.user_id is null or not a.owner then raise exception 'owner_required';end if;
  if not exists(select 1 from public.cleaning_members where user_id=(p->>'worker_id')::uuid and worker and worker_approved and not blocked) then raise exception 'worker_not_found';end if;
  if p->>'remove'='true' then delete from public.cleaning_favorites where owner_id=p_actor and worker_id=(p->>'worker_id')::uuid;else insert into public.cleaning_favorites values(p_actor,(p->>'worker_id')::uuid) on conflict do nothing;end if;return '{"saved":true}';
 elsif p_action='request' then
  if a.user_id is null or not a.owner or a.blocked or ((cfg->>'pilot')::boolean and not a.owner_released) then raise exception 'pilot_not_released';end if;
  select * into j from public.cleaning_jobs where request_key=(p->>'request_key')::uuid;if j.id is not null then if j.owner_id<>p_actor then raise exception 'request_key_conflict';end if;return to_jsonb(j);end if;
  select * into prop from public.cleaning_properties where id=(p->>'property_id')::uuid;if prop.id is null or prop.owner_id<>p_actor then raise exception 'property_not_found';end if;
  q=cleaning_private.quote(prop.id,p_actor,nullif(p->>'target_worker','')::uuid,coalesce(p->'addons','[]'));if q->>'quote_required'='true' then raise exception 'assisted_quote_required';end if;
  if p->'accepted_quote' is distinct from q or p->>'accept_terms'<>'true' then raise exception 'quote_changed_review';end if;
  starts=(p->>'starts_at')::timestamptz;ends=(p->>'ends_at')::timestamptz;
  if starts<=now() or starts+make_interval(mins=>(q->'conditions'->>'duration_minutes')::int)>ends or ends-starts>interval '7 days' then raise exception 'invalid_job_window';end if;
  if q->'conditions'->>'distribution'='manual' and nullif(p->>'target_worker','') is null then raise exception 'professional_required';end if;
  insert into public.cleaning_jobs(property_id,owner_id,target_worker,starts_at,ends_at,duration_minutes,travel_minutes,snapshot,request_key) values(prop.id,p_actor,nullif(p->>'target_worker','')::uuid,starts,ends,(q->'conditions'->>'duration_minutes')::int,(q->'conditions'->>'travel_minutes')::int,q,(p->>'request_key')::uuid) returning * into j;return to_jsonb(j);
 end if;
 select * into j from public.cleaning_jobs where id=(p->>'job_id')::uuid for update;if j.id is null then raise exception 'job_not_found';end if;
 if p_action='accept' then
  -- Lock worker first as well as job: two different jobs cannot race the
  -- availability check, and two workers cannot reserve the same job.
  select * into worker from public.cleaning_members where user_id=p_actor for update;
  select * into prop from public.cleaning_properties where id=j.property_id;
  if worker.user_id is null or not worker.worker or not worker.worker_approved or worker.blocked or ((cfg->>'pilot')::boolean and not worker.worker_released) or j.owner_id=p_actor or j.state<>'requested' or (j.target_worker is not null and j.target_worker<>p_actor) or lower(worker.city)<>lower(prop.city) or not lower(prop.bairro)=any(array(select lower(trim(x)) from unnest(worker.bairros) x)) or not 'standard'=any(worker.services) then raise exception 'service_unavailable';end if;
  if j.starts_at<=now() or j.window_conflict or j.change_pending is not null then raise exception 'invalid_job_window';end if;
  if not extract(dow from j.starts_at at time zone 'America/Sao_Paulo')::int=any(array(select jsonb_array_elements_text(worker.availability->'days')::int)) or (j.starts_at at time zone 'America/Sao_Paulo')::time<(worker.availability->>'start')::time or ((j.starts_at+make_interval(mins=>j.duration_minutes)) at time zone 'America/Sao_Paulo')::date<>(j.starts_at at time zone 'America/Sao_Paulo')::date or ((j.starts_at+make_interval(mins=>j.duration_minutes)) at time zone 'America/Sao_Paulo')::time>(worker.availability->>'end')::time then raise exception 'schedule_conflict';end if;
  if exists(select 1 from public.cleaning_jobs x where x.worker_id=p_actor and x.state in ('awaiting_pix','confirmed','in_progress','review','correction') and tstzrange(x.starts_at-make_interval(mins=>greatest(x.travel_minutes,j.travel_minutes)),x.starts_at+make_interval(mins=>x.duration_minutes+greatest(x.travel_minutes,j.travel_minutes))) && tstzrange(j.starts_at,j.starts_at+make_interval(mins=>j.duration_minutes))) then raise exception 'schedule_conflict';end if;
  fee_rule=coalesce(worker.worker_fee,j.snapshot->'worker_fee');wf=cleaning_private.fee((j.snapshot->>'service_cents')::int,fee_rule);if wf>(j.snapshot->>'service_cents')::int then raise exception 'worker_fee_exceeds_service';end if;
  if (p->>'expected_net_cents')::int is distinct from (j.snapshot->>'service_cents')::int-wf then raise exception 'quote_changed_review';end if;
  update public.cleaning_jobs set worker_id=p_actor,state='awaiting_pix',accepted_at=now(),pay_until=now()+make_interval(mins=>(j.snapshot->'conditions'->>'payment_minutes')::int),snapshot=snapshot||jsonb_build_object('worker_fee',fee_rule,'worker_fee_cents',wf,'worker_net_cents',(j.snapshot->>'service_cents')::int-wf,'platform_cents',(j.snapshot->>'owner_fee_cents')::int+wf,'worker_accepted_at',now()),updated_by=p_actor,updated_at=now() where id=j.id returning * into j;perform cleaning_private.notify(j,'Profissional aceitou. Falta confirmar o Pix para garantir a faxina.');return to_jsonb(j);
 end if;
 if not cleaning_private.allowed(p_actor,j) then raise exception 'job_not_found';end if;
 if p_action='activate_routine' then
  if j.owner_id<>p_actor and not is_admin then raise exception 'owner_required';end if;if j.state<>'routine' or j.window_conflict or j.change_pending is not null or j.starts_at<=now() then raise exception 'invalid_job_window';end if;
  select * into prop from public.cleaning_properties where id=j.property_id;q=cleaning_private.quote(prop.id,j.owner_id,j.target_worker);if q->>'quote_required'='true' then raise exception 'assisted_quote_required';end if;
  if not is_admin and (a.blocked or ((cfg->>'pilot')::boolean and not a.owner_released)) then raise exception 'pilot_not_released';end if;
  if p->'accepted_quote' is distinct from q or p->>'accept_terms'<>'true' then raise exception 'quote_changed_review';end if;
  update public.cleaning_jobs set state='requested',snapshot=q,updated_by=p_actor,updated_at=now() where id=j.id returning to_jsonb(cleaning_jobs.*) into result;return result;
 elsif p_action='cancel' then
  if j.state in ('routine','requested','awaiting_pix') and not exists(select 1 from public.cleaning_payments where job_id=j.id and status in ('creating','pending','uncertain','paid','refund_pending')) then update public.cleaning_jobs set state='cancelled',updated_by=p_actor,updated_at=now() where id=j.id;
  else insert into public.cleaning_incidents(job_id,author_id,description,due_at) values(j.id,p_actor,'Pedido de cancelamento: '||coalesce(p->>'description','Analisar condições e devolução.'),now()+make_interval(hours=>(j.snapshot->'conditions'->>'incident_hours')::int));end if;perform cleaning_private.notify(j,'Pedido de cancelamento registrado. Confira o andamento.');return '{"saved":true}';
 elsif p_action='start' then
  if j.worker_id<>p_actor or a.blocked or j.state not in ('confirmed','correction') or j.change_pending is not null or now()<j.starts_at or now()>j.ends_at then raise exception 'start_not_allowed';end if;
  update public.cleaning_jobs set state='in_progress',started_at=coalesce(started_at,now()),updated_by=p_actor,updated_at=now() where id=j.id returning to_jsonb(cleaning_jobs.*) into result;return result;
 elsif p_action='result' then
  if j.worker_id<>p_actor or j.state not in ('in_progress','correction') then raise exception 'execution_not_allowed';end if;v_item=(p->>'item')::int;if v_item<0 or v_item>=jsonb_array_length(j.snapshot->'service'->'checklist') then raise exception 'invalid_item';end if;
  insert into public.cleaning_results(job_id,item,result,author_id) values(j.id,v_item,(p->>'result')::boolean,p_actor) on conflict(job_id,item) do update set result=excluded.result,author_id=p_actor,updated_at=now();return '{"saved":true}';
 elsif p_action='photo' then
  if j.worker_id<>p_actor or j.state not in ('in_progress','correction') then raise exception 'execution_not_allowed';end if;v_item=(p->>'item')::int;if v_item<0 or v_item>=jsonb_array_length(j.snapshot->'service'->'checklist') then raise exception 'invalid_item';end if;
  if exists(select 1 from public.cleaning_photos where id=(p->>'upload_id')::uuid and (job_id<>j.id or author_id<>p_actor or cleaning_photos.item<>v_item or sha256<>p->>'sha256')) then raise exception 'upload_key_conflict';end if;
  insert into public.cleaning_photos(id,job_id,property_id,item,author_id,path,sha256,content_type,size_bytes) values((p->>'upload_id')::uuid,j.id,j.property_id,v_item,p_actor,j.id::text||'/'||(p->>'upload_id'),p->>'sha256',p->>'content_type',(p->>'size_bytes')::int) on conflict(id) do nothing;
  if p->>'complete'='true' then if not exists(select 1 from storage.objects where bucket_id='cleaning-evidence' and name=j.id::text||'/'||(p->>'upload_id')) then raise exception 'upload_not_found';end if;update public.cleaning_photos set status='ready',completed_at=coalesce(completed_at,now()) where id=(p->>'upload_id')::uuid;end if;
  select to_jsonb(x) into result from public.cleaning_photos x where id=(p->>'upload_id')::uuid;return result;
 elsif p_action='submit' then
  if j.worker_id<>p_actor or j.state not in ('in_progress','correction') then raise exception 'execution_not_allowed';end if;
  for v_item in 0..jsonb_array_length(j.snapshot->'service'->'checklist')-1 loop if not exists(select 1 from public.cleaning_results r where r.job_id=j.id and r.item=v_item and r.result) or (j.snapshot->'service'->'checklist'->v_item->>'photo'='true' and not exists(select 1 from public.cleaning_photos ph where ph.job_id=j.id and ph.item=v_item and status='ready')) then raise exception 'checklist_and_photos_required';end if;end loop;
  update public.cleaning_jobs set state='review',submitted_at=now(),review_until=now()+make_interval(hours=>(j.snapshot->'conditions'->>'review_hours')::int),updated_by=p_actor,updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Faxina concluída. Confira as fotos e aprove o serviço.');return '{"saved":true}';
 elsif p_action in ('approve','correction') then
  if j.owner_id<>p_actor or j.state<>'review' then raise exception 'review_not_allowed';end if;
  if p_action='approve' then if j.change_pending is not null or exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') then raise exception 'incident_requires_review';end if;update public.cleaning_jobs set state='approved',approved_at=now(),payout='authorized',updated_by=p_actor,updated_at=now() where id=j.id;
  else if length(coalesce(p->>'description',''))<5 then raise exception 'description_required';end if;update public.cleaning_jobs set state='correction',review_until=null,updated_by=p_actor,updated_at=now() where id=j.id;insert into public.cleaning_incidents(job_id,author_id,description,due_at) values(j.id,p_actor,'Correção solicitada: '||(p->>'description'),now()+make_interval(hours=>(j.snapshot->'conditions'->>'incident_hours')::int));end if;
  perform cleaning_private.notify(j,case when p_action='approve' then 'Faxina aprovada. Repasse autorizado; ainda não pago.' else 'Foi solicitada uma correção. Veja a descrição e responda.' end);return '{"saved":true}';
 elsif p_action='incident' then
  insert into public.cleaning_incidents(job_id,author_id,description,severity,due_at) values(j.id,p_actor,p->>'description',coalesce(p->>'severity','normal'),now()+make_interval(hours=>(j.snapshot->'conditions'->>'incident_hours')::int)) returning to_jsonb(cleaning_incidents.*) into result;perform cleaning_private.notify(j,'Foi relatado um problema. As duas partes podem responder antes da análise.');return result;
 elsif p_action in ('reply','resolve') then
  select * into i from public.cleaning_incidents where id=(p->>'incident_id')::uuid and job_id=j.id for update;if i.id is null or i.state<>'open' then raise exception 'incident_not_found';end if;
  if p_action='reply' then
   if nullif(p->>'photo_id','') is not null and not exists(select 1 from public.cleaning_photos where id=(p->>'photo_id')::uuid and job_id=j.id and status='ready') then raise exception 'photo_not_found';end if;
   insert into public.cleaning_incident_messages(incident_id,author_id,body,photo_id) values(i.id,p_actor,p->>'description',nullif(p->>'photo_id','')::uuid);
  else if length(coalesce(p->>'description',''))<10 then raise exception 'resolution_required';end if;update public.cleaning_incidents set state='resolved',resolution=p->>'description',resolved_by=p_actor where id=i.id;
   if p->>'decision'='refund' then update public.cleaning_jobs set state='refund_pending',payout='not_authorized',updated_by=p_actor where id=j.id;
   elsif p->>'decision'='resume' then update public.cleaning_jobs set change_pending=null,updated_by=p_actor where id=j.id;
   elsif p->>'decision'='approve' then
    if j.submitted_at is null or exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') then raise exception 'incident_requires_review';end if;update public.cleaning_jobs set state='approved',approved_at=now(),payout='authorized',change_pending=null,updated_by=p_actor where id=j.id;
   elsif p->>'decision'<>'no_change' then raise exception 'invalid_decision';end if;
  end if;perform cleaning_private.notify(j,'A ocorrência recebeu uma atualização. Veja o histórico.');return '{"saved":true}';
 elsif p_action='rate' then
  if j.state<>'approved' or j.started_at is null or j.submitted_at is null then raise exception 'performed_service_required';end if;
  if exists(select 1 from jsonb_each_text(coalesce(p->'indicators','{}')) x where x.value !~ '^[1-5]$' or x.key not in ('cleanliness','punctuality','care','respect','instructions','conditions')) then raise exception 'invalid_rating';end if;
  insert into public.cleaning_ratings(job_id,author_id,subject_id,stars,comment,indicators) values(j.id,p_actor,case when j.owner_id=p_actor then j.worker_id else j.owner_id end,(p->>'stars')::int,coalesce(p->>'comment',''),coalesce(p->'indicators','{}'));
  perform public.cleaning_maintenance();return '{"saved":true}';
 elsif p_action='moderate' then
  if length(coalesce(p->>'description',''))<10 then raise exception 'moderation_reason_required';end if;
  update public.cleaning_ratings set hidden=(p->>'hidden')::boolean,moderation_reason=p->>'description',moderated_by=p_actor where job_id=j.id and author_id=(p->>'author_id')::uuid;return '{"saved":true}';
 end if;
 raise exception 'invalid_action';
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cleaning-evidence','cleaning-evidence',false,524288,array['image/jpeg','image/webp']) on conflict(id) do nothing;
-- No client Storage policies: authenticated endpoint signs authorized evidence.
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='cleaning_private' or (n.nspname='public' and p.proname like 'cleaning_%') loop execute 'revoke all on function '||f.sig||' from public,anon,authenticated';execute 'grant execute on function '||f.sig||' to service_role';end loop;end $$;
grant usage on schema cleaning_private to service_role;
-- Provider-only observations are never accepted from the browser or a webhook
-- payload. Edge retrieves the order from PagBank and validates identity/value.
create function public.cleaning_payment_claim(p_actor uuid,p_job uuid) returns jsonb language plpgsql set search_path='' as $$declare j public.cleaning_jobs;r public.cleaning_receivers;pay public.cleaning_payments;c jsonb;attempt int;begin
 perform pg_advisory_xact_lock(710122026);
 select * into j from public.cleaning_jobs where id=p_job for update;if j.id is null or j.owner_id<>p_actor then raise exception 'job_not_found';end if;
 if j.state<>'awaiting_pix' or j.change_pending is not null or j.pay_until<=now() then raise exception 'payment_not_allowed';end if;
 select settings->'provider' into c from public.cleaning_config where id=1;
 if not (c->>'enabled')::boolean or not (c->>'split_verified')::boolean or not (c->>'pix_custody_verified')::boolean or not (c->>'settlement_verified')::boolean then raise exception 'financial_dependency_unavailable';end if;
 select * into r from public.cleaning_receivers where user_id=j.worker_id and verified;if r.user_id is null then raise exception 'receiver_verification_required';end if;
 select * into pay from public.cleaning_payments where job_id=j.id and status in ('creating','pending','paid','uncertain','refund_pending') order by attempt desc limit 1;if pay.id is not null then return to_jsonb(pay)||'{"new":false}';end if;
 if j.ends_at+make_interval(hours=>(j.snapshot->'conditions'->>'review_hours')::int)>=now()+make_interval(days=>(c->>'custody_days')::int) then raise exception 'custody_window_invalid';end if;
 select coalesce(max(x.attempt),0)+1 into attempt from public.cleaning_payments x where job_id=j.id;
 insert into public.cleaning_payments(job_id,attempt,worker_id,environment,reference_id,amount_cents,net_cents,platform_cents,expires_at,custody_until,receiver_id) values(j.id,attempt,j.worker_id,c->>'environment','faxina_'||replace(j.id::text,'-','')||'_'||attempt,(j.snapshot->>'owner_total_cents')::int,(j.snapshot->>'worker_net_cents')::int,(j.snapshot->>'platform_cents')::int,j.pay_until,now()+make_interval(days=>(c->>'custody_days')::int),r.account_id) returning * into pay;
 return to_jsonb(pay)||'{"new":true}';end $$;
create function public.cleaning_payment_observe(p_payment uuid,p jsonb) returns jsonb language plpgsql set search_path='' as $$declare pay public.cleaning_payments;j public.cleaning_jobs;v_status text;begin
 perform pg_advisory_xact_lock(710122026);
 select * into pay from public.cleaning_payments where id=p_payment for update;if pay.id is null then raise exception 'payment_not_found';end if;select * into j from public.cleaning_jobs where id=pay.job_id for update;
 if p->>'operation'='uncertain' then update public.cleaning_payments set status='uncertain',provider_error='provider_reconciliation_required',updated_at=now() where id=pay.id;return '{"saved":true}';end if;
 if p->>'reference_id' is distinct from pay.reference_id or (p->>'amount_cents')::int is distinct from pay.amount_cents or (pay.order_id is not null and p->>'order_id' is distinct from pay.order_id) or (pay.charge_id is not null and p->>'charge_id' is distinct from pay.charge_id) then raise exception 'provider_identity_mismatch';end if;
 v_status=p->>'status';if v_status not in ('pending','paid','expired','refunded') then raise exception 'provider_status_unknown';end if;
 if pay.status='refunded' or (pay.status='paid' and v_status in ('pending','expired')) then return to_jsonb(pay);end if;
 insert into public.cleaning_provider_events(payment_id,event_key,status,evidence) values(pay.id,p->>'event_key',v_status,p-'qr_text') on conflict(event_key) do nothing;if not found then return to_jsonb(pay);end if;
 update public.cleaning_payments set status=v_status,order_id=p->>'order_id',charge_id=p->>'charge_id',split_id=coalesce(p->>'split_id',split_id),qr_text=coalesce(p->>'qr_text',qr_text),paid_at=case when v_status='paid' then coalesce(paid_at,now()) else paid_at end,refunded_at=case when v_status='refunded' then now() else refunded_at end,provider_error=null,updated_at=now() where id=pay.id;
 if v_status='paid' and pay.status<>'paid' then
  if j.state='awaiting_pix' and j.worker_id=pay.worker_id and j.pay_until>=now() and pay.expires_at>=now() and not exists(select 1 from public.cleaning_payments newer where newer.job_id=j.id and newer.attempt>pay.attempt) and j.change_pending is null then update public.cleaning_jobs set state='confirmed',updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Pix confirmado pelo PagBank. Faxina confirmada.');
  else update public.cleaning_payments set status='refund_pending',provider_error='late_or_duplicate_payment' where id=pay.id;
   if not exists(select 1 from public.cleaning_payments x where x.job_id=j.id and x.attempt>pay.attempt) then update public.cleaning_jobs set state='refund_pending',change_pending=jsonb_build_object('reason','late_or_duplicate_payment'),updated_at=now() where id=j.id;end if;
   perform cleaning_private.notify(j,'Pagamento recebido fora das condições. Devolução aguardando conciliação.');end if;
 elsif v_status='refunded' then if not exists(select 1 from public.cleaning_payments x where x.job_id=j.id and x.attempt>pay.attempt) then update public.cleaning_jobs set state='refunded',payout='not_authorized',updated_at=now() where id=j.id;end if;perform cleaning_private.notify(j,'Devolução confirmada pelo PagBank.');end if;
 return (select to_jsonb(x) from public.cleaning_payments x where id=pay.id);
end $$;
create function public.cleaning_payout_observe(p_payment uuid,p jsonb) returns void language plpgsql set search_path='' as $$declare pay public.cleaning_payments;j public.cleaning_jobs;begin
 perform pg_advisory_xact_lock(710122026);
 select * into pay from public.cleaning_payments where id=p_payment;select * into j from public.cleaning_jobs where id=pay.job_id for update;
 if pay.status<>'paid' or j.state<>'approved' or j.payout not in ('authorized','processing','paid') or exists(select 1 from public.cleaning_incidents where job_id=j.id and state='open') or j.change_pending is not null then raise exception 'payout_not_allowed';end if;
 -- Custody RELEASED is only processing. Paid requires separate documented
 -- settlement evidence obtained by provider reconciliation, never a button.
 if p->>'status'='processing' then update public.cleaning_jobs set payout='processing',payout_reference=p->>'reference',updated_at=now() where id=j.id and payout<>'paid';
 elsif p->>'status'='paid' and coalesce(p->>'settlement_reference','')<>'' and (p->>'net_cents')::int=pay.net_cents and (p->>'receiver_id')=pay.receiver_id then update public.cleaning_jobs set payout='paid',payout_reference=p->>'settlement_reference',payout_expected_at=(p->>'settled_at')::timestamptz,updated_at=now() where id=j.id;
 else raise exception 'settlement_evidence_required';end if;
end $$;
revoke all on function public.cleaning_payment_claim(uuid,uuid),public.cleaning_payment_observe(uuid,jsonb),public.cleaning_payout_observe(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cleaning_payment_claim(uuid,uuid),public.cleaning_payment_observe(uuid,jsonb),public.cleaning_payout_observe(uuid,jsonb) to service_role;
create function public.cleaning_read(p_actor uuid,p_job uuid default null) returns jsonb language plpgsql set search_path='' as $$declare is_admin boolean;a public.cleaning_members;c jsonb;ids uuid[];j public.cleaning_jobs;prop public.cleaning_properties;result jsonb;begin
 select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;select * into a from public.cleaning_members where user_id=p_actor;select settings into c from public.cleaning_config where id=1;
 if p_job is not null then
  select * into j from public.cleaning_jobs where id=p_job;if j.id is null or not cleaning_private.allowed(p_actor,j) then raise exception 'job_not_found';end if;select * into prop from public.cleaning_properties where id=j.property_id;
  return jsonb_build_object('job',to_jsonb(j),'property',jsonb_build_object('name',prop.name,'type',prop.type,'city',prop.city,'bairro',prop.bairro,'rooms',prop.rooms,'bathrooms',prop.bathrooms,'area',prop.area,'beds',prop.beds,'environments',prop.environments,'supplies',prop.supplies),
   'access',case when is_admin or j.owner_id=p_actor or (j.worker_id=p_actor and j.state in ('confirmed','in_progress','correction','review','approved')) then (select to_jsonb(x)-'updated_by' from public.cleaning_access x where property_id=prop.id) else null end,
   'results',coalesce((select jsonb_agg(x) from public.cleaning_results x where job_id=j.id),'[]'),
   'photos',coalesce((select jsonb_agg(to_jsonb(x)-'sha256') from public.cleaning_photos x where job_id=j.id and status='ready'),'[]'),
   'incidents',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('messages',coalesce((select jsonb_agg(m order by created_at) from public.cleaning_incident_messages m where incident_id=x.id),'[]'))) from public.cleaning_incidents x where job_id=j.id),'[]'),
   'ratings',coalesce((select jsonb_agg(to_jsonb(x)) from public.cleaning_ratings x where job_id=j.id and (is_admin or author_id=p_actor or (published_at is not null and not hidden))),'[]'),
   'payment',case when j.owner_id=p_actor or is_admin then (select jsonb_build_object('status',x.status,'environment',x.environment,'qr_text',case when x.status='pending' and x.expires_at>now() then x.qr_text end,'expires_at',x.expires_at,'amount_cents',x.amount_cents) from public.cleaning_payments x where job_id=j.id order by created_at desc limit 1) else null end);
 end if;
 select coalesce(array_agg(id),'{}') into ids from public.cleaning_jobs where is_admin or owner_id=p_actor or worker_id=p_actor;
 result=jsonb_build_object('admin',is_admin,'member',case when a.user_id is null then null else to_jsonb(a) end,'server_now',now(),
  'configuration',case when is_admin then (select to_jsonb(x) from public.cleaning_config x where id=1) else jsonb_build_object('settings',c-'provider','version',(select version from public.cleaning_config where id=1)) end,
  'financial_ready',(c->'provider'->>'enabled')::boolean,
  'properties',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('access',(select to_jsonb(z)-'updated_by' from public.cleaning_access z where property_id=x.id))) from public.cleaning_properties x where is_admin or owner_id=p_actor),'[]'),
  'jobs',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('property_name',pr.name,'bairro',pr.bairro) order by x.starts_at desc) from public.cleaning_jobs x join public.cleaning_properties pr on pr.id=x.property_id where x.id=any(ids)),'[]'),
  'offers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'city',pr.city,'bairro',pr.bairro,'type',pr.type,'area',pr.area,'rooms',pr.rooms,'bathrooms',pr.bathrooms,'beds',pr.beds,'supplies',pr.supplies,'starts_at',x.starts_at,'ends_at',x.ends_at,'duration_minutes',x.duration_minutes,'scope',x.snapshot->'service'->>'scope','net_cents',(x.snapshot->>'service_cents')::int-cleaning_private.fee((x.snapshot->>'service_cents')::int,coalesce(a.worker_fee,x.snapshot->'worker_fee')))) from public.cleaning_jobs x join public.cleaning_properties pr on pr.id=x.property_id where a.worker and a.worker_approved and not a.blocked and (not (c->>'pilot')::boolean or a.worker_released) and x.state='requested' and x.owner_id<>p_actor and (x.target_worker is null or x.target_worker=p_actor) and x.starts_at>now() and x.change_pending is null and not x.window_conflict and lower(pr.city)=lower(a.city) and lower(pr.bairro)=any(array(select lower(trim(x)) from unnest(a.bairros) x)) and 'standard'=any(a.services) and extract(dow from x.starts_at at time zone 'America/Sao_Paulo')::int=any(array(select jsonb_array_elements_text(a.availability->'days')::int)) and (x.starts_at at time zone 'America/Sao_Paulo')::time>=(a.availability->>'start')::time and ((x.starts_at+make_interval(mins=>x.duration_minutes)) at time zone 'America/Sao_Paulo')::time<=(a.availability->>'end')::time and not exists(select 1 from public.cleaning_jobs assigned where assigned.worker_id=p_actor and assigned.state in ('awaiting_pix','confirmed','in_progress','review','correction') and tstzrange(assigned.starts_at-make_interval(mins=>greatest(assigned.travel_minutes,x.travel_minutes)),assigned.starts_at+make_interval(mins=>assigned.duration_minutes+greatest(assigned.travel_minutes,x.travel_minutes))) && tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.duration_minutes)))),'[]'),
  'directory',coalesce((select jsonb_agg(jsonb_build_object('user_id',x.user_id,'name',x.name,'city',x.city,'bairros',x.bairros,'mean',(select round(avg(stars),1) from public.cleaning_ratings r where r.subject_id=x.user_id and published_at is not null and not hidden),'count',(select count(*) from public.cleaning_ratings r where r.subject_id=x.user_id and published_at is not null and not hidden))) from public.cleaning_members x where x.worker and x.worker_approved and not x.blocked),'[]'),
  'favorites',coalesce((select jsonb_agg(worker_id) from public.cleaning_favorites where owner_id=p_actor),'[]'),
  'notifications',coalesce((select jsonb_agg(x order by x.created_at desc) from (select * from public.cleaning_notifications where user_id=p_actor order by created_at desc limit 50)x),'[]'));
 if is_admin then result=result||jsonb_build_object('participants',coalesce((select jsonb_agg(x) from public.cleaning_members x),'[]'),'receivers',coalesce((select jsonb_agg(x) from public.cleaning_receivers x),'[]'),'administrators',coalesce((select jsonb_agg(x) from public.cleaning_admins x),'[]'),'pms_properties',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)) from public.properties x join public.profiles p on p.id=p_actor where p.pms_access_status='active' and (p.role='admin' or (p.role='host' and x.id=any(p.pms_property_ids)))),'[]'),'history',coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,entity,entity_id,actor_id,operation,created_at from public.cleaning_history order by created_at desc limit 100)x),'[]'));end if;
 return result;
end $$;
revoke all on function public.cleaning_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cleaning_read(uuid,uuid) to service_role;
-- Photo evidence for both sides of an occurrence uses the same private bucket,
-- with a distinct purpose. It never satisfies required cleaning photos.
alter table public.cleaning_photos add column incident_id uuid references public.cleaning_incidents(id);
alter table public.cleaning_photos add column purpose text not null default 'cleaning' check(purpose in ('cleaning','incident'));
create function public.cleaning_incident_photo(p_actor uuid,p jsonb) returns jsonb language plpgsql set search_path='' as $$declare j public.cleaning_jobs;inc public.cleaning_incidents;photo public.cleaning_photos;begin
 perform pg_advisory_xact_lock(710122026);
 select * into inc from public.cleaning_incidents where id=(p->>'incident_id')::uuid;select * into j from public.cleaning_jobs where id=inc.job_id for update;
 if inc.id is null or inc.state<>'open' or not cleaning_private.allowed(p_actor,j) then raise exception 'incident_not_found';end if;
 if exists(select 1 from public.cleaning_photos x where id=(p->>'upload_id')::uuid and (x.incident_id<>inc.id or x.job_id<>j.id or x.author_id<>p_actor or x.sha256<>p->>'sha256')) then raise exception 'upload_key_conflict';end if;
 insert into public.cleaning_photos(id,job_id,property_id,item,author_id,path,sha256,content_type,size_bytes,incident_id,purpose) values((p->>'upload_id')::uuid,j.id,j.property_id,-1,p_actor,j.id::text||'/'||(p->>'upload_id'),p->>'sha256',p->>'content_type',(p->>'size_bytes')::int,inc.id,'incident') on conflict(id) do nothing;
 if p->>'complete'='true' then if not exists(select 1 from storage.objects where bucket_id='cleaning-evidence' and name=j.id::text||'/'||(p->>'upload_id')) then raise exception 'upload_not_found';end if;update public.cleaning_photos set status='ready',completed_at=coalesce(completed_at,now()) where id=(p->>'upload_id')::uuid;end if;
 return (select to_jsonb(x) from public.cleaning_photos x where id=(p->>'upload_id')::uuid);
end $$;
revoke all on function public.cleaning_incident_photo(uuid,jsonb) from public,anon,authenticated;grant execute on function public.cleaning_incident_photo(uuid,jsonb) to service_role;
-- A linked operational task delegates execution and evidence to the platform.
-- Preserve the pre-existing departure guard and its separate photo collection.
alter table public.ops_tasks add column cleaning_job_id uuid unique references public.cleaning_jobs(id);
create function cleaning_private.project_job() returns trigger language plpgsql set search_path='' as $$declare task_state text;begin
 if new.ops_task_id is null then return new;end if;
 if tg_op='UPDATE' and old.ops_task_id is distinct from new.ops_task_id and old.ops_task_id is not null then update public.ops_tasks set cleaning_job_id=null where id=old.ops_task_id;end if;
 task_state=case new.state when 'in_progress' then 'in_progress' when 'correction' then 'in_progress' when 'review' then 'inspection' when 'approved' then 'approved' when 'cancelled' then 'cancelled' when 'refunded' then 'cancelled' else 'pending' end;
 if new.state='cancelled' and exists(select 1 from public.cleaning_properties where id=new.property_id and not auto_clean) then task_state='pending';end if;
 perform set_config('cleaning.projection','1',true);
 update public.ops_tasks set cleaning_job_id=new.id,assigned_to=new.worker_id,status=task_state,
  started_at=new.started_at,submitted_at=new.submitted_at,completed_at=new.approved_at,executed_by=new.worker_id,
  approved_by=case when new.state='approved' then new.owner_id else null end,
  notes=concat_ws(E'\n','Faxina vinculada à plataforma · '||new.state,case when new.change_pending is not null then 'Mudança pendente: revisar contratação.' end),updated_at=now()
 where id=new.ops_task_id and stage='preparation';
 perform set_config('cleaning.projection','0',true);return new;
end $$;
create function cleaning_private.protect_task() returns trigger language plpgsql set search_path='' as $$declare j public.cleaning_jobs;begin
 if new.cleaning_job_id is null then return new;end if;select * into j from public.cleaning_jobs where id=new.cleaning_job_id;
 if coalesce(current_setting('cleaning.projection',true),'0')='1' then return new;end if;
 if (new.status,new.assigned_to,new.started_at,new.completed_at) is distinct from (old.status,old.assigned_to,old.started_at,old.completed_at) then
  if j.state in ('routine','requested','cancelled') and new.status in ('cancelled','superseded') then return new;end if;
  -- Calendar version changes cannot cancel an accepted marketplace contract.
  if new.status in ('cancelled','superseded') then new.status=old.status;new.assigned_to=old.assigned_to;new.started_at=old.started_at;new.completed_at=old.completed_at;return new;end if;
  raise exception 'cleaning_task_managed_in_platform';
 end if;return new;
end $$;
create trigger cleaning_task_protect before update on public.ops_tasks for each row execute function cleaning_private.protect_task();
create trigger cleaning_job_projection after insert or update on public.cleaning_jobs for each row execute function cleaning_private.project_job();
create or replace function ops_private.task_guard() returns trigger language plpgsql set search_path='' as $$declare missing integer;t public.ops_tasks;j public.cleaning_jobs;begin
 if tg_table_name='ops_task_results' then select * into t from public.ops_tasks where id=new.task_id for update;if t.cleaning_job_id is not null then raise exception 'cleaning_task_managed_in_platform';end if;if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;if new.item_index<0 or new.item_index>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;return new;end if;
 if new.cleaning_job_id is not null then
  select * into j from public.cleaning_jobs where id=new.cleaning_job_id;
  if coalesce(current_setting('cleaning.projection',true),'0')='1' and j.id is not null then return new;end if;
  if new.status in ('inspection','approved') and old.status is distinct from new.status then raise exception 'cleaning_task_managed_in_platform';end if;return new;
 end if;
 if new.status in ('inspection','approved') and old.status is distinct from new.status then
  if new.stage='departure' and new.scheduled_for>now() then raise exception 'departure_not_due';end if;
  select count(*) into missing from generate_series(0,jsonb_array_length(new.checklist_snapshot)-1) i where not exists(select 1 from public.ops_task_results r where r.task_id=new.id and r.item_index=i) or not exists(select 1 from public.ops_evidence e where e.task_id=new.id and e.item_index=i and e.status='ready');
  if missing>0 then raise exception 'checklist_and_photos_required';end if;if new.status='approved' and (old.status<>'inspection' or new.approved_by is null) then raise exception 'inspection_required';end if;
 end if;return new;
end $$;
revoke all on function cleaning_private.project_job(),cleaning_private.protect_task() from public,anon,authenticated;grant execute on function cleaning_private.project_job(),cleaning_private.protect_task() to service_role;
