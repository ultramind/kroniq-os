-- A manager or admin records when an outstanding customer credit has been settled.
create or replace function public.mark_credit_paid(p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid; current_role public.app_role;
begin
  select store_id, role into current_store, current_role from public.profiles where id = auth.uid();
  if current_store is null or current_role not in ('admin', 'manager') then raise exception 'Only managers and admins can settle customer credit'; end if;
  update public.sales set credit_settled_at = coalesce(credit_settled_at, now())
  where id = p_sale_id and store_id = current_store and payment_method = 'credit';
  if not found then raise exception 'Credit sale not found in the active store'; end if;
end $$;

grant execute on function public.mark_credit_paid(uuid) to authenticated;
