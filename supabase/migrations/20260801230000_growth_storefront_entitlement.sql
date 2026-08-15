-- The public online storefront is a Growth-and-higher entitlement.
create or replace function public.can_use_online_storefront()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.stores s on s.id = p.store_id
    join public.organization_subscriptions sub on sub.organization_id = s.organization_id
    where p.id = auth.uid()
      and p.role = 'admin'
      and sub.plan_code in ('growth', 'business', 'enterprise')
      and sub.status in ('trial', 'active')
  );
$$;

create or replace function public.enforce_online_storefront_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.enabled and not public.can_use_online_storefront() then
    raise exception 'A Growth plan or higher is required to publish an online storefront';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_online_storefront_entitlement on public.storefronts;
create trigger enforce_online_storefront_entitlement before insert or update of enabled on public.storefronts
for each row execute function public.enforce_online_storefront_entitlement();

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text, vision text, mission text, trust_stats jsonb)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url, f.vision, f.mission, f.trust_stats
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.organization_subscriptions sub on sub.organization_id = o.id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and sub.plan_code in ('growth', 'business', 'enterprise') and sub.status in ('trial', 'active')
$$;

drop function if exists public.public_storefront_products(text);
create function public.public_storefront_products(p_slug text)
returns table(id uuid, name text, description text, image_url text, image_urls text[], price_kobo bigint, category text, is_featured boolean, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.image_urls, p.price_kobo, c.name, p.is_featured, p.published_at
  from public.storefronts f join public.stores s on s.id = f.store_id join public.organization_subscriptions sub on sub.organization_id = s.organization_id join public.products p on p.store_id = f.store_id left join public.categories c on c.id = p.category_id
  where f.enabled and f.slug = lower(trim(p_slug)) and p.active and p.online_published and p.stock_quantity > 0
    and sub.plan_code in ('growth', 'business', 'enterprise') and sub.status in ('trial', 'active')
  order by p.published_at desc nulls last, p.name
$$;

create or replace function public.public_storefront_sections(p_slug text)
returns table(id uuid, section_type text, title text, body text, image_url text, cta_label text, cta_url text, display_position integer)
language sql stable security definer set search_path = public as $$
  select sec.id, sec.section_type, sec.title, sec.body, sec.image_url, sec.cta_label, sec.cta_url, sec.position as display_position
  from public.storefronts f join public.stores s on s.id = f.store_id join public.organization_subscriptions sub on sub.organization_id = s.organization_id join public.storefront_sections sec on sec.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and sec.visible
    and sub.plan_code in ('growth', 'business', 'enterprise') and sub.status in ('trial', 'active')
  order by sec.position, sec.created_at
$$;

create or replace function public.public_storefront_testimonials(p_slug text)
returns table(id uuid, customer_name text, customer_title text, quote text, rating smallint, photo_url text, verified boolean, display_position integer)
language sql stable security definer set search_path = public as $$
  select t.id, t.customer_name, t.customer_title, t.quote, t.rating, t.photo_url, t.verified, t.position as display_position
  from public.storefronts f join public.stores s on s.id = f.store_id join public.organization_subscriptions sub on sub.organization_id = s.organization_id join public.storefront_testimonials t on t.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and t.published
    and sub.plan_code in ('growth', 'business', 'enterprise') and sub.status in ('trial', 'active')
  order by t.position, t.created_at desc
$$;

grant execute on function public.public_storefront(text) to anon, authenticated;
grant execute on function public.public_storefront_products(text) to anon, authenticated;
grant execute on function public.public_storefront_sections(text) to anon, authenticated;
grant execute on function public.public_storefront_testimonials(text) to anon, authenticated;
