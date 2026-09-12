-- Repair databases where the partial-return function was deployed before its
-- supporting audit table. This is safe for production: existing return data,
-- sales, and stock are not changed.
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (sale_return_id, sale_item_id)
);

create index if not exists sale_return_items_sale_item_idx
  on public.sale_return_items (sale_item_id);

alter table public.sale_return_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_return_items'
      and policyname = 'staff see own store returned items'
  ) then
    create policy "staff see own store returned items"
      on public.sale_return_items
      for select
      using (
        exists (
          select 1
          from public.sale_returns return_record
          join public.sales sale_record on sale_record.id = return_record.sale_id
          where return_record.id = sale_return_id
            and sale_record.store_id = public.current_store_id()
        )
      );
  end if;
end;
$$;
