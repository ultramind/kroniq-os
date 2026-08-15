-- Product commerce metadata and variant catalogue. POS sales continue to use parent products until variant checkout is enabled.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  option_values jsonb not null default '{}'::jsonb,
  price_kobo bigint,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, sku)
);
create index product_variants_product_idx on public.product_variants(product_id);
alter table public.product_variants enable row level security;
create policy "staff manage own store product variants" on public.product_variants for all
using (exists(select 1 from public.products p where p.id = product_id and p.store_id = public.current_store_id() and exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','manager'))))
with check (exists(select 1 from public.products p where p.id = product_id and p.store_id = public.current_store_id() and exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','manager'))));

insert into storage.buckets(id, name, public) values ('product-images', 'product-images', true) on conflict(id) do nothing;
create policy "staff upload own store product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = public.current_store_id()::text);
create policy "staff update own store product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and (storage.foldername(name))[1] = public.current_store_id()::text);
create policy "public read product images" on storage.objects for select using (bucket_id = 'product-images');
