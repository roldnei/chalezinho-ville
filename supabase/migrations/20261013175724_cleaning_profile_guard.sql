-- Verify existing public profile. Auth identity is checked by getUser at Edge.
-- Do not broaden database privileges on auth.users for the service_role.
create or replace function public.cleaning_mutate(p_actor uuid,p_action text,p jsonb default '{}') returns jsonb language plpgsql set search_path='' as $$
declare a public.cleaning_members;worker public.cleaning_members;is_admin boolean;c public.cleaning_config;prop public.cleaning_properties;j public.cleaning_jobs;i public.cleaning_incidents;photo public.cleaning_photos;cfg jsonb;q jsonb;result jsonb;fee_rule jsonb;wf int;k text;v_item int;starts timestamptz;ends timestamptz;begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor) then raise exception 'login_required';end if;perform pg_advisory_xact_lock(710122026);
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
