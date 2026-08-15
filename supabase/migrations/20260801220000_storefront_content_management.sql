-- Structured public-storefront content: intentionally flexible, without an unbounded page builder.
alter table public.products add column if not exists is_featured boolean not null default false;
alter table public.products add column if not exists published_at timestamptz;
update public.products set published_at = coalesce(published_at, now()) where online_published and published_at is null;

alter table public.storefronts add column if not exists vision text;
alter table public.storefronts add column if not exists mission text;
alter table public.storefronts add column if not exists trust_stats jsonb not null default '[]'::jsonb;
alter table public.storefronts drop constraint if exists storefronts_trust_stats_array;
alter table public.storefronts add constraint storefronts_trust_stats_array check (jsonb_typeof(trust_stats) = 'array' and jsonb_array_length(trust_stats) <= 4);

create table if not exists public.storefront_sections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  section_type text not null check (section_type in ('text', 'banner', 'collection', 'testimonials')),
  title text not null,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  position integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists storefront_sections_store_position_idx on public.storefront_sections(store_id, position);
alter table public.storefront_sections enable row level security;
drop policy if exists "store admins manage storefront sections" on public.storefront_sections;
create policy "store admins manage storefront sections" on public.storefront_sections for all to authenticated
using (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create table if not exists public.storefront_testimonials (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text not null,
  customer_title text,
  quote text not null,
  rating smallint not null default 5 check (rating between 1 and 5),
  photo_url text,
  verified boolean not null default false,
  published boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists storefront_testimonials_store_position_idx on public.storefront_testimonials(store_id, position);
alter table public.storefront_testimonials enable row level security;
drop policy if exists "store admins manage storefront testimonials" on public.storefront_testimonials;
create policy "store admins manage storefront testimonials" on public.storefront_testimonials for all to authenticated
using (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text, vision text, mission text, trust_stats jsonb)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url, f.vision, f.mission, f.trust_stats
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
$$;

drop function if exists public.public_storefront_products(text);
create function public.public_storefront_products(p_slug text)
returns table(id uuid, name text, description text, image_url text, image_urls text[], price_kobo bigint, category text, is_featured boolean, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.image_urls, p.price_kobo, c.name, p.is_featured, p.published_at
  from public.storefronts f
  join public.products p on p.store_id = f.store_id
  left join public.categories c on c.id = p.category_id
  where f.enabled and f.slug = lower(trim(p_slug)) and p.active and p.online_published and p.stock_quantity > 0
  order by p.published_at desc nulls last, p.name
$$;

create or replace function public.public_storefront_sections(p_slug text)
returns table(id uuid, section_type text, title text, body text, image_url text, cta_label text, cta_url text, display_position integer)
language sql stable security definer set search_path = public as $$
  select sec.id, sec.section_type, sec.title, sec.body, sec.image_url, sec.cta_label, sec.cta_url, sec.position as display_position
  from public.storefronts f join public.storefront_sections sec on sec.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and sec.visible
  order by sec.position, sec.created_at
$$;

create or replace function public.public_storefront_testimonials(p_slug text)
returns table(id uuid, customer_name text, customer_title text, quote text, rating smallint, photo_url text, verified boolean, display_position integer)
language sql stable security definer set search_path = public as $$
  select t.id, t.customer_name, t.customer_title, t.quote, t.rating, t.photo_url, t.verified, t.position as display_position
  from public.storefronts f join public.storefront_testimonials t on t.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and t.published
  order by t.position, t.created_at desc
$$;

grant execute on function public.public_storefront(text) to anon, authenticated;
grant execute on function public.public_storefront_products(text) to anon, authenticated;
grant execute on function public.public_storefront_sections(text) to anon, authenticated;
grant execute on function public.public_storefront_testimonials(text) to anon, authenticated;
