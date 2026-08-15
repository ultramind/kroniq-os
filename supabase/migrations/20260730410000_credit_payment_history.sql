alter table public.sales add column if not exists credit_initial_payment_kobo bigint not null default 0 check (credit_initial_payment_kobo >= 0);

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales on delete cascade,
  store_id uuid not null references public.stores, amount_kobo bigint not null check (amount_kobo > 0),
  paid_at date not null default current_date, recorded_by uuid not null references public.profiles, created_at timestamptz not null default now()
);
alter table public.credit_payments enable row level security;
create policy "staff see store credit payments" on public.credit_payments for select using (store_id = public.current_store_id());

create or replace function public.record_credit_payment(p_sale_id uuid, p_amount_kobo bigint, p_paid_at date)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role; sale_total bigint; upfront bigint; paid_before bigint;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null or current_role not in ('admin', 'manager') then raise exception 'Only managers and admins can record credit payments'; end if;
  select total_kobo, credit_initial_payment_kobo into sale_total, upfront from public.sales where id = p_sale_id and store_id = current_store and payment_method = 'credit' for update;
  if not found then raise exception 'Credit sale not found in the active store'; end if;
  select coalesce(sum(amount_kobo), 0) into paid_before from public.credit_payments where sale_id = p_sale_id;
  if p_amount_kobo <= 0 or p_amount_kobo > sale_total - upfront - paid_before then raise exception 'Payment exceeds the remaining credit balance'; end if;
  insert into public.credit_payments(sale_id, store_id, amount_kobo, paid_at, recorded_by) values (p_sale_id, current_store, p_amount_kobo, coalesce(p_paid_at, current_date), auth.uid());
  if p_amount_kobo = sale_total - upfront - paid_before then update public.sales set credit_settled_at = now() where id = p_sale_id; end if;
end $$;
grant execute on function public.record_credit_payment(uuid, bigint, date) to authenticated;
