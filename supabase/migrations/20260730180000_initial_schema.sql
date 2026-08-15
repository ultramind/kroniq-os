-- Naira POS: single-store MVP. `store_id` is present throughout so branches can be enabled later.
create type public.app_role as enum ('admin', 'manager', 'cashier');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'mobile_money');

create table public.stores (id uuid primary key default gen_random_uuid(), name text not null, currency_code text not null default 'NGN', created_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users on delete cascade, store_id uuid references public.stores not null, full_name text not null, role public.app_role not null default 'cashier', created_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), store_id uuid references public.stores not null, name text not null, unique(store_id, name));
create table public.products (id uuid primary key default gen_random_uuid(), store_id uuid references public.stores not null, category_id uuid references public.categories, name text not null, sku text not null, price_kobo bigint not null check(price_kobo >= 0), stock_quantity integer not null default 0, active boolean not null default true, updated_at timestamptz not null default now(), unique(store_id, sku));
create table public.sales (id uuid primary key, store_id uuid references public.stores not null, cashier_id uuid references public.profiles not null, receipt_no text not null, total_kobo bigint not null check(total_kobo >= 0), payment_method public.payment_method not null, payment_reference text, sold_at timestamptz not null, created_at timestamptz not null default now(), unique(store_id, receipt_no));
create table public.sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid references public.sales on delete cascade not null, product_id uuid references public.products not null, quantity integer not null check(quantity > 0), unit_price_kobo bigint not null check(unit_price_kobo >= 0));
create table public.stock_movements (id uuid primary key default gen_random_uuid(), store_id uuid references public.stores not null, product_id uuid references public.products not null, quantity_delta integer not null, reason text not null, reference_id uuid, created_at timestamptz not null default now());

alter table public.stores enable row level security; alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.sales enable row level security; alter table public.sale_items enable row level security;
create function public.current_store_id() returns uuid language sql stable security definer set search_path = public as $$ select store_id from public.profiles where id = auth.uid() $$;
create policy "staff see own store" on public.stores for select using (id = public.current_store_id());
create policy "staff see own store products" on public.products for select using (store_id = public.current_store_id());
create policy "staff see own store sales" on public.sales for select using (store_id = public.current_store_id());
create policy "cashiers record own-store sales" on public.sales for insert with check (store_id = public.current_store_id() and cashier_id = auth.uid());
create policy "staff see sale items" on public.sale_items for select using (exists (select 1 from public.sales s where s.id = sale_id and s.store_id = public.current_store_id()));
create policy "cashiers add sale items" on public.sale_items for insert with check (exists (select 1 from public.sales s where s.id = sale_id and s.store_id = public.current_store_id() and s.cashier_id = auth.uid()));
create policy "staff see own profile" on public.profiles for select using (id = auth.uid());
create policy "staff see own store categories" on public.categories for select using (store_id = public.current_store_id());
create policy "managers and admins manage products" on public.products for all using (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager'))) with check (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager')));
