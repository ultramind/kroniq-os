-- Product creation must be atomic with category creation and must not depend
-- on client-side RLS upserts. The active profile is set only by the protected
-- workspace activation function, so it is the authority for this write.
create or replace function public.create_current_store_product(p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_product_id uuid := coalesce(nullif(p_product->>'id', '')::uuid, gen_random_uuid());
  v_category_id uuid;
  v_name text := trim(coalesce(p_product->>'name', ''));
  v_sku text := trim(coalesce(p_product->>'sku', ''));
  v_category_name text := regexp_replace(trim(coalesce(p_product->>'category_name', '')), '\s+', ' ', 'g');
begin
  select store_id, role into v_store_id, v_role from public.profiles where id = auth.uid();
  if v_store_id is null or v_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can add products';
  end if;
  if v_name = '' or v_sku = '' then
    raise exception 'Product name and barcode/SKU are required';
  end if;
  if v_category_name = '' then v_category_name := 'Uncategorised'; end if;

  insert into public.categories (store_id, name)
  values (v_store_id, v_category_name)
  on conflict (store_id, name) do update set name = excluded.name
  returning id into v_category_id;

  insert into public.products (
    id, store_id, category_id, name, sku, price_kobo, cost_price_kobo,
    minimum_selling_price_kobo, stock_quantity, low_stock_threshold
  ) values (
    v_product_id,
    v_store_id,
    v_category_id,
    v_name,
    v_sku,
    coalesce((p_product->>'price_kobo')::bigint, 0),
    coalesce((p_product->>'cost_price_kobo')::bigint, 0),
    nullif(p_product->>'minimum_selling_price_kobo', '')::bigint,
    coalesce((p_product->>'stock_quantity')::integer, 0),
    coalesce((p_product->>'low_stock_threshold')::integer, 10)
  );

  return v_product_id;
end;
$$;

grant execute on function public.create_current_store_product(jsonb) to authenticated;
