-- Returns are online-first. Authorise the caller against the returned sale's
-- organisation, rather than the profile's legacy active-store pointer.
create or replace function public.return_sale_items(
  p_sale_id uuid,
  p_operation_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_return_id uuid;
  v_item record;
  v_sale_item record;
  v_previously_returned integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item';
  end if;

  select store_id into v_store_id
  from public.sales
  where id = p_sale_id;

  if v_store_id is null then
    raise exception 'Sale not found';
  end if;

  select m.role into v_role
  from public.organization_memberships m
  join public.stores st on st.organization_id = m.organization_id
  where st.id = v_store_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can process returns';
  end if;

  if exists (select 1 from public.sale_returns where operation_id = p_operation_id) then
    return;
  end if;

  for v_item in
    select (value ->> 'product_id')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items)
    group by (value ->> 'product_id')::uuid
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Invalid return item';
    end if;

    select id, product_id, quantity into v_sale_item
    from public.sale_items
    where sale_id = p_sale_id and product_id = v_item.product_id
    for update;

    if not found then
      raise exception 'Sold product not found';
    end if;

    select coalesce(sum(quantity), 0) into v_previously_returned
    from public.sale_return_items
    where sale_item_id = v_sale_item.id;

    if v_previously_returned + v_item.quantity > v_sale_item.quantity then
      raise exception 'Return quantity exceeds sold quantity';
    end if;
  end loop;

  insert into public.sale_returns (sale_id, operation_id, returned_by)
  values (p_sale_id, p_operation_id, auth.uid())
  returning id into v_return_id;

  for v_item in
    select (value ->> 'product_id')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items)
    group by (value ->> 'product_id')::uuid
  loop
    select id, product_id into v_sale_item
    from public.sale_items
    where sale_id = p_sale_id and product_id = v_item.product_id;

    insert into public.sale_return_items (sale_return_id, sale_item_id, quantity)
    values (v_return_id, v_sale_item.id, v_item.quantity);

    update public.products
    set stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
    where id = v_sale_item.product_id and store_id = v_store_id;

    insert into public.stock_movements (store_id, product_id, quantity_delta, reason)
    values (v_store_id, v_sale_item.product_id, v_item.quantity, 'sale_return');
  end loop;

  if not exists (
    select 1
    from public.sale_items si
    left join public.sale_return_items sri on sri.sale_item_id = si.id
    where si.sale_id = p_sale_id
    group by si.id, si.quantity
    having coalesce(sum(sri.quantity), 0) < si.quantity
  ) then
    update public.sales
    set returned_at = now(), returned_by = auth.uid()
    where id = p_sale_id;
  end if;
end;
$$;

grant execute on function public.return_sale_items(uuid, uuid, jsonb) to authenticated;
