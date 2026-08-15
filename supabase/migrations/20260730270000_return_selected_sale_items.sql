-- Item-level returns: each operation is idempotent and never restores more than was sold.
create or replace function public.return_sale_items(
  p_sale_id uuid,
  p_operation_id uuid,
  p_items jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid;
  current_role public.app_role;
  return_id uuid;
  item record;
  sale_item record;
  previously_returned integer;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null or current_role not in ('admin', 'manager') then raise exception 'Not permitted'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Select at least one item'; end if;
  if exists (select 1 from public.sale_returns where operation_id = p_operation_id) then return; end if;
  if not exists (select 1 from public.sales where id = p_sale_id and store_id = current_store) then raise exception 'Sale not found'; end if;

  -- Validate all requested units before changing stock. Grouping prevents duplicate JSON entries.
  for item in
    select (value ->> 'sale_item_id')::uuid as sale_item_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items)
    group by (value ->> 'sale_item_id')::uuid
  loop
    if item.quantity is null or item.quantity < 1 then raise exception 'Invalid return quantity'; end if;
    select id, product_id, quantity into sale_item from public.sale_items where id = item.sale_item_id and sale_id = p_sale_id for update;
    if not found then raise exception 'Sale item not found'; end if;
    select coalesce(sum(quantity), 0) into previously_returned from public.sale_return_items where sale_item_id = item.sale_item_id;
    if previously_returned + item.quantity > sale_item.quantity then raise exception 'Return quantity exceeds sold quantity'; end if;
  end loop;

  insert into public.sale_returns (sale_id, operation_id, returned_by) values (p_sale_id, p_operation_id, auth.uid()) returning id into return_id;

  for item in
    select (value ->> 'sale_item_id')::uuid as sale_item_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items)
    group by (value ->> 'sale_item_id')::uuid
  loop
    select product_id into sale_item from public.sale_items where id = item.sale_item_id;
    insert into public.sale_return_items (sale_return_id, sale_item_id, quantity) values (return_id, item.sale_item_id, item.quantity);
    update public.products set stock_quantity = stock_quantity + item.quantity, updated_at = now() where id = sale_item.product_id and store_id = current_store;
    insert into public.stock_movements (store_id, product_id, quantity_delta, reason) values (current_store, sale_item.product_id, item.quantity, 'sale_return');
  end loop;

  if not exists (
    select 1
    from public.sale_items si
    left join public.sale_return_items sri on sri.sale_item_id = si.id
    where si.sale_id = p_sale_id
    group by si.id, si.quantity
    having coalesce(sum(sri.quantity), 0) < si.quantity
  ) then
    update public.sales set returned_at = now(), returned_by = auth.uid() where id = p_sale_id;
  end if;
end $$;

revoke all on function public.return_sale_items(uuid, uuid, jsonb) from public;
grant execute on function public.return_sale_items(uuid, uuid, jsonb) to authenticated;
