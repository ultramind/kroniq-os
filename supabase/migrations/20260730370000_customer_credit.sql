-- Customer credit replaces mobile money and records who owes the store.
alter type public.payment_method rename value 'mobile_money' to 'credit';
alter table public.sales add column if not exists credit_customer_name text;
alter table public.sales add column if not exists credit_customer_phone text;
alter table public.sales add column if not exists credit_due_date date;
alter table public.sales add column if not exists credit_settled_at timestamptz;

create or replace function public.record_sale(
  p_sale_id uuid, p_receipt_no text, p_total_kobo bigint, p_payment_method public.payment_method,
  p_sold_at timestamptz, p_items jsonb, p_discount_kobo bigint default 0, p_credit jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role; sale_item record; server_price_kobo bigint; computed_total_kobo bigint := 0; effective_discount_kobo bigint := p_discount_kobo;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if p_discount_kobo < 0 then raise exception 'Invalid discount'; end if;
  if p_payment_method = 'credit' and (p_credit is null or coalesce(nullif(trim(p_credit->>'customer_name'), ''), '') = '' or coalesce(nullif(trim(p_credit->>'customer_phone'), ''), '') = '') then raise exception 'Customer name and phone are required for credit sales'; end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;
  for sale_item in select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity from jsonb_array_elements(p_items) loop
    if sale_item.quantity is null or sale_item.quantity < 1 then raise exception 'Invalid sale item'; end if;
    select price_kobo into server_price_kobo from public.products where id = sale_item.product_id and store_id = current_store and active = true and stock_quantity >= sale_item.quantity for update;
    if not found then raise exception 'Insufficient stock or invalid product'; end if;
    computed_total_kobo := computed_total_kobo + server_price_kobo * sale_item.quantity;
  end loop;
  if effective_discount_kobo = 0 and p_total_kobo < computed_total_kobo then effective_discount_kobo := computed_total_kobo - p_total_kobo; end if;
  if effective_discount_kobo > 0 and current_role not in ('admin', 'manager') then raise exception 'Only managers can apply discounts'; end if;
  if effective_discount_kobo > computed_total_kobo or computed_total_kobo - effective_discount_kobo <> p_total_kobo then raise exception 'Sale total does not match current catalogue prices (expected %, submitted %)', computed_total_kobo - effective_discount_kobo, p_total_kobo; end if;
  insert into public.sales (id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at, discount_kobo, discount_approved_by, credit_customer_name, credit_customer_phone, credit_due_date)
  values (p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, p_payment_method, p_sold_at, effective_discount_kobo, case when effective_discount_kobo > 0 then auth.uid() else null end, case when p_payment_method = 'credit' then trim(p_credit->>'customer_name') end, case when p_payment_method = 'credit' then trim(p_credit->>'customer_phone') end, case when p_payment_method = 'credit' and nullif(p_credit->>'due_date', '') is not null then (p_credit->>'due_date')::date end);
  for sale_item in select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity from jsonb_array_elements(p_items) loop
    select price_kobo into server_price_kobo from public.products where id = sale_item.product_id and store_id = current_store;
    update public.products set stock_quantity = stock_quantity - sale_item.quantity, updated_at = now() where id = sale_item.product_id and store_id = current_store;
    insert into public.sale_items (sale_id, product_id, quantity, unit_price_kobo) values (p_sale_id, sale_item.product_id, sale_item.quantity, server_price_kobo);
  end loop;
end $$;
grant execute on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
