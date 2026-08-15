create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references public.sale_returns on delete cascade,
  sale_item_id uuid not null references public.sale_items,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (sale_return_id, sale_item_id)
);
alter table public.sale_return_items enable row level security;
create policy "staff see own store returned items" on public.sale_return_items for select using (exists (select 1 from public.sale_returns r join public.sales s on s.id = r.sale_id where r.id = sale_return_id and s.store_id = public.current_store_id()));
