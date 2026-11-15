-- Store-wide default for new products, with an explicit bulk update for the
-- current catalogue. Per-product values can still be customised afterwards.
alter table public.stores
  add column if not exists default_low_stock_threshold integer not null default 10
  check (default_low_stock_threshold >= 0);

create or replace function public.update_current_store_low_stock_settings(
  p_threshold integer,
  p_apply_to_existing boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required';
  end if;
  if p_threshold is null or p_threshold < 0 then
    raise exception 'Low-stock alert quantity cannot be negative';
  end if;

  select profile.store_id, membership.role
    into v_store_id, v_role
  from public.profiles profile
  join public.stores store on store.id = profile.store_id
  join public.organization_memberships membership
    on membership.organization_id = store.organization_id
   and membership.user_id = auth.uid()
   and membership.status = 'active'
  where profile.id = auth.uid();

  if v_store_id is null or v_role not in ('admin', 'manager') then
    raise exception 'Only active managers and admins can update stock alert settings';
  end if;

  update public.stores
  set default_low_stock_threshold = p_threshold
  where id = v_store_id;

  if p_apply_to_existing then
    update public.products
    set low_stock_threshold = p_threshold,
        updated_at = now()
    where store_id = v_store_id;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;

grant execute on function public.update_current_store_low_stock_settings(integer, boolean) to authenticated;
