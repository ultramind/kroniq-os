-- Shared customer directory for services, credit, invoices, and future online ordering.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_store_name_idx on public.customers(store_id, full_name);
create index if not exists customers_store_phone_idx on public.customers(store_id, phone);
alter table public.customers enable row level security;
drop policy if exists "store staff manage customers" on public.customers;
create policy "store staff manage customers" on public.customers for all to authenticated
using (store_id = public.current_store_id())
with check (store_id = public.current_store_id());
