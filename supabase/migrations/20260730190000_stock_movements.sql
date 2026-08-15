-- Inventory is changed through auditable movements, never by replacing a stock total.
alter table public.stock_movements add column if not exists client_operation_id uuid unique;
alter table public.stock_movements enable row level security;

create policy "staff see own store movements" on public.stock_movements for select using (store_id = public.current_store_id());
create policy "managers create own store movements" on public.stock_movements for insert with check (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager')));

create or replace function public.adjust_stock(p_product_id uuid, p_quantity_delta integer, p_reason text, p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null or current_role not in ('admin', 'manager') then raise exception 'Not permitted'; end if;
  if exists (select 1 from public.stock_movements where client_operation_id = p_operation_id) then return; end if;
  update public.products set stock_quantity = stock_quantity + p_quantity_delta, updated_at = now() where id = p_product_id and store_id = current_store and stock_quantity + p_quantity_delta >= 0;
  if not found then raise exception 'Product not found or adjustment would make stock negative'; end if;
  insert into public.stock_movements (store_id, product_id, quantity_delta, reason, client_operation_id) values (current_store, p_product_id, p_quantity_delta, p_reason, p_operation_id);
end $$;
