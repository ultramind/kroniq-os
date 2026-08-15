create table public.expense_categories (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores, name text not null, created_at timestamptz not null default now(), unique(store_id, name));
create table public.expenses (id uuid primary key, store_id uuid not null references public.stores, category_id uuid not null references public.expense_categories, description text not null, amount_kobo bigint not null check (amount_kobo > 0), spent_at date not null default current_date, recorded_by uuid not null references public.profiles, created_at timestamptz not null default now());
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
create policy "staff see store expense categories" on public.expense_categories for select using (store_id = public.current_store_id());
create policy "staff see store expenses" on public.expenses for select using (store_id = public.current_store_id());
create or replace function public.record_expense(p_expense jsonb) returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; staff_role public.app_role; category_id uuid;
begin
  select store_id, role into current_store, staff_role from public.profiles where id = auth.uid();
  if current_store is null or staff_role not in ('admin', 'manager') then raise exception 'Only managers and admins can record expenses'; end if;
  if coalesce(nullif(trim(p_expense->>'category_name'), ''), '') = '' or coalesce(nullif(trim(p_expense->>'description'), ''), '') = '' then raise exception 'Expense category and description are required'; end if;
  insert into public.expense_categories(store_id, name) values (current_store, trim(p_expense->>'category_name')) on conflict(store_id, name) do update set name = excluded.name returning id into category_id;
  insert into public.expenses(id, store_id, category_id, description, amount_kobo, spent_at, recorded_by) values ((p_expense->>'id')::uuid, current_store, category_id, trim(p_expense->>'description'), (p_expense->>'amount_kobo')::bigint, coalesce(nullif(p_expense->>'spent_at', '')::date, current_date), auth.uid());
end $$;
grant execute on function public.record_expense(jsonb) to authenticated;
