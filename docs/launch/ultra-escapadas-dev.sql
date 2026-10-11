-- Apply only in DEV pxfqmnhqodqyaaqeyjgr after reviewing the catalog.
-- Preserves previous offers, reservations, contracts and all financial history.
begin;
do $$ begin
 if not exists(select 1 from experience_products where id='6f57f8f4-5bf3-492c-a99b-18ed966db662' and name='Ultra Premium' and status='active' and details->'commercial_pricing'->>'cash_cents'='53900' and details->'commercial_pricing'->>'card_cents'='56900') then raise exception 'approved_ultra_catalog_required'; end if;
end $$;
with changed as (
 update experience_products set details=jsonb_set(details,'{offer_enabled}','true'),updated_at=now()
 where id='6f57f8f4-5bf3-492c-a99b-18ed966db662' and details->>'offer_enabled' is distinct from 'true' returning *
) insert into audit_events(action,entity_type,entity_id,new_value)
 select 'ultra_enabled_for_escapadas','experience_product',id::text,to_jsonb(changed) from changed;
-- Align development catalog with the current production commercial fees, read-only verified.
with previous as materialized (select id,cleaning_fee from properties where id in (1,2,3)), changed as (
 update properties p set cleaning_fee=case when p.id=1 then 150 else 292 end from previous x
 where p.id=x.id and p.cleaning_fee is distinct from (case when p.id=1 then 150 else 292 end)
 returning p.id,p.cleaning_fee,x.cleaning_fee as prior_fee
) insert into audit_events(action,entity_type,entity_id,old_value,new_value)
 select 'development_commercial_cleaning_aligned','property',id::text,jsonb_build_object('cleaning_fee',prior_fee),jsonb_build_object('cleaning_fee',cleaning_fee) from changed;
with inserted as (
 insert into stay_offers(name,description,property_ids,product_ids,min_nights,max_nights,discount_bps,discount_enabled,status,showcase,villegram)
 select 'Escapada Ultra Premium · '||label,
 'Hospedagem para duas pessoas, limpeza e Ultra Premium: cama com pétalas, iluminação, aroma e ambiente preparado, cesta de frutas, vinho ou espumante e degustação de queijos harmonizada. Experiência '||detail||'. Tudo preparado antes da chegada. Em dias de semana, 5% de desconto na composição; fins de semana e feriados sem esse desconto. Disponibilidade reconfirmada no atendimento.',
 array[1,2,3]::bigint[],array['6f57f8f4-5bf3-492c-a99b-18ed966db662']::uuid[],2,3,500,true,'active',
 jsonb_build_object('enabled',true,'nights',jsonb_build_array(2,3),'horizon_days',21,'celebrations',true,'celebration_discount',false,'holidays',jsonb_build_array(),'commercial_condition',condition),
 jsonb_build_object('title','Uma escapada completa, preparada para vocês.','motion','gentle','photos',jsonb_build_array(),'audio',null)
 from (values ('cash','à vista','à vista por R$ 539'),('card','cartão','no cartão por R$ 569, até 4x sem juros; parcelamento da hospedagem consultado no atendimento')) as conditions(condition,label,detail)
 where not exists(select 1 from stay_offers o where o.name='Escapada Ultra Premium · '||label)
 returning *
) insert into audit_events(action,entity_type,entity_id,new_value)
 select 'ultra_escapada_created','stay_offer',id::text,to_jsonb(inserted) from inserted;
commit;
