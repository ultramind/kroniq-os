alter table public.products add column if not exists cost_price_kobo bigint not null default 0 check (cost_price_kobo >= 0);
alter table public.sale_items add column if not exists cost_price_kobo bigint not null default 0 check (cost_price_kobo >= 0);
