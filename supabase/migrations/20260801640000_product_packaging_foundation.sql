-- One product owns its base stock; packs and cartons are optional ways to buy or sell it.
alter table public.products add column if not exists base_unit text not null default 'piece';

create table if not exists public.product_packaging (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  units_per_pack integer not null check (units_per_pack > 1),
  sku text,
  price_kobo bigint not null check (price_kobo >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name),
  unique (store_id, sku)
);

alter table public.product_packaging enable row level security;
drop policy if exists "store staff see product packaging" on public.product_packaging;
drop policy if exists "managers manage product packaging" on public.product_packaging;
create policy "store staff see product packaging" on public.product_packaging for select to authenticated using (store_id = public.current_store_id());
create policy "managers manage product packaging" on public.product_packaging for all to authenticated
using (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager')))
with check (store_id = public.current_store_id() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager')));

create index if not exists product_packaging_product_idx on public.product_packaging(product_id) where active;
create index if not exists product_packaging_barcode_idx on public.product_packaging(store_id, sku) where sku is not null and active;
