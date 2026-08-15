-- A tenant's public storefront is branded with the company name, not a branch name.
-- These idempotent columns keep this migration safe when SQL is applied manually.
alter table public.storefronts add column if not exists primary_color text not null default '#0B1121';
alter table public.storefronts add column if not exists hero_image_urls text[] not null default '{}';
alter table public.storefronts add column if not exists logo_url text;

create or replace function public.update_current_organization_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only administrators can update the company name';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'Company name must contain at least two characters';
  end if;
  update public.organizations set name = trim(p_name) where id = public.current_organization_id();
  if not found then raise exception 'Organization not found'; end if;
end;
$$;
grant execute on function public.update_current_organization_name(text) to authenticated;

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
$$;
grant execute on function public.public_storefront(text) to anon, authenticated;
