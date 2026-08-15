-- Keep an optional upfront payment separate from the remaining amount a customer owes.
alter table public.sales add column if not exists credit_initial_payment_kobo bigint not null default 0 check (credit_initial_payment_kobo >= 0);

create or replace function public.record_credit_initial_payment(p_sale_id uuid, p_initial_payment_kobo bigint)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid;
begin
  select store_id into current_store from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'A staff profile is required'; end if;
  if p_initial_payment_kobo < 0 then raise exception 'Initial payment cannot be negative'; end if;
  update public.sales set credit_initial_payment_kobo = p_initial_payment_kobo
  where id = p_sale_id and store_id = current_store and cashier_id = auth.uid() and payment_method = 'credit' and p_initial_payment_kobo <= total_kobo;
  if not found then raise exception 'Credit sale not found, not owned by this cashier, or payment exceeds sale total'; end if;
end $$;

grant execute on function public.record_credit_initial_payment(uuid, bigint) to authenticated;
