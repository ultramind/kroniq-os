-- Presentation-only storefront templates. Product and content records remain shared.
alter table public.storefronts
  add column if not exists template_key text not null default 'classic_retail'
  check (template_key in ('classic_retail', 'modern_catalogue', 'premium_brand'));

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text, vision text, mission text, trust_stats jsonb, template_key text)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url, f.vision, f.mission, f.trust_stats, f.template_key
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.organization_subscriptions sub on sub.organization_id = o.id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and sub.plan_code in ('growth', 'business', 'enterprise') and sub.status in ('trial', 'active')
$$;
grant execute on function public.public_storefront(text) to anon, authenticated;
