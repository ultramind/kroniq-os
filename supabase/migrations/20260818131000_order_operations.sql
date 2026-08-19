alter table public.sales add column if not exists order_notes text;

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0), paid_at date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.order_payments enable row level security;
create policy "staff view store order payments" on public.order_payments for select using (store_id = public.current_store_id());

create or replace function public.record_order_payment(p_sale_id uuid, p_amount_kobo bigint, p_paid_at date)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid; r public.app_role; total bigint; deposit bigint; paid bigint;
begin
  select store_id, role into s, r from public.profiles where id=auth.uid();
  if s is null or r not in ('admin','manager') then raise exception 'Only managers and admins can record order payments'; end if;
  select total_kobo, coalesce(credit_initial_payment_kobo,0) into total, deposit from public.sales where id=p_sale_id and store_id=s and payment_method='order' for update;
  if not found then raise exception 'Order not found'; end if;
  select coalesce(sum(amount_kobo),0) into paid from public.order_payments where sale_id=p_sale_id;
  if p_amount_kobo <= 0 or p_amount_kobo > total-deposit-paid then raise exception 'Payment cannot exceed the outstanding balance'; end if;
  insert into public.order_payments(sale_id,store_id,amount_kobo,paid_at,recorded_by) values(p_sale_id,s,p_amount_kobo,coalesce(p_paid_at,current_date),auth.uid());
end $$;

create or replace function public.update_order_status(p_sale_id uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid; r public.app_role;
begin
  select store_id, role into s,r from public.profiles where id=auth.uid();
  if s is null or r not in ('admin','manager') then raise exception 'Only managers and admins can update orders'; end if;
  if p_status not in ('pending','in_progress','ready','fulfilled','cancelled') then raise exception 'Invalid order status'; end if;
  update public.sales set order_status=p_status, order_notes=nullif(trim(p_notes),'') where id=p_sale_id and store_id=s and payment_method='order';
  if not found then raise exception 'Order not found'; end if;
end $$;
grant execute on function public.record_order_payment(uuid,bigint,date), public.update_order_status(uuid,text,text) to authenticated;
