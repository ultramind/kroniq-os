-- Orders are client requests for goods to be sourced or produced. They do not
-- reserve or deduct catalogue stock at the time they are recorded.
alter type public.payment_method add value if not exists 'order';
alter table public.sales add column if not exists order_status text check (order_status in ('pending', 'fulfilled', 'cancelled'));

create or replace function public.record_order(
  p_sale_id uuid, p_receipt_no text, p_total_kobo bigint,
  p_payment_method public.payment_method, p_sold_at timestamptz,
  p_items jsonb, p_discount_kobo bigint default 0, p_credit jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid; actor_role public.app_role; line record;
  catalogue_price bigint; package_label text; package_units integer;
  submitted_total bigint := 0; effective_discount bigint := coalesce(p_discount_kobo, 0);
begin
  select store_id, role into current_store, actor_role from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  if p_payment_method <> 'order' then raise exception 'Invalid order payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'An order must include at least one item'; end if;
  if p_credit is null or nullif(trim(p_credit->>'customer_name'), '') is null or nullif(trim(p_credit->>'customer_phone'), '') is null then
    raise exception 'Client name and phone are required for orders';
  end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  for line in select (value->>'product_id')::uuid product_id, nullif(value->>'packaging_id','')::uuid packaging_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo from jsonb_array_elements(p_items) loop
    if line.quantity is null or line.quantity < 1 or line.unit_price_kobo is null or line.unit_price_kobo < 0 then raise exception 'Invalid order item'; end if;
    if line.packaging_id is not null then
      select price_kobo into catalogue_price from public.product_packaging where id = line.packaging_id and product_id = line.product_id and store_id = current_store and active;
    else
      select price_kobo into catalogue_price from public.products where id = line.product_id and store_id = current_store and active;
    end if;
    if not found or catalogue_price <> line.unit_price_kobo then raise exception 'Order item price no longer matches the catalogue'; end if;
    submitted_total := submitted_total + line.quantity * line.unit_price_kobo;
  end loop;
  if effective_discount > 0 and actor_role not in ('admin','manager') then raise exception 'Only managers and admins can apply discounts'; end if;
  if effective_discount > submitted_total or submitted_total - effective_discount <> p_total_kobo then raise exception 'Order total does not match submitted item prices'; end if;

  insert into public.sales (id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at, discount_kobo, discount_approved_by, credit_customer_name, credit_customer_phone, credit_due_date, credit_initial_payment_kobo, order_status)
  values (p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, 'order', p_sold_at, effective_discount, case when effective_discount > 0 then auth.uid() end, trim(p_credit->>'customer_name'), trim(p_credit->>'customer_phone'), case when nullif(p_credit->>'due_date','') is not null then (p_credit->>'due_date')::date end, coalesce((p_credit->>'initial_payment_kobo')::bigint,0), 'pending');

  for line in select (value->>'product_id')::uuid product_id, nullif(value->>'packaging_id','')::uuid packaging_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo from jsonb_array_elements(p_items) loop
    package_units := 1; package_label := null;
    if line.packaging_id is not null then select units_per_pack, name into package_units, package_label from public.product_packaging where id = line.packaging_id; end if;
    insert into public.sale_items(sale_id, product_id, quantity, unit_price_kobo, list_price_kobo, packaging_id, package_name, units_per_package)
    values(p_sale_id, line.product_id, line.quantity, line.unit_price_kobo, line.unit_price_kobo, line.packaging_id, package_label, package_units);
  end loop;
end;
$$;
grant execute on function public.record_order(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
