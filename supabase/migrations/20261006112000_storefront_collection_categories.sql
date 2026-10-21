-- Let tenants build a collection from one published product category.
alter table public.storefront_sections
  add column if not exists collection_category text;

drop function if exists public.public_storefront_sections(text);
create function public.public_storefront_sections(p_slug text)
returns table(
  id uuid, section_type text, title text, body text, image_url text, cta_label text, cta_url text,
  collection_category text, display_position integer
)
language sql stable security definer set search_path = public as $$
  select sec.id, sec.section_type, sec.title, sec.body, sec.image_url, sec.cta_label, sec.cta_url,
    sec.collection_category, sec.position
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.storefront_sections sec on sec.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and sec.visible
    and public.organization_has_entitlement(o.id, 'online_storefront')
  order by sec.position, sec.created_at
$$;

grant execute on function public.public_storefront_sections(text) to anon, authenticated;
