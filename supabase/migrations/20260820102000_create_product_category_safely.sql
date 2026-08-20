-- Create or reuse a category inside the active workspace. This avoids the
-- client-side category upsert failing under RLS before a product is created.
create or replace function public.get_or_create_current_category(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_category_id uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select store_id into v_store_id from public.profiles where id = auth.uid();
  if v_store_id is null or not public.has_active_store_membership(v_store_id, array['admin', 'manager']) then
    raise exception 'Only managers and admins can create product categories';
  end if;
  if v_name = '' then
    raise exception 'A product category is required';
  end if;

  insert into public.categories (store_id, name)
  values (v_store_id, v_name)
  on conflict (store_id, name) do update set name = excluded.name
  returning id into v_category_id;

  return v_category_id;
end;
$$;

grant execute on function public.get_or_create_current_category(text) to authenticated;
