-- Make inventory access failures diagnosable and ensure authenticated staff can call the RPC.
create or replace function public.adjust_stock(p_product_id uuid, p_quantity_delta integer, p_reason text, p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if auth.uid() is null then raise exception 'Inventory request has no authenticated user session'; end if;
  if current_store is null then raise exception 'Active staff account has no store assigned'; end if;
  if current_role not in ('admin', 'manager') then raise exception 'Inventory access requires admin or manager; active role is %', coalesce(current_role::text, 'none'); end if;
  if exists (select 1 from public.stock_movements where client_operation_id = p_operation_id) then return; end if;
  update public.products set stock_quantity = stock_quantity + p_quantity_delta, updated_at = now()
  where id = p_product_id and store_id = current_store and stock_quantity + p_quantity_delta >= 0;
  if not found then raise exception 'Product not found in the active store or adjustment would make stock negative'; end if;
  insert into public.stock_movements (store_id, product_id, quantity_delta, reason, client_operation_id)
  values (current_store, p_product_id, p_quantity_delta, p_reason, p_operation_id);
end $$;

grant execute on function public.adjust_stock(uuid, integer, text, uuid) to authenticated;
