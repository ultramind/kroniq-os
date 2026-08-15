-- Accepts manager-approved discounts while keeping the server catalogue as the price authority.
create or replace function public.record_sale(
  p_sale_id uuid,
  p_receipt_no text,
  p_total_kobo bigint,
  p_payment_method public.payment_method,
  p_sold_at timestamptz,
  p_items jsonb,
  p_discount_kobo bigint default 0
)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid;
  current_role public.app_role;
  sale_item record;
  server_price_kobo bigint;
  computed_total_kobo bigint := 0;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if p_discount_kobo < 0 then raise exception 'Invalid discount'; end if;
  if p_discount_kobo > 0 and current_role not in ('admin', 'manager') then raise exception 'Only managers can apply discounts'; end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  insert into public.sales (id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at, discount_kobo, discount_approved_by)
  values (p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, p_payment_method, p_sold_at, p_discount_kobo, case when p_discount_kobo > 0 then auth.uid() else null end);

  for sale_item in select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity from jsonb_array_elements(p_items) loop
    if sale_item.quantity is null or sale_item.quantity < 1 then raise exception 'Invalid sale item'; end if;
    update public.products set stock_quantity = stock_quantity - sale_item.quantity, updated_at = now()
      where id = sale_item.product_id and store_id = current_store and active = true and stock_quantity >= sale_item.quantity
      returning price_kobo into server_price_kobo;
    if not found then raise exception 'Insufficient stock or invalid product'; end if;
    computed_total_kobo := computed_total_kobo + (server_price_kobo * sale_item.quantity);
    insert into public.sale_items (sale_id, product_id, quantity, unit_price_kobo) values (p_sale_id, sale_item.product_id, sale_item.quantity, server_price_kobo);
  end loop;

  if p_discount_kobo > computed_total_kobo then raise exception 'Discount exceeds the sale value'; end if;
  if computed_total_kobo - p_discount_kobo <> p_total_kobo then
    raise exception 'Sale total does not match current catalogue prices (expected %, submitted %)', computed_total_kobo - p_discount_kobo, p_total_kobo;
  end if;
end $$;

revoke all on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint) from public;
grant execute on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint) to authenticated;
