-- Resolve only pool/spa/hydromassage from the actual property registry.
-- Stable item indices keep every existing answer and photo linked to its item.
alter table public.ops_tasks add column amenity_snapshot jsonb;
create function ops_private.water_checklist(p_items jsonb,p_rules jsonb,p_amenities jsonb,p_stage text) returns jsonb language plpgsql immutable set search_path='' as $$
declare items jsonb:='[]';rules jsonb:='[]';amenity text;label text;lowered text;rule jsonb;kind text;available text[]:='{}';used text[]:='{}';i integer;is_water boolean;combined text;
begin
 for amenity in select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(p_amenities)='array' then p_amenities else '[]'::jsonb end) loop
  if amenity ~ '^(sem|não|nao)[[:space:]]' then continue;end if;
  kind=case when amenity ~ '\mspa\M' then 'spa' when amenity ~ '(hidromassagem|\mhidro\M)' then 'hydro' when amenity ~ 'piscina' then 'pool' end;
  if kind is not null and not kind=any(available) then available=array_append(available,kind);end if;
 end loop;
 for i in 0..jsonb_array_length(p_items)-1 loop
  label=p_items->>i;lowered=lower(label);rule=coalesce(p_rules->i,'{}'::jsonb);kind=null;
  is_water=lowered ~ '(\mspa\M|\mhidro\M|hidromassagem|piscina)';
  if is_water then
   combined=regexp_replace(label,'[[:space:]]+e[[:space:]]+(hidro.*|spa.*|piscina.*)$','','i');
   if combined<>label and lower(combined) ~ '(banheiro|área|area|cozinha)' then
    label=combined;rule=rule-'equipment'-'hidden';
   else
    if lowered ~ 'piscina' and not lowered ~ '(\mspa\M|\mhidro\M|hidromassagem)' then kind='pool';
    elsif lowered ~ '\mspa\M' and not lowered ~ '(\mhidro\M|hidromassagem)' then kind='spa';
    elsif lowered ~ '(\mhidro\M|hidromassagem)' and not lowered ~ '\mspa\M' then kind='hydro';
    elsif 'spa'=any(available) and not 'spa'=any(used) then kind='spa';else kind='hydro';end if;
    if kind=any(available) and not kind=any(used) then
     label=case kind when 'pool' then 'Piscina' when 'spa' then 'Spa' else 'Hidromassagem' end;
     used=array_append(used,kind);rule=(rule-'hidden')||jsonb_build_object('equipment',kind,'allow_na',false,'required',true,'photo_required',coalesce((rule->>'photo_required')::boolean,p_stage='preparation'));
    else
     rule=rule||jsonb_build_object('equipment','water_absent','hidden',true,'allow_na',false,'required',false,'photo_required',false);
    end if;
   end if;
  end if;
  items=items||jsonb_build_array(label);rules=rules||jsonb_build_array(rule);
 end loop;
 foreach kind in array available loop
  if not kind=any(used) then
   items=items||jsonb_build_array(case kind when 'pool' then 'Piscina' when 'spa' then 'Spa' else 'Hidromassagem' end);
   rules=rules||jsonb_build_array(jsonb_build_object('equipment',kind,'required',true,'photo_required',p_stage='preparation','allow_na',false));
  end if;
 end loop;
 return jsonb_build_object('items',items,'rules',rules);
