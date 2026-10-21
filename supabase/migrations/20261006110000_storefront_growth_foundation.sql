-- Lead capture, public business details, SEO metadata, and lightweight storefront analytics.
alter table public.storefronts
  add column if not exists business_hours jsonb not null default '[]'::jsonb,
  add column if not exists map_url text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists social_image_url text;

create table if not exists public.storefront_leads (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  message text,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists storefront_leads_store_created_idx on public.storefront_leads(store_id, created_at desc);
alter table public.storefront_leads enable row level security;
drop policy if exists "active admins manage storefront leads" on public.storefront_leads;
create policy "active admins manage storefront leads" on public.storefront_leads for all to authenticated
using (public.has_active_store_membership(store_id, array['admin']))
with check (public.has_active_store_membership(store_id, array['admin']));

create table if not exists public.storefront_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'product_view', 'whatsapp_click', 'contact_submit')),
  product_id uuid references public.products(id) on delete set null,
  path text,
  created_at timestamptz not null default now()
);
create index if not exists storefront_events_store_created_idx on public.storefront_events(store_id, created_at desc);
alter table public.storefront_events enable row level security;
drop policy if exists "active admins view storefront events" on public.storefront_events;
create policy "active admins view storefront events" on public.storefront_events for select to authenticated
using (public.has_active_store_membership(store_id, array['admin']));

create or replace function public.submit_storefront_lead(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_message text default null,
  p_product_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_lead_id uuid;
begin
  select f.store_id into v_store_id
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and public.organization_has_entitlement(o.id, 'online_storefront');
  if v_store_id is null then raise exception 'Storefront is unavailable'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 then raise exception 'Enter a valid phone number'; end if;
  if p_product_id is not null and not exists (select 1 from public.products where id = p_product_id and store_id = v_store_id) then
    raise exception 'Product is unavailable';
  end if;
  insert into public.storefront_leads(store_id, name, phone, email, message, product_id)
  values (v_store_id, trim(p_name), trim(p_phone), nullif(trim(p_email), ''), nullif(trim(p_message), ''), p_product_id)
  returning id into v_lead_id;
  insert into public.storefront_events(store_id, event_type, product_id, path)
  values (v_store_id, 'contact_submit', p_product_id, '/contact');
  return v_lead_id;
end;
$$;

create or replace function public.record_storefront_event(
  p_slug text,
  p_event_type text,
  p_product_id uuid default null,
  p_path text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_store_id uuid;
begin
  if p_event_type not in ('page_view', 'product_view', 'whatsapp_click') then return; end if;
  select f.store_id into v_store_id
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and public.organization_has_entitlement(o.id, 'online_storefront');
  if v_store_id is not null then
    insert into public.storefront_events(store_id, event_type, product_id, path)
    values (v_store_id, p_event_type, p_product_id, left(coalesce(p_path, ''), 200));
  end if;
end;
$$;

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(
  store_name text, slug text, headline text, description text, phone text, whatsapp text,
  address text, primary_color text, hero_image_urls text[], hero_image_captions text[],
  hero_background_url text, logo_url text, vision text, mission text, trust_stats jsonb, template_key text,
  business_hours jsonb, map_url text, social_links jsonb, seo_title text, seo_description text, social_image_url text
)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address,
    f.primary_color, f.hero_image_urls, f.hero_image_captions, f.hero_background_url,
    f.logo_url, f.vision, f.mission, f.trust_stats, f.template_key, f.business_hours,
    f.map_url, f.social_links, f.seo_title, f.seo_description, f.social_image_url
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and public.organization_has_entitlement(o.id, 'online_storefront')
$$;

grant execute on function public.submit_storefront_lead(text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.record_storefront_event(text, text, uuid, text) to anon, authenticated;
grant execute on function public.public_storefront(text) to anon, authenticated;
