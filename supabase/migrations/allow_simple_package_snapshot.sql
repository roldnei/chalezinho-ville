-- allow_simple_package_snapshot.sql
alter table public.quote_experience_items
  alter column variant_name_snapshot drop not null;

update public.experience_variants v
set code='package', name='Pacote'
from public.experience_products p
where v.product_id=p.id
  and p.code='uplm'
  and v.active=true;

with ranked as (
  select v.id,
         row_number() over(partition by v.product_id order by v.display_order,v.created_at,v.id) rn
  from public.experience_variants v
  join public.experience_products p on p.id=v.product_id
  where v.active=true and p.price_cents>0
)
update public.experience_variants v
set active=false
from ranked r
where v.id=r.id and r.rn>1;
