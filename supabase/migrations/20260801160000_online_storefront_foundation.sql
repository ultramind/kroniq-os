-- Public storefront foundation. Products remain private unless explicitly published.
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists online_published boolean not null default false;

create table public.storefronts (
  store_id uuid primary key references public.stores(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  enabled boolean not null default false,
  headline text,
  description text,
  phone text,
  whatsapp text,
  address text,
  updated_at timestamptz not null default now()
);
alter table public.storefronts enable row level security;
create policy "store admins manage storefront" on public.storefronts for all using (store_id = public.current_store_id() and exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (store_id = public.current_store_id() and exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create or replace function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text)
language sql stable security definer set search_path = public as $$
  select s.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address
  from public.storefronts f join public.stores s on s.id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active'
$$;

create or replace function public.public_storefront_products(p_slug text)
returns table(id uuid, name text, description text, image_url text, price_kobo bigint, category text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.price_kobo, c.name
  from public.storefronts f join public.products p on p.store_id = f.store_id left join public.categories c on c.id = p.category_id
  where f.enabled and f.slug = lower(trim(p_slug)) and p.active and p.online_published and p.stock_quantity > 0
  order by p.name
$$;
grant execute on function public.public_storefront(text) to anon, authenticated;
grant execute on function public.public_storefront_products(text) to anon, authenticated;
