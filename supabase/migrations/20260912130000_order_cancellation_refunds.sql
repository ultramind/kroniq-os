-- A cancelled order may have received a deposit or later payments. Refunds are
-- stored separately so the original payment history remains auditable.
create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  refunded_at date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.order_refunds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_refunds'
      and policyname = 'staff view store order refunds'
  ) then
    create policy "staff view store order refunds"
      on public.order_refunds
      for select
      using (store_id = public.current_store_id());
  end if;
end;
$$;

create or replace function public.record_order_refund(
  p_sale_id uuid,
  p_amount_kobo bigint,
  p_refunded_at date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_status text;
  v_deposit bigint;
  v_paid bigint;
  v_refunded bigint;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  select store_id, order_status, coalesce(credit_initial_payment_kobo, 0)
  into v_store_id, v_status, v_deposit
  from public.sales
  where id = p_sale_id and payment_method = 'order'
  for update;

  if v_store_id is null then
    raise exception 'Order has not synced yet or is unavailable';
  end if;
  if v_status <> 'cancelled' then
    raise exception 'Cancel the order before recording a refund';
  end if;

  select membership.role
  into v_role
  from public.organization_memberships membership
  join public.stores store_record on store_record.organization_id = membership.organization_id
  where store_record.id = v_store_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Only managers and admins can record order refunds';
  end if;

  select coalesce(sum(amount_kobo), 0)
  into v_paid
  from public.order_payments
  where sale_id = p_sale_id;

  select coalesce(sum(amount_kobo), 0)
  into v_refunded
  from public.order_refunds
  where sale_id = p_sale_id;

  if p_amount_kobo > v_deposit + v_paid - v_refunded then
    raise exception 'Refund cannot exceed the amount paid by the customer';
  end if;

  insert into public.order_refunds (
    sale_id,
    store_id,
    amount_kobo,
    refunded_at,
    recorded_by
  )
  values (
    p_sale_id,
    v_store_id,
    p_amount_kobo,
    coalesce(p_refunded_at, current_date),
    auth.uid()
  );
end;
$$;

grant execute on function public.record_order_refund(uuid, bigint, date) to authenticated;
