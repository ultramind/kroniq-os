-- Growth and higher tenants may use a custom storefront logo.
alter table public.storefronts add column if not exists logo_url text;

create or replace function public.can_use_storefront_logo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    join public.organization_subscriptions sub on sub.organization_id = s.organization_id
    where p.id = auth.uid()
      and p.role = 'admin'
      and sub.plan_code in ('growth', 'business', 'enterprise')
      and sub.status in ('trial', 'active')
  );
$$;

create or replace function public.enforce_storefront_logo_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.logo_url is not null and not public.can_use_storefront_logo() then
    raise exception 'A Growth plan or higher is required for a storefront logo';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_storefront_logo_entitlement on public.storefronts;
create trigger enforce_storefront_logo_entitlement before insert or update of logo_url on public.storefronts
for each row execute function public.enforce_storefront_logo_entitlement();

-- Keep hero images available to all storefront plans, but reserve the /logo path for Growth+.
drop policy if exists "storefront image upload by store" on storage.objects;
drop policy if exists "storefront image update by store" on storage.objects;
drop policy if exists "storefront image delete by store" on storage.objects;
create policy "storefront image upload by store" on storage.objects for insert to authenticated
with check (
  bucket_id = 'storefront-images'
  and (storage.foldername(name))[1] = public.current_store_id()::text
  and ((storage.foldername(name))[2] <> 'logo' or public.can_use_storefront_logo())
);
create policy "storefront image update by store" on storage.objects for update to authenticated
using (bucket_id = 'storefront-images' and (storage.foldername(name))[1] = public.current_store_id()::text)
with check (
  bucket_id = 'storefront-images'
  and (storage.foldername(name))[1] = public.current_store_id()::text
  and ((storage.foldername(name))[2] <> 'logo' or public.can_use_storefront_logo())
);
create policy "storefront image delete by store" on storage.objects for delete to authenticated
using (
  bucket_id = 'storefront-images'
  and (storage.foldername(name))[1] = public.current_store_id()::text
  and ((storage.foldername(name))[2] <> 'logo' or public.can_use_storefront_logo())
);

create policy "store admins update own store" on public.stores for update to authenticated
using (id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text)
language sql stable security definer set search_path = public as $$
  select s.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url
  from public.storefronts f join public.stores s on s.id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active'
$$;
grant execute on function public.public_storefront(text) to anon, authenticated;
