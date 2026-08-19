alter table public.sales add column if not exists order_cost_kobo bigint check (order_cost_kobo >= 0);
alter table public.sales drop constraint if exists sales_order_status_check;
alter table public.sales add constraint sales_order_status_check check (order_status in ('pending', 'in_progress', 'ready', 'fulfilled', 'cancelled'));

create or replace function public.update_order_management(p_sale_id uuid, p_status text, p_notes text default null, p_order_cost_kobo bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_role public.app_role;
begin
  if p_status not in ('pending','in_progress','ready','fulfilled','cancelled') then raise exception 'Invalid order status'; end if;
  if p_order_cost_kobo is not null and p_order_cost_kobo < 0 then raise exception 'Cost cannot be negative'; end if;
  select store_id into v_store_id from public.sales where id=p_sale_id and payment_method='order';
  if v_store_id is null then raise exception 'Order has not synced yet or is unavailable'; end if;
  select m.role into v_role from public.organization_memberships m join public.stores st on st.organization_id=m.organization_id where st.id=v_store_id and m.user_id=auth.uid() and m.status='active';
  if v_role is null or v_role not in ('admin','manager') then raise exception 'Only managers and admins can manage orders'; end if;
  update public.sales set order_status=p_status, order_notes=nullif(trim(p_notes),''), order_cost_kobo=p_order_cost_kobo where id=p_sale_id and payment_method='order';
end $$;
grant execute on function public.update_order_management(uuid,text,text,bigint) to authenticated;
