alter table public.cleaning_jobs add column correction_at timestamptz;
create table public.cleaning_work_sessions(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.cleaning_jobs(id),worker_id uuid not null references auth.users(id),started_at timestamptz not null default now(),ended_at timestamptz,check(ended_at is null or ended_at>=started_at));
create unique index cleaning_active_work_session on public.cleaning_work_sessions(job_id) where ended_at is null;
alter table public.cleaning_work_sessions enable row level security;
revoke all on public.cleaning_work_sessions from public,anon,authenticated;grant all on public.cleaning_work_sessions to service_role;
create function cleaning_private.execution_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.state='correction' and old.state<>'correction' then new.correction_at=now();end if;
 if new.state='review' and old.state<>new.state then
  if old.state<>'in_progress' then raise exception 'execution_not_started';end if;
  if new.correction_at is not null and not exists(select 1 from public.cleaning_photos p where p.job_id=new.id and p.purpose='cleaning' and p.status='ready' and p.created_at>new.correction_at) then raise exception 'correction_photo_required';end if;
 end if;return new;
end $$;
create trigger cleaning_execution_guard before update on public.cleaning_jobs for each row execute function cleaning_private.execution_guard();
create function cleaning_private.execution_clock() returns trigger language plpgsql set search_path='' as $$begin
 if new.state='in_progress' and old.state<>'in_progress' then insert into public.cleaning_work_sessions(job_id,worker_id) values(new.id,new.worker_id);
 elsif old.state='in_progress' and new.state<>'in_progress' then update public.cleaning_work_sessions set ended_at=now() where job_id=new.id and ended_at is null;end if;return new;
