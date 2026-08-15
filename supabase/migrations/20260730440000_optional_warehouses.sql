-- Optional warehouses: every existing store receives one Shop floor location.
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores,
  name text not null, location_type text not null check (location_type in ('shop_floor', 'warehouse')),
  active boolean not null default true, created_at timestamptz not null default now(), unique(store_id, name)
);
create table public.inventory_location_balances (
  location_id uuid not null references public.inventory_locations on delete cascade, product_id uuid not null references public.products on delete cascade,
  quantity integer not null default 0 check (quantity >= 0), updated_at timestamptz not null default now(), primary key(location_id, product_id)
);
create table public.inventory_transfers (
  id uuid primary key, store_id uuid not null references public.stores, product_id uuid not null references public.products,
  from_location_id uuid not null references public.inventory_locations, to_location_id uuid not null references public.inventory_locations,
  quantity integer not null check (quantity > 0), note text, transferred_by uuid not null references public.profiles, transferred_at timestamptz not null default now()
);
alter table public.supplier_deliveries add column if not exists location_id uuid references public.inventory_locations;

insert into public.inventory_locations(store_id, name, location_type)
select id, 'Shop floor', 'shop_floor' from public.stores
on conflict(store_id, name) do nothing;
insert into public.inventory_location_balances(location_id, product_id, quantity)
select location.id, product.id, product.stock_quantity from public.products product join public.inventory_locations location on location.store_id = product.store_id and location.location_type = 'shop_floor'
on conflict(location_id, product_id) do nothing;
update public.supplier_deliveries delivery set location_id = location.id from public.inventory_locations location where location.store_id = delivery.store_id and location.location_type = 'shop_floor' and delivery.location_id is null;

alter table public.inventory_locations enable row level security;
alter table public.inventory_location_balances enable row level security;
alter table public.inventory_transfers enable row level security;
create policy "staff see store locations" on public.inventory_locations for select using (store_id = public.current_store_id());
create policy "staff see store location balances" on public.inventory_location_balances for select using (exists (select 1 from public.inventory_locations l where l.id = location_id and l.store_id = public.current_store_id()));
create policy "staff see store transfers" on public.inventory_transfers for select using (store_id = public.current_store_id());

create or replace function public.create_inventory_location(p_name text, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_store uuid; staff_role public.app_role; new_id uuid;
begin
  select store_id, role into current_store, staff_role from public.profiles where id = auth.uid();
  if current_store is null or staff_role not in ('admin', 'manager') then raise exception 'Only managers and admins can manage warehouses'; end if;
  if p_type <> 'warehouse' or coalesce(nullif(trim(p_name), ''), '') = '' then raise exception 'Enter a warehouse name'; end if;
  insert into public.inventory_locations(store_id, name, location_type) values (current_store, trim(p_name), p_type) returning id into new_id;
  return new_id;
end $$;

create or replace function public.transfer_inventory_stock(p_transfer jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; staff_role public.app_role; source_id uuid; destination_id uuid; product uuid; amount integer; source_type text; destination_type text;
begin
  select store_id, role into current_store, staff_role from public.profiles where id = auth.uid();
  if current_store is null or staff_role not in ('admin', 'manager') then raise exception 'Only managers and admins can transfer stock'; end if;
  source_id := (p_transfer->>'from_location_id')::uuid; destination_id := (p_transfer->>'to_location_id')::uuid; product := (p_transfer->>'product_id')::uuid; amount := (p_transfer->>'quantity')::int;
  if amount is null or amount < 1 or source_id = destination_id then raise exception 'Choose different locations and a valid quantity'; end if;
  select location_type into source_type from public.inventory_locations where id = source_id and store_id = current_store and active;
  select location_type into destination_type from public.inventory_locations where id = destination_id and store_id = current_store and active;
  if source_type is null or destination_type is null then raise exception 'Invalid inventory location'; end if;
  update public.inventory_location_balances set quantity = quantity - amount, updated_at = now() where location_id = source_id and product_id = product and quantity >= amount;
  if not found then raise exception 'Insufficient stock at the source location'; end if;
  insert into public.inventory_location_balances(location_id, product_id, quantity) values (destination_id, product, amount) on conflict(location_id, product_id) do update set quantity = inventory_location_balances.quantity + excluded.quantity, updated_at = now();
  if source_type = 'shop_floor' then update public.products set stock_quantity = stock_quantity - amount, updated_at = now() where id = product and store_id = current_store; end if;
  if destination_type = 'shop_floor' then update public.products set stock_quantity = stock_quantity + amount, updated_at = now() where id = product and store_id = current_store; end if;
  insert into public.inventory_transfers(id, store_id, product_id, from_location_id, to_location_id, quantity, note, transferred_by) values ((p_transfer->>'id')::uuid, current_store, product, source_id, destination_id, amount, nullif(p_transfer->>'note', ''), auth.uid());
end $$;

grant execute on function public.create_inventory_location(text, text) to authenticated;
grant execute on function public.transfer_inventory_stock(jsonb) to authenticated;
