-- Additional barcodes identify the same parent product. They share its price,
-- cost, and stock quantity; they are not product variants or package barcodes.
create table if not exists public.product_barcode_aliases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null check (length(trim(barcode)) between 3 and 120),
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, barcode)
);
create index if not exists product_barcode_aliases_product_idx on public.product_barcode_aliases(product_id);
alter table public.product_barcode_aliases enable row level security;
drop policy if exists "active staff view product barcode aliases" on public.product_barcode_aliases;
create policy "active staff view product barcode aliases" on public.product_barcode_aliases for select to authenticated
using (public.has_active_store_membership(store_id, array['admin', 'manager', 'cashier']));
drop policy if exists "active managers manage product barcode aliases" on public.product_barcode_aliases;
create policy "active managers manage product barcode aliases" on public.product_barcode_aliases for all to authenticated
using (public.has_active_store_membership(store_id, array['admin', 'manager']))
with check (public.has_active_store_membership(store_id, array['admin', 'manager']));

create or replace function public.replace_product_barcode_aliases_for_store(
  p_store_id uuid,
  p_product_id uuid,
  p_primary_barcode text,
  p_aliases jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias jsonb;
  v_barcode text;
  v_label text;
begin
  if jsonb_typeof(coalesce(p_aliases, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_aliases, '[]'::jsonb)) > 20 then
    raise exception 'A product can have a maximum of 20 additional barcodes';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) alias_row
    group by trim(alias_row ->> 'barcode')
    having count(*) > 1
  ) then
    raise exception 'Each additional barcode must be unique';
  end if;

  for v_alias in select value from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) loop
    v_barcode := trim(coalesce(v_alias ->> 'barcode', ''));
    v_label := nullif(trim(coalesce(v_alias ->> 'label', '')), '');
    if v_barcode = '' then raise exception 'Additional barcodes cannot be empty'; end if;
    if v_barcode = trim(p_primary_barcode) then raise exception 'An additional barcode cannot match the primary barcode'; end if;
    if exists (select 1 from public.products where store_id = p_store_id and sku = v_barcode and id <> p_product_id) then
      raise exception 'Barcode % is already the primary barcode of another product', v_barcode;
    end if;
    if exists (
      select 1
      from public.product_barcode_aliases alias_row
      where alias_row.store_id = p_store_id and alias_row.barcode = v_barcode and alias_row.product_id <> p_product_id
    ) then
      raise exception 'Barcode % is already assigned to another product', v_barcode;
    end if;
    if exists (
      select 1
      from public.product_packaging package
      join public.products product on product.id = package.product_id
      where product.store_id = p_store_id and package.sku = v_barcode and package.active
    ) then
      raise exception 'Barcode % is already used by a product package', v_barcode;
    end if;
  end loop;

  delete from public.product_barcode_aliases where product_id = p_product_id;
  insert into public.product_barcode_aliases (store_id, product_id, barcode, label)
  select p_store_id, p_product_id, trim(value ->> 'barcode'), nullif(trim(coalesce(value ->> 'label', '')), '')
  from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb));
end;
$$;

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
  if v_store_id is null or v_role not in ('admin', 'manager') then raise exception 'Only managers and admins can add products'; end if;
  if v_name = '' or v_sku = '' then raise exception 'Product name and barcode/SKU are required'; end if;
  if exists (select 1 from public.product_barcode_aliases where store_id = v_store_id and barcode = v_sku) then
    raise exception 'This barcode is already used as an additional barcode';
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
    v_product_id, v_store_id, v_category_id, v_name, v_sku,
    coalesce((p_product->>'price_kobo')::bigint, 0), coalesce((p_product->>'cost_price_kobo')::bigint, 0),
    nullif(p_product->>'minimum_selling_price_kobo', '')::bigint,
    coalesce((p_product->>'stock_quantity')::integer, 0), coalesce((p_product->>'low_stock_threshold')::integer, 10)
  );
  perform public.replace_product_barcode_aliases_for_store(v_store_id, v_product_id, v_sku, p_product -> 'barcode_aliases');
  return v_product_id;
end;
$$;

create or replace function public.update_product_details(p_product_id uuid, p_product jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_image_urls text[];
  v_category_id uuid;
  v_category_name text;
  v_sku text := trim(coalesce(p_product ->> 'sku', ''));
begin
  if auth.uid() is null then raise exception 'Product update requires an authenticated user session'; end if;
  if coalesce(trim(p_product ->> 'name'), '') = '' or v_sku = '' then raise exception 'Product name and barcode/SKU are required'; end if;
  if coalesce((p_product ->> 'price_kobo')::bigint, -1) < 0 or coalesce((p_product ->> 'cost_price_kobo')::bigint, -1) < 0 then raise exception 'Selling and cost prices must be valid amounts'; end if;
  select product.store_id into v_store_id from public.products product where product.id = p_product_id;
  if v_store_id is null then raise exception 'Product not found in an active workspace. Refresh and try again.'; end if;
  select membership.role into v_role from public.organization_memberships membership join public.stores store on store.organization_id = membership.organization_id where store.id = v_store_id and membership.user_id = auth.uid() and membership.status = 'active';
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'Only active managers and admins can update products'; end if;
  if exists (select 1 from public.product_barcode_aliases where store_id = v_store_id and barcode = v_sku) then raise exception 'Remove this barcode from additional barcodes before making it the primary barcode'; end if;
  v_category_name := regexp_replace(trim(coalesce(p_product ->> 'category_name', '')), '\s+', ' ', 'g');
  if v_category_name = '' then raise exception 'Product category is required'; end if;
  insert into public.categories (store_id, name) values (v_store_id, v_category_name) on conflict (store_id, name) do update set name = excluded.name returning id into v_category_id;
  select coalesce(array_agg(value), '{}'::text[]) into v_image_urls from jsonb_array_elements_text(coalesce(p_product -> 'image_urls', '[]'::jsonb)) value;
  if cardinality(v_image_urls) > 3 then raise exception 'A product can have a maximum of 3 images'; end if;
  update public.products set
    category_id = v_category_id, name = trim(p_product ->> 'name'), sku = v_sku,
    price_kobo = (p_product ->> 'price_kobo')::bigint, cost_price_kobo = (p_product ->> 'cost_price_kobo')::bigint,
    minimum_selling_price_kobo = case when p_product ? 'minimum_selling_price_kobo' then nullif(p_product ->> 'minimum_selling_price_kobo', '')::bigint else minimum_selling_price_kobo end,
    low_stock_threshold = coalesce((p_product ->> 'low_stock_threshold')::integer, low_stock_threshold),
    active = coalesce((p_product ->> 'active')::boolean, true), description = nullif(trim(coalesce(p_product ->> 'description', '')), ''),
    image_url = v_image_urls[1], image_urls = v_image_urls, online_published = coalesce((p_product ->> 'online_published')::boolean, false),
    is_featured = coalesce((p_product ->> 'is_featured')::boolean, false),
    published_at = case when coalesce((p_product ->> 'online_published')::boolean, false) and not online_published then now() else published_at end,
    updated_at = now()
  where id = p_product_id;
  if not found then raise exception 'Product update could not be saved'; end if;
  perform public.replace_product_barcode_aliases_for_store(v_store_id, p_product_id, v_sku, p_product -> 'barcode_aliases');
end;
$$;

grant execute on function public.create_current_store_product(jsonb) to authenticated;
grant execute on function public.update_product_details(uuid, jsonb) to authenticated;
