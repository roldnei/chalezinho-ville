-- 20260924005001_phase1_experience_media_and_modification_guard.sql
alter table public.experience_products
  add column if not exists sales_headline text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.experience_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.experience_products(id) on delete cascade,
  media_url text not null,
  alt_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists experience_media_product_idx on public.experience_media(product_id,display_order);
alter table public.experience_media enable row level security;

drop policy if exists "experience_media_public_read" on public.experience_media;
create policy "experience_media_public_read" on public.experience_media
for select to anon,authenticated using (
  exists(select 1 from public.experience_products p where p.id=product_id and (p.status='active' or private.current_user_is_admin()))
);
grant select on public.experience_media to anon,authenticated;
grant all on public.experience_media to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('experience-media','experience-media',true,10485760,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "experience_media_admin_insert" on storage.objects;
create policy "experience_media_admin_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

drop policy if exists "experience_media_admin_update" on storage.objects;
create policy "experience_media_admin_update" on storage.objects
for update to authenticated
using (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
)
with check (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

drop policy if exists "experience_media_admin_delete" on storage.objects;
create policy "experience_media_admin_delete" on storage.objects
for delete to authenticated
using (
  bucket_id='experience-media'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

update public.experience_products
set sales_headline='Transforme a chegada em um momento só de vocês.',
    description='Uma ambientação romântica preparada antes da chegada para mudar completamente a primeira impressão do chalé.',
    details='{"includes":["ambientação romântica","detalhes decorativos","preparo antes da chegada"]}'::jsonb
where code='dev_romantic';

update public.experience_products
set sales_headline='Comece o dia sem pressa.',
    description='Um momento de café pensado para aproveitar o chalé com calma e tornar a manhã parte da experiência.',
    details='{"includes":["montagem para dois","apresentação especial","entrega conforme antecedência"]}'::jsonb
where code='dev_breakfast';

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-flores.webp','Decoração romântica com flores',10 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-flores.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-coracao-hidro.webp','Hidromassagem preparada para um momento romântico',20 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-coracao-hidro.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-romance.webp','Experiência romântica no chalé',30 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-romance.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/experiencia-vinho-deck-1.webp','Taças e vinho no deck',40 from public.experience_products where code='dev_romantic'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/experiencia-vinho-deck-1.webp');

insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/01-cantinho-cafe.webp','Cantinho do café no chalé',10 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/01-cantinho-cafe.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/05-mesa-cozinha.webp','Mesa preparada no chalé',20 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/05-mesa-cozinha.webp');
insert into public.experience_media(product_id,media_url,alt_text,display_order)
select id,'assets/04-decoracao.webp','Detalhes de decoração',30 from public.experience_products where code='dev_breakfast'
and not exists(select 1 from public.experience_media m where m.product_id=experience_products.id and m.media_url='assets/04-decoracao.webp');

with ranked as (
  select id,row_number() over(partition by reservation_id order by created_at desc,id desc) rn
  from public.modification_requests
  where status in ('requested','quoted','awaiting_guest_acceptance','accepted')
)
update public.modification_requests m
set status='cancelled',updated_at=now()
from ranked r
where m.id=r.id and r.rn>1;

create unique index if not exists one_open_modification_per_reservation
on public.modification_requests(reservation_id)
where status in ('requested','quoted','awaiting_guest_acceptance','accepted');
