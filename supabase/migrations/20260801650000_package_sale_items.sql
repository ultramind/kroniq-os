-- A sale line can represent a pack while stock continues to move in base units.
alter table public.sale_items add column if not exists packaging_id uuid references public.product_packaging(id);
alter table public.sale_items add column if not exists package_name text;
alter table public.sale_items add column if not exists units_per_package integer not null default 1 check (units_per_package > 0);

create or replace function public.record_sale(
  p_sale_id uuid, p_receipt_no text, p_total_kobo bigint,
  p_payment_method public.payment_method, p_sold_at timestamptz,
  p_items jsonb, p_discount_kobo bigint default 0, p_credit jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid; actor_role public.app_role; flexible_pricing boolean;
  line record; catalogue_price bigint; floor_price bigint; stock_units integer; package_units integer; package_label text;
  submitted_total bigint := 0; effective_discount bigint := coalesce(p_discount_kobo, 0);
begin
  select store_id, role into current_store, actor_role from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  select flexible_pricing_enabled into flexible_pricing from public.stores where id = current_store;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  for line in select (value->>'product_id')::uuid product_id, nullif(value->>'packaging_id','')::uuid packaging_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo, nullif(trim(value->>'price_override_reason'),'') price_override_reason from jsonb_array_elements(p_items) loop
    if line.quantity is null or line.quantity < 1 or line.unit_price_kobo is null or line.unit_price_kobo < 0 then raise exception 'Invalid sale item'; end if;
    package_units := 1; package_label := null;
    if line.packaging_id is not null then
      select units_per_pack, price_kobo, name into package_units, catalogue_price, package_label from public.product_packaging where id = line.packaging_id and product_id = line.product_id and store_id = current_store and active = true;
      if not found then raise exception 'Invalid product package'; end if;
    else
      select price_kobo, minimum_selling_price_kobo into catalogue_price, floor_price from public.products where id = line.product_id and store_id = current_store and active = true;
      if not found then raise exception 'Invalid product'; end if;
    end if;
    stock_units := line.quantity * package_units;
    if not exists (select 1 from public.products where id = line.product_id and store_id = current_store and stock_quantity >= stock_units for update) then raise exception 'Insufficient stock'; end if;
    if line.unit_price_kobo <> catalogue_price then
      if line.packaging_id is not null then raise exception 'Package prices cannot be overridden'; end if;
      if not flexible_pricing then raise exception 'Flexible pricing is disabled for this store'; end if;
      if floor_price is null then raise exception 'Flexible pricing is disabled for this product'; end if;
      if actor_role = 'cashier' and (line.unit_price_kobo < floor_price or line.unit_price_kobo > catalogue_price) then raise exception 'The agreed price is outside this cashier''s permitted range'; end if;
      if actor_role in ('manager','admin') and line.unit_price_kobo < floor_price and line.price_override_reason is null then raise exception 'A reason is required for a price below the product floor'; end if;
    end if;
    submitted_total := submitted_total + line.quantity * line.unit_price_kobo;
  end loop;
  if effective_discount = 0 and p_total_kobo < submitted_total then effective_discount := submitted_total - p_total_kobo; end if;
  if effective_discount > 0 and actor_role not in ('admin','manager') then raise exception 'Only managers and admins can apply discounts'; end if;
  if effective_discount > submitted_total or submitted_total - effective_discount <> p_total_kobo then raise exception 'Sale total does not match submitted unit prices'; end if;
  insert into public.sales (id,store_id,cashier_id,receipt_no,total_kobo,payment_method,sold_at,discount_kobo,discount_approved_by,credit_customer_name,credit_customer_phone,credit_due_date)
  values (p_sale_id,current_store,auth.uid(),p_receipt_no,p_total_kobo,p_payment_method,p_sold_at,effective_discount,case when effective_discount>0 then auth.uid() end,case when p_payment_method='credit' then trim(p_credit->>'customer_name') end,case when p_payment_method='credit' then trim(p_credit->>'customer_phone') end,case when p_payment_method='credit' and nullif(p_credit->>'due_date','') is not null then (p_credit->>'due_date')::date end);
  for line in select (value->>'product_id')::uuid product_id, nullif(value->>'packaging_id','')::uuid packaging_id, (value->>'quantity')::integer quantity, (value->>'unit_price_kobo')::bigint unit_price_kobo, nullif(trim(value->>'price_override_reason'),'') price_override_reason from jsonb_array_elements(p_items) loop
    package_units := 1; package_label := null;
    if line.packaging_id is not null then select units_per_pack, name, price_kobo into package_units, package_label, catalogue_price from public.product_packaging where id=line.packaging_id; else select price_kobo into catalogue_price from public.products where id=line.product_id; end if;
    update public.products set stock_quantity=stock_quantity-(line.quantity*package_units), updated_at=now() where id=line.product_id;
    insert into public.sale_items(sale_id,product_id,quantity,unit_price_kobo,list_price_kobo,price_override_reason,price_override_by,packaging_id,package_name,units_per_package)
    values(p_sale_id,line.product_id,line.quantity,line.unit_price_kobo,catalogue_price,case when line.packaging_id is null and line.unit_price_kobo<>catalogue_price then line.price_override_reason end,case when line.packaging_id is null and line.unit_price_kobo<>catalogue_price then auth.uid() end,line.packaging_id,package_label,package_units);
  end loop;
end;
$$;
grant execute on function public.record_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
