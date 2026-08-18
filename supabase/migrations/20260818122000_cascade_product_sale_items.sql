-- Sale lines are branch-owned records. Permit a full branch/organisation purge
-- to cascade through the product reference instead of blocking product deletion.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.sale_items'::regclass
    and confrelid = 'public.products'::regclass
    and contype = 'f';
  if constraint_name is not null then
    execute format('alter table public.sale_items drop constraint %I', constraint_name);
  end if;
end $$;
alter table public.sale_items add constraint sale_items_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
