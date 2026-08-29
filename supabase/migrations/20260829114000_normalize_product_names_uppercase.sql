-- Keep the catalogue consistently readable on receipts, checkout, reports, and storefronts.
-- Existing names are normalized once; the trigger protects future API and dashboard updates.
update public.products
set name = upper(btrim(name))
where name is distinct from upper(btrim(name));

create or replace function public.normalize_product_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := upper(btrim(new.name));
  return new;
end;
$$;

drop trigger if exists normalize_product_name_before_write on public.products;
create trigger normalize_product_name_before_write
before insert or update of name on public.products
for each row execute function public.normalize_product_name();
