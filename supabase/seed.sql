-- Run after all migrations. Safe to run more than once.
-- This creates the first store and a practical starter catalogue in naira/kobo.
with target_store as (
  insert into public.stores (name, currency_code)
  select 'Naira POS Supermarket', 'NGN'
  where not exists (select 1 from public.stores where name = 'Naira POS Supermarket')
  returning id
), store as (
  select id from target_store union all select id from public.stores where name = 'Naira POS Supermarket' limit 1
)
insert into public.categories (store_id, name)
select store.id, category_name
from store cross join (values ('Groceries'), ('Beverages'), ('Dairy'), ('Household')) as categories(category_name)
on conflict (store_id, name) do nothing;

with store as (select id from public.stores where name = 'Naira POS Supermarket' limit 1),
catalogue(name, sku, price_kobo, cost_price_kobo, stock_quantity, category_name) as (
  values
    ('Mama Gold Rice 5kg', '10001', 1450000, 1150000, 18, 'Groceries'),
    ('Peak Milk 400g', '10002', 320000, 250000, 24, 'Dairy'),
    ('Milo Refill 500g', '10003', 490000, 380000, 12, 'Beverages'),
    ('Indomie Super Pack', '10004', 85000, 62000, 45, 'Groceries'),
    ('Coca-Cola 60cl', '10005', 75000, 52000, 31, 'Beverages'),
    ('Morning Fresh 450ml', '10006', 170000, 125000, 9, 'Household')
)
insert into public.products (store_id, category_id, name, sku, price_kobo, cost_price_kobo, stock_quantity)
select store.id, categories.id, catalogue.name, catalogue.sku, catalogue.price_kobo, catalogue.cost_price_kobo, catalogue.stock_quantity
from catalogue join store on true join public.categories categories on categories.store_id = store.id and categories.name = catalogue.category_name
on conflict (store_id, sku) do update set name = excluded.name, price_kobo = excluded.price_kobo, cost_price_kobo = excluded.cost_price_kobo, stock_quantity = excluded.stock_quantity, updated_at = now();
