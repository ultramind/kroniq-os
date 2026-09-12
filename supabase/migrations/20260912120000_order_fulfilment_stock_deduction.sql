-- A fulfilled made-to-order sale may be sourced separately, or supplied from
-- existing inventory. Keep the choice explicit and record a stock movement
-- only when a manager elects to fulfil it from current stock.
alter table public.sales
  add column if not exists order_stock_deducted_at timestamptz;

create or replace function public.update_order_management(
  p_sale_id uuid,
  p_status text,
  p_notes text default null,
  p_order_cost_kobo bigint default null,
  p_deduct_stock boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_current_status text;
  v_stock_deducted_at timestamptz;
  v_product record;
  v_available_stock integer;
begin
  if p_status not in ('pending', 'in_progress', 'ready', 'fulfilled', 'cancelled') then
    raise exception 'Invalid order status';
  end if;
  if p_order_cost_kobo is not null and p_order_cost_kobo < 0 then
    raise exception 'Cost cannot be negative';
  end if;

  select store_id, order_status, order_stock_deducted_at
  into v_store_id, v_current_status, v_stock_deducted_at
  from public.sales
  where id = p_sale_id and payment_method = 'order'
  for update;

  if v_store_id is null then
    raise exception 'Order has not synced yet or is unavailable';
  end if;

  select membership.role
  into v_role
  from public.organization_memberships membership
  join public.stores store_record on store_record.organization_id = membership.organization_id
  where store_record.id = v_store_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can manage orders';
  end if;

  if p_deduct_stock then
    if p_status <> 'fulfilled' then
      raise exception 'Stock can only be deducted when an order is fulfilled';
    end if;
    if v_stock_deducted_at is not null then
      raise exception 'Stock has already been deducted for this order';
    end if;

    -- Lock and validate every product before changing any stock, including
    -- package lines which consume multiple base units.
    for v_product in
      select
        item.product_id,
        sum(item.quantity * coalesce(item.units_per_package, 1))::integer as required_quantity
      from public.sale_items item
      where item.sale_id = p_sale_id
      group by item.product_id
    loop
      select stock_quantity
      into v_available_stock
      from public.products
      where id = v_product.product_id and store_id = v_store_id
      for update;

      if v_available_stock is null then
        raise exception 'A product on this order is unavailable';
      end if;
      if v_available_stock < v_product.required_quantity then
        raise exception 'Insufficient current stock to fulfil this order';
      end if;
    end loop;

    for v_product in
      select
        item.product_id,
        sum(item.quantity * coalesce(item.units_per_package, 1))::integer as required_quantity
      from public.sale_items item
      where item.sale_id = p_sale_id
      group by item.product_id
    loop
      update public.products
      set stock_quantity = stock_quantity - v_product.required_quantity,
          updated_at = now()
      where id = v_product.product_id and store_id = v_store_id;

      insert into public.stock_movements (
        store_id,
        product_id,
        quantity_delta,
        reason,
        reference_id
      )
      values (
        v_store_id,
        v_product.product_id,
        -v_product.required_quantity,
        'order_fulfilment',
        p_sale_id
      );
    end loop;
  end if;

  update public.sales
  set order_status = p_status,
      order_notes = nullif(trim(p_notes), ''),
      order_cost_kobo = p_order_cost_kobo,
      order_stock_deducted_at = case
        when p_deduct_stock then now()
        else order_stock_deducted_at
      end
  where id = p_sale_id and payment_method = 'order';
end;
$$;

grant execute on function public.update_order_management(uuid, text, text, bigint, boolean) to authenticated;
