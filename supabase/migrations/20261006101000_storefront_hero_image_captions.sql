-- Two hero slides can carry their own optional captions on the public storefront.
alter table public.storefronts
  add column if not exists hero_image_captions text[] not null default '{}';

alter table public.storefronts
  drop constraint if exists storefronts_hero_image_captions_max_two;
alter table public.storefronts
  add constraint storefronts_hero_image_captions_max_two
  check (cardinality(hero_image_captions) <= 2);

create or replace function public.save_current_storefront(p_storefront jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_slug text := lower(trim(coalesce(p_storefront->>'slug', '')));
  v_template_key text := coalesce(nullif(trim(p_storefront->>'template_key'), ''), 'classic_retail');
  v_primary_color text := coalesce(nullif(trim(p_storefront->>'primary_color'), ''), '#0B1121');
  v_hero_image_urls text[] := array(
    select jsonb_array_elements_text(coalesce(p_storefront->'hero_image_urls', '[]'::jsonb))
  );
  v_hero_image_captions text[] := array(
    select nullif(trim(value), '')
    from jsonb_array_elements_text(coalesce(p_storefront->'hero_image_captions', '[]'::jsonb)) value
  );
  v_trust_stats jsonb := coalesce(p_storefront->'trust_stats', '[]'::jsonb);
begin
  select p.store_id, p.role
    into v_store_id, v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_store_id is null or v_role <> 'admin' then
    raise exception 'Only administrators can update the online storefront';
  end if;
  if v_slug !~ '^[a-z0-9-]{3,80}$' then
    raise exception 'Store URL must use 3–80 lowercase letters, numbers, or hyphens';
  end if;
  if v_template_key not in ('classic_retail', 'modern_catalogue', 'premium_brand') then
    raise exception 'Invalid storefront template';
  end if;
  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary colour must be a six-digit hex value';
  end if;
  if cardinality(v_hero_image_urls) > 2 or cardinality(v_hero_image_captions) > 2 then
    raise exception 'A maximum of two hero images and captions is allowed';
  end if;
  if cardinality(v_hero_image_captions) > cardinality(v_hero_image_urls) then
    raise exception 'Each hero caption must belong to an uploaded hero image';
  end if;
  if jsonb_typeof(v_trust_stats) <> 'array' or jsonb_array_length(v_trust_stats) > 4 then
    raise exception 'A maximum of four trust statistics is allowed';
  end if;

  insert into public.storefronts (
    store_id, slug, enabled, template_key, headline, description, phone, whatsapp, address,
    primary_color, hero_image_urls, hero_image_captions, logo_url, vision, mission, trust_stats, updated_at
  )
  values (
    v_store_id, v_slug, coalesce((p_storefront->>'enabled')::boolean, false), v_template_key,
    nullif(trim(p_storefront->>'headline'), ''), nullif(trim(p_storefront->>'description'), ''),
    nullif(trim(p_storefront->>'phone'), ''), nullif(trim(p_storefront->>'whatsapp'), ''),
    nullif(trim(p_storefront->>'address'), ''), v_primary_color, v_hero_image_urls,
    v_hero_image_captions, nullif(trim(p_storefront->>'logo_url'), ''),
    nullif(trim(p_storefront->>'vision'), ''), nullif(trim(p_storefront->>'mission'), ''),
    v_trust_stats, now()
  )
  on conflict (store_id) do update set
    slug = excluded.slug,
    enabled = excluded.enabled,
    template_key = excluded.template_key,
    headline = excluded.headline,
    description = excluded.description,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    address = excluded.address,
    primary_color = excluded.primary_color,
    hero_image_urls = excluded.hero_image_urls,
    hero_image_captions = excluded.hero_image_captions,
    logo_url = excluded.logo_url,
    vision = excluded.vision,
    mission = excluded.mission,
    trust_stats = excluded.trust_stats,
    updated_at = now();
end;
$$;

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(
  store_name text,
  slug text,
  headline text,
  description text,
  phone text,
  whatsapp text,
  address text,
  primary_color text,
  hero_image_urls text[],
  hero_image_captions text[],
  logo_url text,
  vision text,
  mission text,
  trust_stats jsonb,
  template_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address,
    f.primary_color, f.hero_image_urls, f.hero_image_captions, f.logo_url, f.vision,
    f.mission, f.trust_stats, f.template_key
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and public.organization_has_entitlement(o.id, 'online_storefront')
$$;

grant execute on function public.save_current_storefront(jsonb) to authenticated;
grant execute on function public.public_storefront(text) to anon, authenticated;
