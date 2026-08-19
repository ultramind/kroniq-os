-- Inventory actions are online-first. Resolve the product's real store and
-- authorise the caller through an active organisation membership, rather than
-- relying on a profile store pointer that can lag after workspace switching.
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Inventory request has no authenticated user session'; end if;
  if p_quantity_delta = 0 then raise exception 'Enter a stock quantity greater than zero'; end if;
  if p_reason not in ('delivery', 'correction', 'damaged', 'stock_count') then raise exception 'Invalid stock adjustment reason'; end if;

  select store_id into v_store_id from public.products where id = p_product_id;
  if v_store_id is null then raise exception 'Product is unavailable in this workspace. Refresh inventory and try again.'; end if;

  select m.role into v_role
  from public.organization_memberships m
  join public.stores st on st.organization_id = m.organization_id
  where st.id = v_store_id and m.user_id = auth.uid() and m.status = 'active';
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Inventory access requires an active admin or manager role';
  end if;

  if exists (select 1 from public.stock_movements where client_operation_id = p_operation_id) then return; end if;

  update public.products
  set stock_quantity = stock_quantity + p_quantity_delta, updated_at = now()
  where id = p_product_id and stock_quantity + p_quantity_delta >= 0;
  if not found then raise exception 'This adjustment would make stock negative'; end if;

  insert into public.stock_movements (store_id, product_id, quantity_delta, reason, client_operation_id)
  values (v_store_id, p_product_id, p_quantity_delta, p_reason, p_operation_id);
end $$;

grant execute on function public.adjust_stock(uuid, integer, text, uuid) to authenticated;
