-- Save optional supplier contact details and support selecting saved suppliers on delivery.
alter table public.suppliers add column if not exists phone text;

create or replace function public.record_stock_delivery(p_delivery jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_store uuid;
  staff_role public.app_role;
  supplier uuid;
  location uuid;
  location_type text;
  old_cost bigint;
  old_selling_price bigint;
  new_selling_price bigint;
  price_floor bigint;
begin
  select store_id, role into current_store, staff_role from public.profiles where id = auth.uid();
  if current_store is null or staff_role not in ('admin', 'manager') then raise exception 'Only managers and admins can receive supplier deliveries'; end if;
  if exists (select 1 from public.supplier_deliveries where id = (p_delivery->>'id')::uuid) then return; end if;

  select inventory_location.id, inventory_location.location_type into location, location_type from public.inventory_locations inventory_location
  where inventory_location.id = (p_delivery->>'location_id')::uuid and inventory_location.store_id = current_store and inventory_location.active = true;
  if location is null then raise exception 'Choose a valid inventory location'; end if;

  if nullif(p_delivery->>'supplier_id', '') is not null then
    select id into supplier from public.suppliers where id = (p_delivery->>'supplier_id')::uuid and store_id = current_store;
    if supplier is null then raise exception 'Selected supplier was not found'; end if;
    update public.suppliers set phone = coalesce(nullif(trim(p_delivery->>'supplier_phone'), ''), phone) where id = supplier;
  else
    insert into public.suppliers(store_id, name, phone)
    values (current_store, trim(p_delivery->>'supplier_name'), nullif(trim(p_delivery->>'supplier_phone'), ''))
    on conflict(store_id, name) do update set phone = coalesce(excluded.phone, public.suppliers.phone)
    returning id into supplier;
  end if;

  select cost_price_kobo, price_kobo, minimum_selling_price_kobo into old_cost, old_selling_price, price_floor
  from public.products where id = (p_delivery->>'product_id')::uuid and store_id = current_store for update;
  if not found then raise exception 'Product not found'; end if;
  new_selling_price := nullif(p_delivery->>'selling_price_kobo', '')::bigint;
  if new_selling_price is not null and new_selling_price < 0 then raise exception 'Selling price cannot be negative'; end if;
  if new_selling_price is not null and price_floor is not null and new_selling_price < price_floor then raise exception 'New selling price is below the cashier price floor. Update or clear the product floor first.'; end if;

  if location_type = 'shop_floor' then
    update public.products set stock_quantity = stock_quantity + (p_delivery->>'quantity')::integer, cost_price_kobo = (p_delivery->>'unit_cost_kobo')::bigint, price_kobo = coalesce(new_selling_price, price_kobo), updated_at = now() where id = (p_delivery->>'product_id')::uuid;
  else
    update public.products set cost_price_kobo = (p_delivery->>'unit_cost_kobo')::bigint, price_kobo = coalesce(new_selling_price, price_kobo), updated_at = now() where id = (p_delivery->>'product_id')::uuid;
  end if;

  insert into public.supplier_deliveries(id, store_id, supplier_id, product_id, location_id, quantity, unit_cost_kobo, received_by, received_at)
  values ((p_delivery->>'id')::uuid, current_store, supplier, (p_delivery->>'product_id')::uuid, location, (p_delivery->>'quantity')::integer, (p_delivery->>'unit_cost_kobo')::bigint, auth.uid(), coalesce(nullif(p_delivery->>'received_at', '')::date, current_date));
  if old_cost <> (p_delivery->>'unit_cost_kobo')::bigint or (new_selling_price is not null and old_selling_price <> new_selling_price) then
    insert into public.product_price_history(store_id, product_id, previous_cost_kobo, new_cost_kobo, previous_selling_price_kobo, new_selling_price_kobo, changed_by)
    values (current_store, (p_delivery->>'product_id')::uuid, old_cost, (p_delivery->>'unit_cost_kobo')::bigint, old_selling_price, coalesce(new_selling_price, old_selling_price), auth.uid());
  end if;
  insert into public.stock_movements(store_id, product_id, quantity_delta, reason, client_operation_id)
  values (current_store, (p_delivery->>'product_id')::uuid, (p_delivery->>'quantity')::integer, 'delivery', gen_random_uuid());
end;
$$;

grant execute on function public.record_stock_delivery(jsonb) to authenticated;
