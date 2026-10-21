create or replace function public.save_current_storefront(p_storefront jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_slug text := lower(trim(coalesce(p_storefront->>'slug', '')));
  v_template_key text := coalesce(nullif(trim(p_storefront->>'template_key'), ''), 'classic_retail');
  v_primary_color text := coalesce(nullif(trim(p_storefront->>'primary_color'), ''), '#0B1121');
  v_hero_image_urls text[] := array(select jsonb_array_elements_text(coalesce(p_storefront->'hero_image_urls', '[]'::jsonb)));
  v_hero_image_captions text[] := array(select nullif(trim(value), '') from jsonb_array_elements_text(coalesce(p_storefront->'hero_image_captions', '[]'::jsonb)) value);
  v_trust_stats jsonb := coalesce(p_storefront->'trust_stats', '[]'::jsonb);
  v_business_hours jsonb := coalesce(p_storefront->'business_hours', '[]'::jsonb);
  v_social_links jsonb := coalesce(p_storefront->'social_links', '{}'::jsonb);
begin
  select p.store_id, p.role into v_store_id, v_role from public.profiles p where p.id = auth.uid();
  if v_store_id is null or v_role <> 'admin' then raise exception 'Only administrators can update the online storefront'; end if;
  if v_slug !~ '^[a-z0-9-]{3,80}$' then raise exception 'Store URL must use 3–80 lowercase letters, numbers, or hyphens'; end if;
  if v_template_key not in ('classic_retail', 'modern_catalogue', 'premium_brand') then raise exception 'Invalid storefront template'; end if;
  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Primary colour must be a six-digit hex value'; end if;
  if cardinality(v_hero_image_urls) > 2 or cardinality(v_hero_image_captions) > 2 then raise exception 'A maximum of two hero images and captions is allowed'; end if;
  if cardinality(v_hero_image_captions) > cardinality(v_hero_image_urls) then raise exception 'Each hero caption must belong to an uploaded hero image'; end if;
  if jsonb_typeof(v_trust_stats) <> 'array' or jsonb_array_length(v_trust_stats) > 4 then raise exception 'A maximum of four trust statistics is allowed'; end if;
  if jsonb_typeof(v_business_hours) <> 'array' or jsonb_array_length(v_business_hours) > 7 then raise exception 'Business hours must contain at most seven days'; end if;
  if jsonb_typeof(v_social_links) <> 'object' then raise exception 'Social links must be an object'; end if;

  insert into public.storefronts (
    store_id, slug, enabled, template_key, headline, description, phone, whatsapp, address,
    primary_color, hero_image_urls, hero_image_captions, hero_background_url, logo_url, vision, mission,
    trust_stats, business_hours, map_url, social_links, seo_title, seo_description, social_image_url, updated_at
  ) values (
    v_store_id, v_slug, coalesce((p_storefront->>'enabled')::boolean, false), v_template_key,
    nullif(trim(p_storefront->>'headline'), ''), nullif(trim(p_storefront->>'description'), ''),
    nullif(trim(p_storefront->>'phone'), ''), nullif(trim(p_storefront->>'whatsapp'), ''), nullif(trim(p_storefront->>'address'), ''),
    v_primary_color, v_hero_image_urls, v_hero_image_captions, nullif(trim(p_storefront->>'hero_background_url'), ''),
    nullif(trim(p_storefront->>'logo_url'), ''), nullif(trim(p_storefront->>'vision'), ''), nullif(trim(p_storefront->>'mission'), ''),
    v_trust_stats, v_business_hours, nullif(trim(p_storefront->>'map_url'), ''), v_social_links,
    nullif(trim(p_storefront->>'seo_title'), ''), nullif(trim(p_storefront->>'seo_description'), ''),
    nullif(trim(p_storefront->>'social_image_url'), ''), now()
  ) on conflict (store_id) do update set
    slug = excluded.slug, enabled = excluded.enabled, template_key = excluded.template_key,
    headline = excluded.headline, description = excluded.description, phone = excluded.phone,
    whatsapp = excluded.whatsapp, address = excluded.address, primary_color = excluded.primary_color,
    hero_image_urls = excluded.hero_image_urls, hero_image_captions = excluded.hero_image_captions,
    hero_background_url = excluded.hero_background_url, logo_url = excluded.logo_url,
    vision = excluded.vision, mission = excluded.mission, trust_stats = excluded.trust_stats,
    business_hours = excluded.business_hours, map_url = excluded.map_url, social_links = excluded.social_links,
    seo_title = excluded.seo_title, seo_description = excluded.seo_description, social_image_url = excluded.social_image_url,
    updated_at = now();
end;
$$;

grant execute on function public.save_current_storefront(jsonb) to authenticated;
