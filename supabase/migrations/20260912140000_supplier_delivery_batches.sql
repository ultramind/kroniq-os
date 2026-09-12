-- Group multiple product lines from one supplier shipment into a single
-- delivery batch. Individual lines remain in supplier_deliveries for accurate
-- stock, cost-price, and selling-price history.
create table if not exists public.supplier_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  received_at date not null default current_date,
  total_kobo bigint not null check (total_kobo >= 0),
  amount_paid_kobo bigint not null default 0 check (amount_paid_kobo >= 0),
  due_date date,
  reference_no text,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount_paid_kobo <= total_kobo)
);

alter table public.supplier_deliveries
  add column if not exists batch_id uuid references public.supplier_delivery_batches(id) on delete set null;

create index if not exists supplier_delivery_batches_store_received_idx
  on public.supplier_delivery_batches(store_id, received_at desc);
create index if not exists supplier_deliveries_batch_idx on public.supplier_deliveries(batch_id);

alter table public.supplier_delivery_batches enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_delivery_batches'
      and policyname = 'staff view supplier delivery batches'
  ) then
    create policy "staff view supplier delivery batches"
      on public.supplier_delivery_batches
      for select
      using (store_id = public.current_store_id());
  end if;
end;
$$;

create or replace function public.record_stock_delivery_batch(p_batch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_store uuid;
  staff_role public.app_role;
  supplier uuid;
  v_location_id uuid;
  v_location_type text;
  batch_id uuid;
  delivery_line jsonb;
  product_id uuid;
  quantity integer;
  unit_cost bigint;
  selling_price bigint;
  old_cost bigint;
  old_selling_price bigint;
  price_floor bigint;
  total bigint := 0;
  amount_paid bigint;
begin
  current_store := (select profile.store_id from public.profiles profile where profile.id = auth.uid());
  staff_role := (select profile.role from public.profiles profile where profile.id = auth.uid());
  if current_store is null or staff_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can receive supplier deliveries';
  end if;

  v_location_id := (select inventory_location.id from public.inventory_locations inventory_location where inventory_location.id = (p_batch->>'location_id')::uuid and inventory_location.store_id = current_store and inventory_location.active = true);
  v_location_type := (select inventory_location.location_type from public.inventory_locations inventory_location where inventory_location.id = v_location_id);
  if v_location_id is null then raise exception 'Choose a valid inventory location'; end if;

  if nullif(p_batch->>'supplier_id', '') is not null then
    supplier := (select supplier_record.id from public.suppliers supplier_record where supplier_record.id = (p_batch->>'supplier_id')::uuid and supplier_record.store_id = current_store);
    if supplier is null then raise exception 'Selected supplier was not found'; end if;
    update public.suppliers
    set phone = coalesce(nullif(trim(p_batch->>'supplier_phone'), ''), phone)
    where id = supplier;
  else
    insert into public.suppliers(store_id, name, phone)
    values (
      current_store,
      trim(p_batch->>'supplier_name'),
      nullif(trim(p_batch->>'supplier_phone'), '')
    )
    on conflict(store_id, name) do update
      set phone = coalesce(excluded.phone, public.suppliers.phone);
    supplier := (select supplier_record.id from public.suppliers supplier_record where supplier_record.store_id = current_store and supplier_record.name = trim(p_batch->>'supplier_name'));
  end if;

  if jsonb_typeof(p_batch->'lines') <> 'array' or jsonb_array_length(p_batch->'lines') = 0 then
    raise exception 'Add at least one product to the delivery';
  end if;

  for delivery_line in select value from jsonb_array_elements(p_batch->'lines') loop
    quantity := (delivery_line->>'quantity')::integer;
    unit_cost := (delivery_line->>'unit_cost_kobo')::bigint;
    if quantity is null or quantity < 1 or unit_cost is null or unit_cost < 0 then
      raise exception 'Each delivery line needs a quantity and cost price';
    end if;
    total := total + quantity * unit_cost;
  end loop;

  amount_paid := coalesce(nullif(p_batch->>'amount_paid_kobo', '')::bigint, 0);
  if amount_paid < 0 or amount_paid > total then
    raise exception 'Deposit cannot exceed the delivery total';
  end if;

  batch_id := coalesce(nullif(p_batch->>'id', '')::uuid, gen_random_uuid());
  if exists (select 1 from public.supplier_delivery_batches where id = batch_id) then return; end if;

  insert into public.supplier_delivery_batches(
    id, store_id, supplier_id, received_at, total_kobo, amount_paid_kobo,
    due_date, reference_no, notes, received_by
  )
  values (
    batch_id, current_store, supplier,
    coalesce(nullif(p_batch->>'received_at', '')::date, current_date),
    total, amount_paid,
    nullif(p_batch->>'due_date', '')::date,
    nullif(trim(p_batch->>'reference_no'), ''),
    nullif(trim(p_batch->>'notes'), ''),
    auth.uid()
  );

  for delivery_line in select value from jsonb_array_elements(p_batch->'lines') loop
    product_id := (delivery_line->>'product_id')::uuid;
    quantity := (delivery_line->>'quantity')::integer;
    unit_cost := (delivery_line->>'unit_cost_kobo')::bigint;
    selling_price := nullif(delivery_line->>'selling_price_kobo', '')::bigint;

    perform 1 from public.products product_record where product_record.id = product_id and product_record.store_id = current_store for update;
    if not found then raise exception 'A selected product was not found'; end if;
    old_cost := (select product_record.cost_price_kobo from public.products product_record where product_record.id = product_id);
    old_selling_price := (select product_record.price_kobo from public.products product_record where product_record.id = product_id);
    price_floor := (select product_record.minimum_selling_price_kobo from public.products product_record where product_record.id = product_id);
    if selling_price is not null and (selling_price < 0 or (price_floor is not null and selling_price < price_floor)) then
      raise exception 'A selling price is invalid or below its price floor';
    end if;

    if v_location_type = 'shop_floor' then
      update public.products
      set stock_quantity = stock_quantity + quantity,
          cost_price_kobo = unit_cost,
          price_kobo = coalesce(selling_price, price_kobo),
          updated_at = now()
      where id = product_id;
    else
      update public.products
      set cost_price_kobo = unit_cost,
          price_kobo = coalesce(selling_price, price_kobo),
          updated_at = now()
      where id = product_id;
    end if;

    insert into public.supplier_deliveries(
      id, batch_id, store_id, supplier_id, product_id, location_id,
      quantity, unit_cost_kobo, received_by, received_at
    )
    values (
      coalesce(nullif(delivery_line->>'id', '')::uuid, gen_random_uuid()),
      batch_id, current_store, supplier, product_id, v_location_id,
      quantity, unit_cost, auth.uid(),
      coalesce(nullif(p_batch->>'received_at', '')::date, current_date)
    );

    if old_cost <> unit_cost or (selling_price is not null and old_selling_price <> selling_price) then
      insert into public.product_price_history(
        store_id, product_id, previous_cost_kobo, new_cost_kobo,
        previous_selling_price_kobo, new_selling_price_kobo, changed_by
      )
      values (
        current_store, product_id, old_cost, unit_cost,
        old_selling_price, coalesce(selling_price, old_selling_price), auth.uid()
      );
    end if;

    insert into public.stock_movements(store_id, product_id, quantity_delta, reason, client_operation_id)
    values (current_store, product_id, quantity, 'delivery', gen_random_uuid());
  end loop;
end;
$$;

grant execute on function public.record_stock_delivery_batch(jsonb) to authenticated;
