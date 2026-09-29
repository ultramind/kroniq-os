-- A published catalogue item should remain visible even when its physical
-- stock is currently zero. Public visitors can still view it and contact the
-- business, while the UI receives a clear availability flag.
drop function if exists public.public_storefront_products(text);

create function public.public_storefront_products(p_slug text)
returns table(
  id uuid,
  name text,
  description text,
  image_url text,
  image_urls text[],
  price_kobo bigint,
  category text,
  is_featured boolean,
  published_at timestamptz,
  in_stock boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.description,
    p.image_url,
    p.image_urls,
    p.price_kobo,
    c.name,
    p.is_featured,
    p.published_at,
    p.stock_quantity > 0
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.products p on p.store_id = f.store_id
  left join public.categories c on c.id = p.category_id
  where f.enabled
    and f.slug = lower(trim(p_slug))
    and p.active
    and p.online_published
    and public.organization_has_entitlement(o.id, 'online_storefront')
  order by p.is_featured desc, p.published_at desc nulls last, p.name
$$;

grant execute on function public.public_storefront_products(text) to anon, authenticated;
