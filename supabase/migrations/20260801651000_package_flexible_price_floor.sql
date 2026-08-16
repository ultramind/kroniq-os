alter table public.product_packaging add column if not exists minimum_selling_price_kobo bigint check (minimum_selling_price_kobo >= 0);
