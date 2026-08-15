-- Receive supplier stock directly into either the shop floor or an optional warehouse.
create or replace function public.record_stock_delivery(p_delivery jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid; staff_role public.app_role; supplier uuid; old_cost bigint; location uuid; location_type text;
begin
  select store_id, role into s, staff_role from public.profiles where id = auth.uid();
  if s is null or staff_role not in ('admin', 'manager') then raise exception 'Only managers and admins can receive supplier deliveries'; end if;
  if exists (select 1 from public.supplier_deliveries where id = (p_delivery->>'id')::uuid) then return; end if;
  if nullif(p_delivery->>'location_id', '') is null then select l.id, l.location_type into location, location_type from public.inventory_locations l where l.store_id = s and l.location_type = 'shop_floor' and l.active limit 1; else select l.id, l.location_type into location, location_type from public.inventory_locations l where l.id = (p_delivery->>'location_id')::uuid and l.store_id = s and l.active; end if;
  if location is null then raise exception 'Choose a valid receiving location'; end if;
  insert into public.suppliers(store_id, name) values (s, p_delivery->>'supplier_name') on conflict(store_id, name) do update set name = excluded.name returning id into supplier;
  select cost_price_kobo into old_cost from public.products where id = (p_delivery->>'product_id')::uuid and store_id = s for update;
  if not found then raise exception 'Product not found'; end if;
  if location_type = 'shop_floor' then update public.products set stock_quantity = stock_quantity + (p_delivery->>'quantity')::int, cost_price_kobo = (p_delivery->>'unit_cost_kobo')::bigint, updated_at = now() where id = (p_delivery->>'product_id')::uuid; else update public.products set cost_price_kobo = (p_delivery->>'unit_cost_kobo')::bigint, updated_at = now() where id = (p_delivery->>'product_id')::uuid; end if;
  insert into public.inventory_location_balances(location_id, product_id, quantity) values (location, (p_delivery->>'product_id')::uuid, (p_delivery->>'quantity')::int) on conflict(location_id, product_id) do update set quantity = inventory_location_balances.quantity + excluded.quantity, updated_at = now();
  insert into public.supplier_deliveries(id, store_id, supplier_id, product_id, location_id, quantity, unit_cost_kobo, received_by, received_at) values ((p_delivery->>'id')::uuid, s, supplier, (p_delivery->>'product_id')::uuid, location, (p_delivery->>'quantity')::int, (p_delivery->>'unit_cost_kobo')::bigint, auth.uid(), coalesce(nullif(p_delivery->>'received_at', '')::date, current_date));
  if old_cost <> (p_delivery->>'unit_cost_kobo')::bigint then insert into public.product_price_history(store_id, product_id, previous_cost_kobo, new_cost_kobo, changed_by) values (s, (p_delivery->>'product_id')::uuid, old_cost, (p_delivery->>'unit_cost_kobo')::bigint, auth.uid()); end if;
  insert into public.stock_movements(store_id, product_id, quantity_delta, reason, client_operation_id) values (s, (p_delivery->>'product_id')::uuid, (p_delivery->>'quantity')::int, 'delivery', gen_random_uuid());
end $$;
grant execute on function public.record_stock_delivery(jsonb) to authenticated;
