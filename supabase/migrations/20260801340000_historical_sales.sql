-- Managers can enter missed sales from a past date without changing today's stock.
alter table public.sales add column if not exists is_historical boolean not null default false;

create or replace function public.record_historical_sale(
  p_sale_id uuid,
  p_receipt_no text,
  p_total_kobo bigint,
  p_payment_method public.payment_method,
  p_sold_at timestamptz,
  p_items jsonb,
  p_discount_kobo bigint default 0,
  p_credit jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  current_store uuid;
  actor_role public.app_role;
  sale_item record;
  submitted_total_kobo bigint := 0;
  initial_payment_kobo bigint := 0;
begin
  select store_id, role into current_store, actor_role from public.profiles where id = auth.uid();
  if current_store is null or actor_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can record historical sales';
  end if;
  if p_sold_at::date >= current_date then raise exception 'Historical sale date must be before today'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A sale must include at least one item'; end if;
  if p_total_kobo < 0 or p_discount_kobo < 0 then raise exception 'Invalid sale amount'; end if;
  if p_payment_method = 'credit' and (p_credit is null or coalesce(nullif(trim(p_credit->>'customer_name'), ''), '') = '' or coalesce(nullif(trim(p_credit->>'customer_phone'), ''), '') = '') then
    raise exception 'Customer name and phone are required for credit sales';
  end if;
  if exists (select 1 from public.sales where id = p_sale_id) then return; end if;

  for sale_item in
    select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity, (value->>'unit_price_kobo')::bigint as unit_price_kobo
    from jsonb_array_elements(p_items)
  loop
    if sale_item.quantity is null or sale_item.quantity < 1 or sale_item.unit_price_kobo is null or sale_item.unit_price_kobo < 0 then raise exception 'Invalid sale item'; end if;
    if not exists (select 1 from public.products where id = sale_item.product_id and store_id = current_store) then raise exception 'A selected product is not in this store'; end if;
    submitted_total_kobo := submitted_total_kobo + (sale_item.quantity * sale_item.unit_price_kobo);
  end loop;
  if submitted_total_kobo - p_discount_kobo <> p_total_kobo then raise exception 'Sale total does not match submitted items'; end if;
  if p_payment_method = 'credit' then
    initial_payment_kobo := coalesce((p_credit->>'initial_payment_kobo')::bigint, 0);
    if initial_payment_kobo < 0 or initial_payment_kobo > p_total_kobo then raise exception 'Initial payment is invalid'; end if;
  end if;

  insert into public.sales (
    id, store_id, cashier_id, receipt_no, total_kobo, payment_method, sold_at,
    discount_kobo, discount_approved_by, credit_customer_name, credit_customer_phone,
    credit_due_date, credit_initial_payment_kobo, credit_settled_at, is_historical
  ) values (
    p_sale_id, current_store, auth.uid(), p_receipt_no, p_total_kobo, p_payment_method, p_sold_at,
    p_discount_kobo, case when p_discount_kobo > 0 then auth.uid() else null end,
    case when p_payment_method = 'credit' then trim(p_credit->>'customer_name') end,
    case when p_payment_method = 'credit' then trim(p_credit->>'customer_phone') end,
    case when p_payment_method = 'credit' and nullif(p_credit->>'due_date', '') is not null then (p_credit->>'due_date')::date end,
    initial_payment_kobo,
    case when p_payment_method = 'credit' and initial_payment_kobo = p_total_kobo then now() end,
    true
  );
  for sale_item in
    select (value->>'product_id')::uuid as product_id, (value->>'quantity')::integer as quantity, (value->>'unit_price_kobo')::bigint as unit_price_kobo
    from jsonb_array_elements(p_items)
  loop
    insert into public.sale_items (sale_id, product_id, quantity, unit_price_kobo)
    values (p_sale_id, sale_item.product_id, sale_item.quantity, sale_item.unit_price_kobo);
  end loop;
end $$;

revoke all on function public.record_historical_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) from public;
grant execute on function public.record_historical_sale(uuid, text, bigint, public.payment_method, timestamptz, jsonb, bigint, jsonb) to authenticated;
