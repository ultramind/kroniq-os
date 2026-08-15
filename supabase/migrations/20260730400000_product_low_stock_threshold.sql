-- Each product can define its own stock level that should trigger attention.
alter table public.products add column if not exists low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0);