end $$;
create trigger cleaning_execution_clock after update on public.cleaning_jobs for each row execute function cleaning_private.execution_clock();
create trigger cleaning_work_audit after insert or update on public.cleaning_work_sessions for each row execute function cleaning_private.audit();
create function public.cleaning_change(p_actor uuid,p_action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare j public.cleaning_jobs;worker public.cleaning_members;proposal jsonb;starts timestamptz;ends timestamptz;is_admin boolean;begin
 perform pg_advisory_xact_lock(710122026);perform set_config('cleaning.actor',p_actor::text,true);
 select * into j from public.cleaning_jobs where id=(p->>'job_id')::uuid for update;
 select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;
 if j.id is null or not cleaning_private.allowed(p_actor,j) then raise exception 'job_not_found';end if;
 if j.state not in ('awaiting_pix','confirmed','correction') or j.worker_id is null then raise exception 'change_not_allowed';end if;
 if p_action='propose_change' then
  starts=(p->>'starts_at')::timestamptz;ends=(p->>'ends_at')::timestamptz;
  if starts<=now() or starts+make_interval(mins=>j.duration_minutes)>ends or ends-starts>interval '7 days' or length(coalesce(p->>'description',''))<5 then raise exception 'invalid_job_window';end if;
  proposal=jsonb_build_object('reason','schedule_proposal','starts_at',starts,'ends_at',ends,'description',left(p->>'description',2000),'proposed_by',p_actor,'proposed_at',now(),'owner_approved',p_actor=j.owner_id,'worker_approved',p_actor=j.worker_id);
  update public.cleaning_jobs set change_pending=proposal,updated_by=p_actor,updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Foi proposto um novo horário. Proprietário e profissional precisam concordar.');
 elsif p_action='respond_change' then
  if p_actor not in (j.owner_id,j.worker_id) or j.change_pending->>'reason'<>'schedule_proposal' or p->'proposal_at' is distinct from j.change_pending->'proposed_at' then raise exception 'proposal_changed_reload';end if;
  if not coalesce((p->>'approve')::boolean,false) then update public.cleaning_jobs set change_pending=jsonb_build_object('reason','proposal_declined','declined_by',p_actor,'previous_proposal',j.change_pending),updated_by=p_actor where id=j.id;perform cleaning_private.notify(j,'O novo horário não foi aceito. Combine outra opção ou peça análise administrativa.');
  else
   proposal=j.change_pending||jsonb_build_object(case when p_actor=j.owner_id then 'owner_approved' else 'worker_approved' end,true);
   if (proposal->>'owner_approved')::boolean and (proposal->>'worker_approved')::boolean then
    starts=(proposal->>'starts_at')::timestamptz;ends=(proposal->>'ends_at')::timestamptz;select * into worker from public.cleaning_members where user_id=j.worker_id for update;
    if starts<=now() or not extract(dow from starts at time zone 'America/Sao_Paulo')::int=any(array(select jsonb_array_elements_text(worker.availability->'days')::int)) or (starts at time zone 'America/Sao_Paulo')::time<(worker.availability->>'start')::time or ((starts+make_interval(mins=>j.duration_minutes)) at time zone 'America/Sao_Paulo')::date<>(starts at time zone 'America/Sao_Paulo')::date or ((starts+make_interval(mins=>j.duration_minutes)) at time zone 'America/Sao_Paulo')::time>(worker.availability->>'end')::time then raise exception 'schedule_conflict';end if;
    if exists(select 1 from public.cleaning_jobs x where x.id<>j.id and x.worker_id=j.worker_id and x.state in ('awaiting_pix','confirmed','in_progress','review','correction') and tstzrange(x.starts_at-make_interval(mins=>greatest(x.travel_minutes,j.travel_minutes)),x.starts_at+make_interval(mins=>x.duration_minutes+greatest(x.travel_minutes,j.travel_minutes))) && tstzrange(starts,starts+make_interval(mins=>j.duration_minutes))) then raise exception 'schedule_conflict';end if;
    update public.cleaning_jobs set starts_at=starts,ends_at=ends,change_pending=null,updated_by=p_actor,updated_at=now() where id=j.id;perform cleaning_private.notify(j,'Novo horário aceito pelos dois lados. Preço e condições anteriores foram preservados.');
   else update public.cleaning_jobs set change_pending=proposal,updated_by=p_actor,updated_at=now() where id=j.id;end if;
  end if;
 else raise exception 'invalid_action';end if;
 return (select to_jsonb(x) from public.cleaning_jobs x where id=j.id);
end $$;
revoke all on function public.cleaning_change(uuid,text,jsonb),cleaning_private.execution_guard(),cleaning_private.execution_clock() from public,anon,authenticated;
grant execute on function public.cleaning_change(uuid,text,jsonb),cleaning_private.execution_guard(),cleaning_private.execution_clock() to service_role;

create index cleaning_work_job on public.cleaning_work_sessions(job_id);
create or replace function public.cleaning_read(p_actor uuid,p_job uuid default null) returns jsonb language plpgsql set search_path='' as $$declare is_admin boolean;a public.cleaning_members;c jsonb;ids uuid[];j public.cleaning_jobs;prop public.cleaning_properties;result jsonb;begin
 select exists(select 1 from public.cleaning_admins where user_id=p_actor and active) into is_admin;select * into a from public.cleaning_members where user_id=p_actor;select settings into c from public.cleaning_config where id=1;
 if p_job is not null then
  select * into j from public.cleaning_jobs where id=p_job;if j.id is null or not cleaning_private.allowed(p_actor,j) then raise exception 'job_not_found';end if;select * into prop from public.cleaning_properties where id=j.property_id;
  return jsonb_build_object('work_minutes',(select ceil(sum(extract(epoch from coalesce(w.ended_at,now())-w.started_at))/60) from public.cleaning_work_sessions w where w.job_id=j.id),'owner_name',(select name from public.cleaning_members where user_id=j.owner_id),'worker_name',(select name from public.cleaning_members where user_id=j.worker_id),'job',to_jsonb(j),'property',jsonb_build_object('name',prop.name,'type',prop.type,'city',prop.city,'bairro',prop.bairro,'rooms',prop.rooms,'bathrooms',prop.bathrooms,'area',prop.area,'beds',prop.beds,'environments',prop.environments,'supplies',prop.supplies),
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
  'jobs',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('work_minutes',(select ceil(sum(extract(epoch from coalesce(w.ended_at,now())-w.started_at))/60) from public.cleaning_work_sessions w where w.job_id=x.id),'property_name',pr.name,'bairro',pr.bairro) order by x.starts_at desc) from public.cleaning_jobs x join public.cleaning_properties pr on pr.id=x.property_id where x.id=any(ids)),'[]'),
  'offers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'city',pr.city,'bairro',pr.bairro,'type',pr.type,'area',pr.area,'rooms',pr.rooms,'bathrooms',pr.bathrooms,'beds',pr.beds,'supplies',pr.supplies,'starts_at',x.starts_at,'ends_at',x.ends_at,'duration_minutes',x.duration_minutes,'scope',x.snapshot->'service'->>'scope','addon_details',coalesce(x.snapshot->'addon_details','[]'),'net_cents',(x.snapshot->>'service_cents')::int-cleaning_private.fee((x.snapshot->>'service_cents')::int,coalesce(a.worker_fee,x.snapshot->'worker_fee')))) from public.cleaning_jobs x join public.cleaning_properties pr on pr.id=x.property_id where a.worker and a.worker_approved and not a.blocked and (not (c->>'pilot')::boolean or a.worker_released) and not x.is_test and x.state='requested' and x.owner_id<>p_actor and (x.target_worker is null or x.target_worker=p_actor) and x.starts_at>now() and x.change_pending is null and not x.window_conflict and lower(pr.city)=lower(a.city) and lower(pr.bairro)=any(array(select lower(trim(x)) from unnest(a.bairros) x)) and 'standard'=any(a.services) and extract(dow from x.starts_at at time zone 'America/Sao_Paulo')::int=any(array(select jsonb_array_elements_text(a.availability->'days')::int)) and (x.starts_at at time zone 'America/Sao_Paulo')::time>=(a.availability->>'start')::time and ((x.starts_at+make_interval(mins=>x.duration_minutes)) at time zone 'America/Sao_Paulo')::time<=(a.availability->>'end')::time and not exists(select 1 from public.cleaning_jobs assigned where assigned.worker_id=p_actor and assigned.state in ('awaiting_pix','confirmed','in_progress','review','correction') and tstzrange(assigned.starts_at-make_interval(mins=>greatest(assigned.travel_minutes,x.travel_minutes)),assigned.starts_at+make_interval(mins=>assigned.duration_minutes+greatest(assigned.travel_minutes,x.travel_minutes))) && tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.duration_minutes)))),'[]'),
  'directory',coalesce((select jsonb_agg(jsonb_build_object('user_id',x.user_id,'name',x.name,'city',x.city,'bairros',x.bairros,'mean',(select round(avg(stars),1) from public.cleaning_ratings r where r.subject_id=x.user_id and published_at is not null and not hidden),'count',(select count(*) from public.cleaning_ratings r where r.subject_id=x.user_id and published_at is not null and not hidden))) from public.cleaning_members x where x.worker and x.worker_approved and not x.blocked),'[]'),
  'favorites',coalesce((select jsonb_agg(worker_id) from public.cleaning_favorites where owner_id=p_actor),'[]'),
  'notifications',coalesce((select jsonb_agg(x order by x.created_at desc) from (select * from public.cleaning_notifications where user_id=p_actor order by created_at desc limit 50)x),'[]'));
 if is_admin then result=result||jsonb_build_object('participants',coalesce((select jsonb_agg(x) from public.cleaning_members x),'[]'),'receivers',coalesce((select jsonb_agg(x) from public.cleaning_receivers x),'[]'),'administrators',coalesce((select jsonb_agg(x) from public.cleaning_admins x),'[]'),'pms_properties',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)) from public.properties x join public.profiles p on p.id=p_actor where p.pms_access_status='active' and (p.role='admin' or (p.role='host' and x.id=any(p.pms_property_ids)))),'[]'),'history',coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,entity,entity_id,actor_id,operation,created_at from public.cleaning_history order by created_at desc limit 100)x),'[]'));end if;
 return result;
