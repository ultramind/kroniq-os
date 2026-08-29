-- Keep financial and inventory history intact by default. Products with history
-- can be archived; permanent deletion is limited to unused catalogue mistakes.
create or replace function public.manage_product_lifecycle(
  p_product_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Product lifecycle changes require an authenticated user session';
  end if;
  if p_action not in ('archive', 'restore', 'delete') then
    raise exception 'Unsupported product action';
  end if;

  select product.store_id into v_store_id
  from public.products product
  where product.id = p_product_id;
  if v_store_id is null then
    raise exception 'Product not found';
  end if;

  select membership.role into v_role
  from public.organization_memberships membership
  join public.stores store on store.organization_id = membership.organization_id
  where store.id = v_store_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Only active managers and admins can manage products';
  end if;

  if p_action = 'archive' then
    update public.products
    set active = false, online_published = false, updated_at = now()
    where id = p_product_id;
    return;
  end if;

  if p_action = 'restore' then
    update public.products
    set active = true, updated_at = now()
    where id = p_product_id;
    return;
  end if;

  if v_role <> 'admin' then
    raise exception 'Only active admins can permanently delete products';
  end if;
  if exists (select 1 from public.sale_items where product_id = p_product_id)
    or exists (select 1 from public.stock_movements where product_id = p_product_id)
    or exists (select 1 from public.supplier_deliveries where product_id = p_product_id)
    or exists (select 1 from public.product_price_history where product_id = p_product_id)
    or exists (select 1 from public.inventory_transfers where product_id = p_product_id) then
    raise exception 'This product has sales or inventory history and cannot be deleted. Archive it instead.';
  end if;
  if exists (
    select 1 from public.inventory_location_balances
    where product_id = p_product_id and quantity <> 0
  ) then
    raise exception 'Move or count this product stock to zero before deleting it.';
  end if;

  delete from public.products where id = p_product_id;
end;
$$;

grant execute on function public.manage_product_lifecycle(uuid, text) to authenticated;
