create table if not exists public.supplier_delivery_payments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.supplier_delivery_batches(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  paid_at date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.supplier_delivery_payments enable row level security;
create policy "staff view supplier delivery payments" on public.supplier_delivery_payments for select using (store_id = public.current_store_id());

create or replace function public.record_supplier_delivery_payment(p_batch_id uuid, p_amount_kobo bigint, p_paid_at date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_role public.app_role; v_total bigint; v_deposit bigint; v_paid bigint;
begin
  select batch.store_id, batch.total_kobo, batch.amount_paid_kobo into v_store_id, v_total, v_deposit from public.supplier_delivery_batches batch where batch.id=p_batch_id for update;
  if v_store_id is null then raise exception 'Supplier delivery was not found'; end if;
  select membership.role into v_role from public.organization_memberships membership join public.stores store_record on store_record.organization_id=membership.organization_id where store_record.id=v_store_id and membership.user_id=auth.uid() and membership.status='active';
  if v_role is null or v_role not in ('admin','manager') then raise exception 'Only managers and admins can record supplier payments'; end if;
  select coalesce(sum(payment.amount_kobo),0) into v_paid from public.supplier_delivery_payments payment where payment.batch_id=p_batch_id;
  if p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo > v_total-v_deposit-v_paid then raise exception 'Payment cannot exceed the supplier balance'; end if;
  insert into public.supplier_delivery_payments(batch_id,store_id,amount_kobo,paid_at,recorded_by) values(p_batch_id,v_store_id,p_amount_kobo,coalesce(p_paid_at,current_date),auth.uid());
end $$;
grant execute on function public.record_supplier_delivery_payment(uuid,bigint,date) to authenticated;
