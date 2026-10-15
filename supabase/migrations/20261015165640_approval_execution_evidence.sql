-- Only submitted execution belongs to operational approval. Expose evidence counts before opening.
-- Live administrative inbox. Source records and their decision histories remain authoritative.
-- No copied queue rows, read flags or new approval/financial state machine.
create or replace function private.admin_approval_inbox() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and coalesce(pms_access_status,'active') not in ('suspended','cancelled')) then
  raise exception 'admin_required' using errcode='42501';
 end if;
 with items as (
 select 'ops:'||t.id as key,case when t.stage='departure' then 'Saída' else 'Entrada' end category,
 t.title, p.name property_name,coalesce(pr.full_name,'Responsável não informado') requester,
 coalesce(t.submitted_at,t.updated_at) pending_since,t.due_at,
 (select count(*)::int from public.ops_task_results r where r.task_id=t.id and r.result='issue') issues,
 'pms-operacao.html?view=tasks&task='||t.id href,case when t.priority='urgent' then 0 else 1 end priority
 from public.ops_tasks t join public.properties p on p.id=t.property_id left join public.profiles pr on pr.id=t.executed_by
 left join public.ops_stays s on s.id=t.stay_id
 where t.status='inspection' and t.submitted_at is not null and t.executed_by is not null and t.cleaning_job_id is null and not coalesce(s.is_test,false)
 union all
 select 'legacy:'||t.id,'Outras tarefas',t.title,p.name,coalesce(pr.full_name,t.assigned_name,'Equipe'),coalesce(t.submitted_at,t.updated_at),t.due_at,0,
 'pms-operacao.html?view=legacy_tasks&task='||t.id,1
 from public.pms_tasks t join public.properties p on p.id=t.property_id left join public.profiles pr on pr.id=t.assigned_user_id where t.status='inspection' and t.submitted_at is not null
 union all
 select 'change:'||m.id,'Reservas','Alteração de reserva',p.name,r.guest_name,m.created_at,null,0,'admin.html?view=changes&change='||m.id,1
 from public.modification_requests m join public.reservations r on r.id=m.reservation_id left join public.properties p on p.id=r.property_id where m.status in ('requested','quoted')
 union all
 select 'cancel:'||c.id,'Reservas','Cancelamento solicitado',p.name,r.guest_name,c.requested_at,null,0,'admin.html?view=reservations&reservation='||r.id,1
 from public.reservation_cancel_requests c join public.reservations r on r.id=c.reservation_id left join public.properties p on p.id=r.property_id where c.status='requested'
 union all
 select 'same-day:'||s.id,'Reservas','Pedido de entrada para hoje',p.name,s.guest_name,s.created_at,s.expires_at,0,'admin.html?view=notifications&request='||s.id,0
 from public.same_day_requests s left join public.properties p on p.id=s.property_id where s.status='pending' and s.expires_at>now()
 union all
 select 'incident:'||i.id,'Ocorrências','Analisar ocorrência: '||coalesce(i.category,'Outros'),p.name,r.guest_name,i.created_at,null,1,'admin.html?view=reservations&reservation='||r.id,0
 from public.incidents i join public.reservations r on r.id=i.reservation_id left join public.properties p on p.id=r.property_id where i.status='open' and i.decision='pending'
 union all
 select 'moment:'||v.id,'Ville Moments',coalesce(nullif(v.title,''),'Publicação do hóspede'),p.name,v.author_name,v.updated_at,null,0,'villegram-admin.html?review=pending',1
 from public.villegram_publications v left join public.properties p on p.id=v.property_id where v.status='pending_review'
 union all
 select 'cleaning:'||j.id,'Faxinas','Conferir faxina concluída',p.name,m.name,j.submitted_at,j.review_until,
 (select count(*)::int from public.cleaning_incidents i where i.job_id=j.id and i.state='open'),
 'faxinas-admin.html?job='||j.id,1
 from public.cleaning_jobs j join public.cleaning_properties p on p.id=j.property_id left join public.cleaning_members m on m.user_id=j.worker_id
 where j.state='review' and j.submitted_at is not null and not j.is_test
 union all
 select 'cleaning-change:'||j.id,'Faxinas','Revisar alteração da faxina',p.name,m.name,j.updated_at,j.starts_at,1,'faxinas-admin.html?job='||j.id,0
 from public.cleaning_jobs j join public.cleaning_properties p on p.id=j.property_id left join public.cleaning_members m on m.user_id=j.worker_id
 where j.change_pending is not null and j.state not in ('approved','cancelled','refunded') and not j.is_test and j.state<>'review'
 union all
 select 'cleaning-incident:'||i.id,'Faxinas','Ocorrência na faxina',p.name,m.name,i.created_at,i.due_at,1,'faxinas-admin.html?job='||j.id,0
 from public.cleaning_incidents i join public.cleaning_jobs j on j.id=i.job_id join public.cleaning_properties p on p.id=j.property_id left join public.cleaning_members m on m.user_id=i.author_id
 where i.state='open' and not j.is_test and j.state<>'review'
 union all
 select 'member:'||m.user_id,'Cadastros','Liberar participante das faxinas',null,m.name,m.interest_at,null,0,'faxinas-admin.html?tab=participants',1
 from public.cleaning_members m where not m.blocked and ((m.owner and not m.owner_released) or (m.worker and (not m.worker_approved or not m.worker_released)))
 union all
 select 'location:'||l.id,'Cadastros','Analisar bairro: '||l.name,null,pr.full_name,l.created_at,null,0,'faxinas-admin.html?tab=locations',1
 from public.cleaning_location_requests l left join public.profiles pr on pr.id=l.author_id where l.state='pending'
 union all
 select 'pix:'||pay.id,'Pagamentos','Conferir Pix informado',p.name,m.name,coalesce(inv.reported_at,pay.updated_at),inv.review_until,0,'faxinas-admin.html?job='||j.id,1
 from public.cleaning_payments pay join public.cleaning_manual_invoices inv on inv.payment_id=pay.id join public.cleaning_jobs j on j.id=pay.job_id join public.cleaning_properties p on p.id=j.property_id left join public.cleaning_members m on m.user_id=j.owner_id
 where not j.is_test and ((pay.status='pending' and inv.reported_at is not null) or pay.status='uncertain')
 union all
 select 'receiver:'||r.user_id,'Cadastros','Verificar recebimento da profissional',null,m.name,r.updated_at,null,0,'faxinas-admin.html?tab=receivers',1
 from public.cleaning_receivers r join public.cleaning_members m on m.user_id=r.user_id where not r.verified and not m.blocked
 union all
 select 'bank-entry:'||e.id,'Pagamentos','Revisar transferência divergente',p.name,m.name,e.created_at,null,1,'faxinas-admin.html?job='||j.id,0
 from public.cleaning_manual_entries e join public.cleaning_payments pay on pay.id=e.payment_id join public.cleaning_jobs j on j.id=pay.job_id join public.cleaning_properties p on p.id=j.property_id left join public.cleaning_members m on m.user_id=j.owner_id
 where e.state in ('review','refund_due') and not j.is_test
 )
 select jsonb_build_object('total',count(*),'items',coalesce(jsonb_agg((to_jsonb(items)||case when items.key like 'ops:%' then jsonb_build_object(
  'completed_execution',true,
  'photo_count',(select count(*) from public.ops_evidence e where e.task_id=substring(items.key from 5)::uuid and e.status='ready'),
  'answered_count',(select count(*) from public.ops_task_results r join public.ops_tasks t on t.id=r.task_id where t.id=substring(items.key from 5)::uuid and not coalesce((t.item_rules_snapshot->r.item_index->>'hidden')::boolean,false)),
  'item_count',(select count(*) from public.ops_tasks t cross join lateral jsonb_array_elements(t.checklist_snapshot) with ordinality item(value,n) where t.id=substring(items.key from 5)::uuid and not coalesce((t.item_rules_snapshot->((item.n-1)::int)->>'hidden')::boolean,false))
 ) else '{}'::jsonb end) order by priority,pending_since nulls last,key),'[]'::jsonb),
 'updated_at',now()) into result from items;
 return result;
end $$;
