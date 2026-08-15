-- Keep a small product gallery without giving tenants an unbounded storage surface.
alter table public.products add column if not exists image_urls text[] not null default '{}';

update public.products
set image_urls = case when image_url is not null and cardinality(image_urls) = 0 then array[image_url] else image_urls end;

alter table public.products drop constraint if exists products_image_urls_max_two;
alter table public.products add constraint products_image_urls_max_two check (cardinality(image_urls) <= 2);

drop function if exists public.public_storefront_products(text);
create function public.public_storefront_products(p_slug text)
returns table(id uuid, name text, description text, image_url text, image_urls text[], price_kobo bigint, category text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.image_urls, p.price_kobo, c.name
  from public.storefronts sf
  join public.products p on p.store_id = sf.store_id
  left join public.categories c on c.id = p.category_id
  where sf.slug = p_slug and sf.enabled = true and p.active = true and p.online_published = true
  order by p.name;
$$;

grant execute on function public.public_storefront_products(text) to anon, authenticated;