end $$;

create or replace function cleaning_private.project_job() returns trigger language plpgsql set search_path='' as $$declare task_state text;begin
 if new.ops_task_id is null then return new;end if;
 if tg_op='UPDATE' and old.ops_task_id is distinct from new.ops_task_id and old.ops_task_id is not null then update public.ops_tasks set cleaning_job_id=null where id=old.ops_task_id;end if;
 task_state=case new.state when 'in_progress' then 'in_progress' when 'correction' then 'in_progress' when 'review' then 'inspection' when 'approved' then 'approved' when 'cancelled' then 'cancelled' when 'refunded' then 'cancelled' else 'pending' end;
 if new.state='cancelled' and exists(select 1 from public.cleaning_properties where id=new.property_id and not auto_clean) then task_state='pending';end if;
 perform set_config('cleaning.projection','1',true);
 update public.ops_tasks set cleaning_job_id=new.id,assigned_to=new.worker_id,status=task_state,scheduled_for=new.starts_at,due_at=new.ends_at,window_conflict=new.window_conflict,
  started_at=new.started_at,submitted_at=new.submitted_at,completed_at=new.approved_at,executed_by=new.worker_id,
  approved_by=case when new.state='approved' then new.owner_id else null end,
  notes=concat_ws(E'\n','Faxina vinculada à plataforma · '||new.state,case when new.change_pending is not null then 'Mudança pendente: revisar contratação.' end),updated_at=now()
 where id=new.ops_task_id and stage='preparation';
 perform set_config('cleaning.projection','0',true);return new;
end $$;
