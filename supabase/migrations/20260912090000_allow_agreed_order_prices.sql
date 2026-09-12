-- An order is a client agreement, not an immediate catalogue sale. Keep the
-- agreed price captured at order time even if the catalogue changes before it
-- syncs. Flexible-pricing controls are still enforced against that saved
-- catalogue price snapshot.
create or replace function public.record_order(
  p_sale_id uuid,
  p_receipt_no text,
  p_total_kobo bigint,
  p_payment_method public.payment_method,
  p_sold_at timestamptz,
  p_items jsonb,
  p_discount_kobo bigint default 0,
  p_credit jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_store uuid;
  actor_role public.app_role;
  line record;
  catalogue_price bigint;
  captured_list_price bigint;
  floor_price bigint;
  flexible_pricing boolean;
  package_label text;
  package_units integer;
  unit_cost bigint;
  submitted_total bigint := 0;
  default_order_cost bigint := 0;
  effective_discount bigint := coalesce(p_discount_kobo, 0);
begin
  current_store := (select store_id from public.profiles where id = auth.uid());
  actor_role := (select role from public.profiles where id = auth.uid());

  if current_store is null then
    raise exception 'A staff profile is required';
  end if;
  flexible_pricing := (select flexible_pricing_enabled from public.stores where id = current_store);
  if p_payment_method <> 'order' then
    raise exception 'Invalid order payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must include at least one item';
  end if;
  if p_credit is null
    or nullif(trim(p_credit ->> 'customer_name'), '') is null
    or nullif(trim(p_credit ->> 'customer_phone'), '') is null then
    raise exception 'Client name and phone are required for orders';
  end if;
  if (select count(*) from public.sales where id = p_sale_id) > 0 then
    return;
  end if;

  for line in
    select
      (value ->> 'product_id')::uuid as product_id,
      nullif(value ->> 'packaging_id', '')::uuid as packaging_id,
      (value ->> 'quantity')::integer as quantity,
      (value ->> 'unit_price_kobo')::bigint as unit_price_kobo,
      nullif(value ->> 'list_price_kobo', '')::bigint as list_price_kobo,
      nullif(trim(value ->> 'price_override_reason'), '') as price_override_reason
    from jsonb_array_elements(p_items)
  loop
    if line.quantity is null or line.quantity < 1 or line.unit_price_kobo is null or line.unit_price_kobo < 0 then
      raise exception 'Invalid order item';
    end if;

    if line.packaging_id is not null then
      package_units := (
        select units_per_pack
        from public.product_packaging
        where id = line.packaging_id
          and product_id = line.product_id
          and store_id = current_store
          and active = true
      );
      catalogue_price := (
        select price_kobo
        from public.product_packaging
        where id = line.packaging_id
          and product_id = line.product_id
          and store_id = current_store
          and active = true
      );
      if catalogue_price is null then raise exception 'Invalid or inactive order product'; end if;
      unit_cost := (
        select cost_price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      );
    else
      package_units := 1;
      catalogue_price := (
        select price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      );
      if catalogue_price is null then raise exception 'Invalid or inactive order product'; end if;
      floor_price := (
        select minimum_selling_price_kobo
        from public.products
        where id = line.product_id and store_id = current_store
      );
      unit_cost := (
        select cost_price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      );
    end if;
    captured_list_price := coalesce(line.list_price_kobo, catalogue_price);
    if line.unit_price_kobo <> captured_list_price then
      if line.packaging_id is not null then
        raise exception 'Package prices cannot be overridden';
      end if;
      if not flexible_pricing then
        raise exception 'Flexible pricing is disabled for this store';
      end if;
      if floor_price is null then
        raise exception 'Flexible pricing is disabled for this product';
      end if;
      if actor_role = 'cashier'
        and (line.unit_price_kobo < floor_price or line.unit_price_kobo > captured_list_price) then
        raise exception 'The agreed price is outside this cashier''s permitted range';
      end if;
      if actor_role in ('manager', 'admin')
        and line.unit_price_kobo < floor_price
        and line.price_override_reason is null then
        raise exception 'A reason is required for a price below the product floor';
      end if;
    end if;
    default_order_cost := default_order_cost + (coalesce(unit_cost, 0) * line.quantity * package_units);
    submitted_total := submitted_total + line.quantity * line.unit_price_kobo;
  end loop;

  if effective_discount > 0 and actor_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can apply discounts';
  end if;
  if effective_discount > submitted_total or submitted_total - effective_discount <> p_total_kobo then
    raise exception 'Order total does not match submitted item prices';
  end if;

  insert into public.sales (
    id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at,
    discount_kobo, discount_approved_by, credit_customer_name, credit_customer_phone,
    credit_due_date, credit_initial_payment_kobo, order_status, order_notes, order_cost_kobo
  )
  values (
    p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, 'order', p_sold_at,
    effective_discount, case when effective_discount > 0 then auth.uid() end,
    trim(p_credit ->> 'customer_name'), trim(p_credit ->> 'customer_phone'),
    case when nullif(p_credit ->> 'due_date', '') is not null then (p_credit ->> 'due_date')::date end,
    coalesce((p_credit ->> 'initial_payment_kobo')::bigint, 0), 'pending',
    nullif(trim(p_credit ->> 'note'), ''), default_order_cost
  );

  for line in
    select
      (value ->> 'product_id')::uuid as product_id,
      nullif(value ->> 'packaging_id', '')::uuid as packaging_id,
      (value ->> 'quantity')::integer as quantity,
      (value ->> 'unit_price_kobo')::bigint as unit_price_kobo,
      nullif(value ->> 'list_price_kobo', '')::bigint as list_price_kobo,
      nullif(trim(value ->> 'price_override_reason'), '') as price_override_reason
    from jsonb_array_elements(p_items)
  loop
    package_units := 1;
    package_label := null;
    unit_cost := 0;
    if line.packaging_id is not null then
      package_units := (
        select units_per_pack
        from public.product_packaging
        where id = line.packaging_id and product_id = line.product_id and store_id = current_store and active = true
      );
      package_label := (
        select name
        from public.product_packaging
        where id = line.packaging_id and product_id = line.product_id and store_id = current_store and active = true
      );
      catalogue_price := (
        select price_kobo
        from public.product_packaging
        where id = line.packaging_id and product_id = line.product_id and store_id = current_store and active = true
      );
      unit_cost := coalesce((
        select cost_price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      ), 0) * package_units;
    else
      catalogue_price := (
        select price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      );
      unit_cost := coalesce((
        select cost_price_kobo
        from public.products
        where id = line.product_id and store_id = current_store and active = true
      ), 0);
    end if;

    captured_list_price := coalesce(line.list_price_kobo, catalogue_price);
    insert into public.sale_items (
      sale_id, product_id, quantity, unit_price_kobo, list_price_kobo, cost_price_kobo,
      price_override_reason, price_override_by, packaging_id, package_name, units_per_package
    )
    values (
      p_sale_id, line.product_id, line.quantity, line.unit_price_kobo, captured_list_price, unit_cost,
      case
        when line.unit_price_kobo <> captured_list_price then line.price_override_reason
      end,
      case when line.unit_price_kobo <> captured_list_price then auth.uid() end,
      line.packaging_id, package_label, package_units
    );
  end loop;
end;
$$;

grant execute on function public.record_order(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
