-- Publish a whole active catalogue with one online-first, entitlement-aware action.
create or replace function public.publish_all_current_store_products()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_organization_id uuid;
  v_role public.app_role;
  v_published_count integer;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required';
  end if;

  select profile.store_id, store.organization_id, profile.role
    into v_store_id, v_organization_id, v_role
  from public.profiles profile
  join public.stores store on store.id = profile.store_id
  where profile.id = auth.uid();

  if v_store_id is null or v_role not in ('admin', 'manager') then
    raise exception 'Only managers and administrators can publish products';
  end if;
  if not public.organization_has_entitlement(v_organization_id, 'online_storefront') then
    raise exception 'An online storefront plan is required to publish products';
  end if;

  update public.products
  set
    online_published = true,
    published_at = coalesce(published_at, now()),
    updated_at = now()
  where store_id = v_store_id
    and active
    and not online_published;

  get diagnostics v_published_count = row_count;
  return v_published_count;
end;
$$;

grant execute on function public.publish_all_current_store_products() to authenticated;
