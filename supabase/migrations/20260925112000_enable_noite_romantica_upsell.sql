-- Keep the romantic upgrade path continuous after the initial R$ 300 -> R$ 549 upsell.
-- A guest who owns Noite Romantica can therefore buy only the R$ 50 difference
-- to the next active package, Ultra Premium Lua de Mel.

update public.experience_products
set upsell_enabled=true,
    updated_at=now()
where code='noite_romantica_6a7d18'
  and package_type='romantic';
