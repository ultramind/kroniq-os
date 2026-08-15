-- Tenant-controlled storefront branding with a deliberately small hero gallery.
alter table public.storefronts add column if not exists primary_color text not null default '#0B1121';
alter table public.storefronts add column if not exists hero_image_urls text[] not null default '{}';
alter table public.storefronts drop constraint if exists storefronts_primary_color_hex;
alter table public.storefronts add constraint storefronts_primary_color_hex check (primary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.storefronts drop constraint if exists storefronts_hero_images_max_two;
alter table public.storefronts add constraint storefronts_hero_images_max_two check (cardinality(hero_image_urls) <= 2);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront-images', 'storefront-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "storefront image upload by store" on storage.objects for insert to authenticated
with check (bucket_id = 'storefront-images' and (storage.foldername(name))[1] = public.current_store_id()::text);
create policy "storefront image update by store" on storage.objects for update to authenticated
using (bucket_id = 'storefront-images' and (storage.foldername(name))[1] = public.current_store_id()::text)
with check (bucket_id = 'storefront-images' and (storage.foldername(name))[1] = public.current_store_id()::text);
create policy "storefront image delete by store" on storage.objects for delete to authenticated
using (bucket_id = 'storefront-images' and (storage.foldername(name))[1] = public.current_store_id()::text);

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[])
language sql stable security definer set search_path = public as $$
  select s.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls
  from public.storefronts f join public.stores s on s.id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active'
$$;
grant execute on function public.public_storefront(text) to anon, authenticated;