end $$;
revoke all on function ops_private.water_checklist(jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant usage on schema ops_private to service_role;
grant execute on function ops_private.water_checklist(jsonb,jsonb,jsonb,text) to service_role;

create or replace function ops_private.inspection_task() returns trigger language plpgsql set search_path='' as $$
declare resolved jsonb;
begin
 if tg_op='INSERT' then
  select item_rules into new.item_rules_snapshot from public.ops_templates where id=new.template_id;
  if new.cleaning_job_id is null then
   select coalesce(features->'amenities','[]'::jsonb) into new.amenity_snapshot from public.properties where id=new.property_id;
   resolved=ops_private.water_checklist(new.checklist_snapshot,new.item_rules_snapshot,new.amenity_snapshot,new.stage);
   new.checklist_snapshot=resolved->'items';new.item_rules_snapshot=resolved->'rules';
  end if;
 else
  if new.assigned_to is distinct from old.assigned_to then update public.ops_evidence set status='abandoned' where task_id=new.id and status='pending';end if;
  if new.assigned_to is distinct from old.assigned_to or new.status in ('inspection','approved','cancelled','superseded') then
   update public.ops_inspection_links set revoked_at=coalesce(revoked_at,now()) where task_id=new.id and revoked_at is null;
  end if;
 end if;
 return new;
end $$;

-- Explicitly requested adjustment of still-open checklists; no completed record is changed.
-- Answer/photo indices are preserved; absent legacy slots become non-interactive.
with resolved as (
 select t.id,coalesce(p.features->'amenities','[]'::jsonb) amenities,
 ops_private.water_checklist(t.checklist_snapshot,t.item_rules_snapshot,p.features->'amenities',t.stage) result
 from public.ops_tasks t join public.properties p on p.id=t.property_id
 where t.cleaning_job_id is null and t.status in ('pending','in_progress','blocked') and t.amenity_snapshot is null
)
update public.ops_tasks t set amenity_snapshot=r.amenities,checklist_snapshot=r.result->'items',item_rules_snapshot=r.result->'rules'
from resolved r where t.id=r.id;

create or replace function ops_private.task_guard() returns trigger language plpgsql set search_path='' as $$
declare t public.ops_tasks;r public.ops_task_results;rule jsonb;i integer;
begin
 if tg_table_name='ops_task_results' then
  select * into t from public.ops_tasks where id=new.task_id for update;
  if t.cleaning_job_id is not null then raise exception 'cleaning_task_managed_in_platform';end if;
  if t.status not in ('pending','in_progress','blocked') then raise exception 'task_locked';end if;
  if new.item_index<0 or new.item_index>=jsonb_array_length(t.checklist_snapshot) then raise exception 'invalid_item';end if;
  rule=t.item_rules_snapshot->new.item_index;
  if new.result='not_applicable' and not coalesce((rule->>'hidden')::boolean,false) and not coalesce((rule->>'allow_na')::boolean,false) then raise exception 'not_applicable_forbidden';end if;
  return new;
 end if;
 if new.cleaning_job_id is not null then
  if coalesce(current_setting('cleaning.projection',true),'0')='1' then return new;end if;
  if new.status in ('inspection','approved') and old.status is distinct from new.status then raise exception 'cleaning_task_managed_in_platform';end if;return new;
 end if;
 if new.status='pending' and old.status in ('inspection','approved') and length(coalesce(current_setting('ops.reopen_reason',true),''))<5 then raise exception 'reopen_reason_required';end if;
 if new.status in ('inspection','approved') and old.status is distinct from new.status then
  if new.stage='departure' and new.scheduled_for>now() then raise exception 'departure_not_due';end if;
  if exists(select 1 from public.ops_evidence e where e.task_id=new.id and e.status='pending' and not coalesce((new.item_rules_snapshot->e.item_index->>'hidden')::boolean,false)) then raise exception 'uploads_pending';end if;
  for i in 0..jsonb_array_length(new.checklist_snapshot)-1 loop
   rule=new.item_rules_snapshot->i;
   if coalesce((rule->>'hidden')::boolean,false) then continue;end if;
   select * into r from public.ops_task_results where task_id=new.id and item_index=i;
   if r.task_id is null and coalesce((rule->>'required')::boolean,true) then raise exception 'checklist_and_photos_required';end if;
   if r.result='issue' and length(trim(coalesce(r.observation,'')))=0 then raise exception 'problem_description_required';end if;
   if r.result='not_applicable' and not coalesce((rule->>'allow_na')::boolean,false) then raise exception 'not_applicable_forbidden';end if;
   if (r.result='issue' or r.task_id is not null and coalesce((rule->>'photo_required')::boolean,new.stage='preparation') and r.result is distinct from 'not_applicable') and not exists(select 1 from public.ops_evidence where task_id=new.id and item_index=i and status='ready') then raise exception 'checklist_and_photos_required';end if;
  end loop;
  if new.status='approved' and (old.status<>'inspection' or new.approved_by is null) then raise exception 'inspection_required';end if;
 end if;
 return new;
end $$;
