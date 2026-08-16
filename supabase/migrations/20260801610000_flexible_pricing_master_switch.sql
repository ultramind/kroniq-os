-- The organisation-wide checkout master switch overrides every product floor.
alter table public.stores
  add column if not exists flexible_pricing_enabled boolean not null default true;

create or replace function public.update_current_store_checkout_settings(
  p_flexible_pricing_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_store uuid; actor_role public.app_role;
begin
  select store_id, role into current_store, actor_role from public.profiles where id = auth.uid();
  if current_store is null or actor_role <> 'admin' then raise exception 'Only administrators can update checkout settings'; end if;
  update public.stores set flexible_pricing_enabled = coalesce(p_flexible_pricing_enabled, true) where id = current_store;
end;
$$;

grant execute on function public.update_current_store_checkout_settings(boolean) to authenticated;

create or replace function public.record_sale(
  p_sale_id uuid, p_receipt_no text, p_total_kobo bigint,
  p_payment_method public.payment_method, p_sold_at timestamptz,
  p_items jsonb, p_discount_kobo bigint default 0, p_credit jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid; actor_role public.app_role; flexible_pricing boolean;
  sale_item record; catalogue_price_kobo bigint; floor_price_kobo bigint;
  submitted_total_kobo bigint := 0; effective_discount_kobo bigint := coalesce(p_discount_kobo, 0);
begin
  select store_id, role into current_store, actor_role from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  select flexible_pricing_enabled into flexible_pricing from public.stores where id = current_store;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if p_total_kobo < 0 or effective_discount_kobo < 0 then raise exception 'Invalid sale amount'; end if;
  if p_payment_method = 'credit' and (p_credit is null or coalesce(nullif(trim(p_credit->>'customer_name'), ''), '') = '' or coalesce(nullif(trim(p_credit->>'customer_phone'), ''), '') = '') then raise exception 'Customer name and phone are required for credit sales'; end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  for sale_item in select (value->>'product_id')::uuid product_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo, nullif(trim(value->>'price_override_reason'), '') price_override_reason from jsonb_array_elements(p_items) loop
    if sale_item.quantity is null or sale_item.quantity < 1 or sale_item.unit_price_kobo is null or sale_item.unit_price_kobo < 0 then raise exception 'Invalid sale item'; end if;
    select price_kobo, minimum_selling_price_kobo into catalogue_price_kobo, floor_price_kobo from public.products where id = sale_item.product_id and store_id = current_store and active = true and stock_quantity >= sale_item.quantity for update;
    if not found then raise exception 'Insufficient stock or invalid product'; end if;
    if sale_item.unit_price_kobo <> catalogue_price_kobo then
      if not flexible_pricing then raise exception 'Flexible pricing is disabled for this store'; end if;
      if floor_price_kobo is null then raise exception 'Flexible pricing is disabled for this product'; end if;
      if actor_role = 'cashier' and (sale_item.unit_price_kobo < floor_price_kobo or sale_item.unit_price_kobo > catalogue_price_kobo) then raise exception 'The agreed price is outside this cashier''s permitted range'; end if;
      if actor_role in ('manager', 'admin') and sale_item.unit_price_kobo < floor_price_kobo and sale_item.price_override_reason is null then raise exception 'A reason is required for a price below the product floor'; end if;
    end if;
    submitted_total_kobo := submitted_total_kobo + sale_item.quantity * sale_item.unit_price_kobo;
  end loop;

  if effective_discount_kobo = 0 and p_total_kobo < submitted_total_kobo then effective_discount_kobo := submitted_total_kobo - p_total_kobo; end if;
  if effective_discount_kobo > 0 and actor_role not in ('admin', 'manager') then raise exception 'Only managers and admins can apply discounts'; end if;
  if effective_discount_kobo > submitted_total_kobo or submitted_total_kobo - effective_discount_kobo <> p_total_kobo then raise exception 'Sale total does not match submitted unit prices'; end if;

  insert into public.sales (id,store_id,cashier_id,receipt_no,total_kobo,payment_method,sold_at,discount_kobo,discount_approved_by,credit_customer_name,credit_customer_phone,credit_due_date)
  values (p_sale_id,current_store,auth.uid(),p_receipt_no,p_total_kobo,p_payment_method,p_sold_at,effective_discount_kobo,case when effective_discount_kobo>0 then auth.uid() end,case when p_payment_method='credit' then trim(p_credit->>'customer_name') end,case when p_payment_method='credit' then trim(p_credit->>'customer_phone') end,case when p_payment_method='credit' and nullif(p_credit->>'due_date','') is not null then (p_credit->>'due_date')::date end);

  for sale_item in select (value->>'product_id')::uuid product_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo, nullif(trim(value->>'price_override_reason'), '') price_override_reason from jsonb_array_elements(p_items) loop
    select price_kobo into catalogue_price_kobo from public.products where id = sale_item.product_id and store_id = current_store;
    update public.products set stock_quantity = stock_quantity - sale_item.quantity, updated_at = now() where id = sale_item.product_id and store_id = current_store;
    insert into public.sale_items (sale_id,product_id,quantity,unit_price_kobo,list_price_kobo,price_override_reason,price_override_by)
    values (p_sale_id,sale_item.product_id,sale_item.quantity,sale_item.unit_price_kobo,catalogue_price_kobo,case when sale_item.unit_price_kobo <> catalogue_price_kobo then sale_item.price_override_reason end,case when sale_item.unit_price_kobo <> catalogue_price_kobo then auth.uid() end);
  end loop;
end;
$$;

revoke all on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) from public;
grant execute on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
