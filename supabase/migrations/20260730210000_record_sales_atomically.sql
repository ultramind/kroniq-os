-- A synced sale must update sales, sale items, and stock as one transaction.
-- The client-provided UUID is the idempotency key for offline retry safety.
create or replace function public.record_sale(
  p_sale_id uuid,
  p_receipt_no text,
  p_total_kobo bigint,
  p_payment_method public.payment_method,
  p_sold_at timestamptz,
  p_items jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; sale_item record; server_price_kobo bigint; computed_total_kobo bigint := 0;
begin
  select store_id into current_store from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  insert into public.sales (id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at)
  values (p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, p_payment_method, p_sold_at);

  -- Lock, price, and decrement each product. Any failure rolls back the complete sale.
  for sale_item in select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity from jsonb_array_elements(p_items) loop
    if sale_item.quantity is null or sale_item.quantity < 1 then raise exception 'Invalid sale item'; end if;
    update public.products set stock_quantity = stock_quantity - sale_item.quantity, updated_at = now()
      where id = sale_item.product_id and store_id = current_store and active = true and stock_quantity >= sale_item.quantity
      returning price_kobo into server_price_kobo;
    if not found then raise exception 'Insufficient stock or invalid product'; end if;
    computed_total_kobo := computed_total_kobo + (server_price_kobo * sale_item.quantity);
    insert into public.sale_items (sale_id, product_id, quantity, unit_price_kobo) values (p_sale_id, sale_item.product_id, sale_item.quantity, server_price_kobo);
  end loop;
  if computed_total_kobo <> p_total_kobo then raise exception 'Sale total does not match current catalogue prices'; end if;
end $$;
