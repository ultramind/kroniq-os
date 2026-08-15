-- Store the date selected when stock was physically received, rather than always using the recording time.
create or replace function public.record_stock_delivery(p_delivery jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid; r public.app_role; supplier uuid; old_cost bigint;
begin
  select store_id, role into s, r from public.profiles where id = auth.uid();
  if s is null or r not in ('admin', 'manager') then raise exception 'Not permitted'; end if;
  if exists (select 1 from public.supplier_deliveries where id = (p_delivery->>'id')::uuid) then return; end if;
  insert into public.suppliers(store_id, name) values (s, p_delivery->>'supplier_name') on conflict(store_id, name) do update set name = excluded.name returning id into supplier;
  select cost_price_kobo into old_cost from public.products where id = (p_delivery->>'product_id')::uuid and store_id = s for update;
  if not found then raise exception 'Product not found'; end if;
  update public.products set stock_quantity = stock_quantity + (p_delivery->>'quantity')::int, cost_price_kobo = (p_delivery->>'unit_cost_kobo')::bigint, updated_at = now() where id = (p_delivery->>'product_id')::uuid;
  insert into public.supplier_deliveries (id, store_id, supplier_id, product_id, quantity, unit_cost_kobo, received_by, received_at)
  values ((p_delivery->>'id')::uuid, s, supplier, (p_delivery->>'product_id')::uuid, (p_delivery->>'quantity')::int, (p_delivery->>'unit_cost_kobo')::bigint, auth.uid(), coalesce(nullif(p_delivery->>'received_at', '')::date, current_date));
  if old_cost <> (p_delivery->>'unit_cost_kobo')::bigint then insert into public.product_price_history(store_id, product_id, previous_cost_kobo, new_cost_kobo, changed_by) values (s, (p_delivery->>'product_id')::uuid, old_cost, (p_delivery->>'unit_cost_kobo')::bigint, auth.uid()); end if;
  insert into public.stock_movements(store_id, product_id, quantity_delta, reason, client_operation_id) values (s, (p_delivery->>'product_id')::uuid, (p_delivery->>'quantity')::int, 'delivery', gen_random_uuid());
end $$;

grant execute on function public.record_stock_delivery(jsonb) to authenticated;
