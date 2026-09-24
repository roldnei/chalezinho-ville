-- 20260924011905_simplify_experience_admin_model.sql
alter table public.experience_products
  add column if not exists package_type text not null default 'other',
  add column if not exists price_cents bigint not null default 0 check(price_cents >= 0),
  add column if not exists upsell_enabled boolean not null default false;

update public.experience_products set package_type='romantic'
where code in ('dev_romantic','uplm') and package_type='other';
update public.experience_products set package_type='breakfast'
where code='dev_breakfast' and package_type='other';

update public.experience_products p
set price_cents = coalesce((
  select v.price_cents
  from public.experience_variants v
  where v.product_id=p.id and v.active=true
  order by v.display_order,v.created_at
  limit 1
),p.price_cents)
where p.price_cents=0;

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/05-suite.webp','Suíte preparada para a experiência',50
from public.experience_products p where p.code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/05-suite.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/02-cozinha.webp','Ambiente para café da manhã',40
from public.experience_products p where p.code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/02-cozinha.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/ch2-01-cafe.webp','Café preparado no chalé',50
from public.experience_products p where p.code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/ch2-01-cafe.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-flores.webp','Decoração romântica com flores',20
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-flores.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-coracao-hidro.webp','Hidromassagem preparada para um momento romântico',30
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-coracao-hidro.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-vinho-deck-1.webp','Taças e vinho no deck',40
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-vinho-deck-1.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-romance.webp','Experiência romântica completa',50
from public.experience_products p where p.code='uplm'
and not exists(select 1 from public.experience_media m where m.product_id=p.id and m.media_url='assets/experiencia-romance.webp');
