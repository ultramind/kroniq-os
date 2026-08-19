-- Product edits are online-first. Authorise against the product's organisation
-- membership so workspace switches cannot leave product management blocked by RLS.
create or replace function public.update_product_details(
  p_product_id uuid,
  p_product jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_image_urls text[];
begin
  if auth.uid() is null then
    raise exception 'Product update requires an authenticated user session';
  end if;

  if coalesce(trim(p_product ->> 'name'), '') = '' then
    raise exception 'Product name is required';
  end if;
  if coalesce(trim(p_product ->> 'sku'), '') = '' then
    raise exception 'SKU / barcode is required';
  end if;
  if coalesce((p_product ->> 'price_kobo')::bigint, -1) < 0
    or coalesce((p_product ->> 'cost_price_kobo')::bigint, -1) < 0 then
    raise exception 'Selling and cost prices must be valid amounts';
  end if;

  select product.store_id
    into v_store_id
  from public.products product
  where product.id = p_product_id;

  if v_store_id is null then
    raise exception 'Product not found in an active workspace. Refresh and try again.';
  end if;

  select membership.role
    into v_role
  from public.organization_memberships membership
  join public.stores store on store.organization_id = membership.organization_id
  where store.id = v_store_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Only active managers and admins can update products';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
    into v_image_urls
  from jsonb_array_elements_text(coalesce(p_product -> 'image_urls', '[]'::jsonb)) value;

  if cardinality(v_image_urls) > 2 then
    raise exception 'A product can have a maximum of 2 images';
  end if;

  update public.products
  set
    name = trim(p_product ->> 'name'),
    sku = trim(p_product ->> 'sku'),
    price_kobo = (p_product ->> 'price_kobo')::bigint,
    cost_price_kobo = (p_product ->> 'cost_price_kobo')::bigint,
    minimum_selling_price_kobo = case
      when p_product ? 'minimum_selling_price_kobo'
        then nullif(p_product ->> 'minimum_selling_price_kobo', '')::bigint
      else minimum_selling_price_kobo
    end,
    active = coalesce((p_product ->> 'active')::boolean, true),
    description = nullif(trim(coalesce(p_product ->> 'description', '')), ''),
    image_url = v_image_urls[1],
    image_urls = v_image_urls,
    online_published = coalesce((p_product ->> 'online_published')::boolean, false),
    is_featured = coalesce((p_product ->> 'is_featured')::boolean, false),
    published_at = case
      when coalesce((p_product ->> 'online_published')::boolean, false) and not online_published
        then now()
      else published_at
    end,
    updated_at = now()
  where id = p_product_id;

  if not found then
    raise exception 'Product update could not be saved';
  end if;
end;
$$;

grant execute on function public.update_product_details(uuid, jsonb) to authenticated;
