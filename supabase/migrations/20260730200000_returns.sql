-- Preserve completed sales and record returns separately for auditability.
alter table public.sales add column if not exists returned_at timestamptz;
alter table public.sales add column if not exists returned_by uuid references public.profiles;
create table if not exists public.sale_returns (id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales, operation_id uuid not null unique, returned_by uuid not null references public.profiles, returned_at timestamptz not null default now());
alter table public.sale_returns enable row level security;
create policy "staff see own store returns" on public.sale_returns for select using (exists (select 1 from public.sales where id = sale_id and store_id = public.current_store_id()));

create or replace function public.return_sale(p_sale_id uuid, p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role; item record;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null or current_role not in ('admin', 'manager') then raise exception 'Not permitted'; end if;
  if exists (select 1 from public.sale_returns where operation_id = p_operation_id) then return; end if;
  if exists (select 1 from public.sales where id = p_sale_id and returned_at is not null) then raise exception 'Sale was already returned'; end if;
  if not exists (select 1 from public.sales where id = p_sale_id and store_id = current_store) then raise exception 'Sale not found'; end if;
  for item in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
    update public.products set stock_quantity = stock_quantity + item.quantity, updated_at = now() where id = item.product_id and store_id = current_store;
    insert into public.stock_movements (store_id, product_id, quantity_delta, reason) values (current_store, item.product_id, item.quantity, 'sale_return');
  end loop;
  update public.sales set returned_at = now(), returned_by = auth.uid() where id = p_sale_id;
  insert into public.sale_returns (sale_id, operation_id, returned_by) values (p_sale_id, p_operation_id, auth.uid());
end $$;
