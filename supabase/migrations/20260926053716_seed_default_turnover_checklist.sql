with created as (
  insert into public.pms_checklist_templates (property_id,task_type,name,active)
  select null,'turnover','Preparação completa entre estadias',true
  where not exists (
    select 1 from public.pms_checklist_templates where property_id is null and task_type='turnover' and active=true
  )
  returning id
)
insert into public.pms_checklist_template_items (template_id,label,display_order)
select created.id,item.label,item.display_order
from created
cross join (values
  ('Recolher lixo e conferir itens esquecidos',0),
  ('Trocar enxoval e toalhas',1),
  ('Higienizar banheiro, hidro ou spa',2),
  ('Limpar cozinha e conferir utensílios',3),
  ('Repor amenities e itens de boas-vindas',4),
  ('Conferir área externa e equipamentos',5),
  ('Fotografar a vistoria final',6)
) as item(label,display_order);
