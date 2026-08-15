-- Preserve the cost at the moment of sale so later supplier-price changes do not alter historic profit.
create or replace function public.snapshot_sale_item_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cost_price_kobo into new.cost_price_kobo from public.products where id = new.product_id;
  return new;
end $$;

drop trigger if exists snapshot_sale_item_cost on public.sale_items;
create trigger snapshot_sale_item_cost
before insert on public.sale_items
for each row execute function public.snapshot_sale_item_cost();
