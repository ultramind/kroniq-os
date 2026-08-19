-- Orders can remain visible in a local cache after a staff member changes active
-- workspace. Authorise against the order's organisation rather than the stale
-- profile store pointer, while still requiring an active manager/admin membership.
create or replace function public.update_order_management(
  p_sale_id uuid,
  p_status text,
  p_notes text default null,
  p_order_cost_kobo bigint default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_role public.app_role;
begin
  if p_status not in ('pending','in_progress','ready','fulfilled','cancelled') then raise exception 'Invalid order status'; end if;
  if p_order_cost_kobo is not null and p_order_cost_kobo < 0 then raise exception 'Cost cannot be negative'; end if;
  select store_id into v_store_id from public.sales where id=p_sale_id and payment_method='order';
  if v_store_id is null then raise exception 'Order has not synced yet or is unavailable'; end if;
  select m.role into v_role
  from public.organization_memberships m
  join public.stores st on st.organization_id=m.organization_id
  where st.id=v_store_id and m.user_id=auth.uid() and m.status='active';
  if v_role is null or v_role not in ('admin','manager') then raise exception 'Only managers and admins can manage orders'; end if;
  update public.sales
  set order_status=p_status, order_notes=nullif(trim(p_notes),''), order_cost_kobo=p_order_cost_kobo
  where id=p_sale_id and payment_method='order';
end $$;

create or replace function public.record_order_payment(p_sale_id uuid, p_amount_kobo bigint, p_paid_at date)
returns void language plpgsql security definer set search_path = public as $$
declare v_store_id uuid; v_role public.app_role; total bigint; deposit bigint; paid bigint;
begin
  select store_id, total_kobo, coalesce(credit_initial_payment_kobo,0)
  into v_store_id, total, deposit
  from public.sales where id=p_sale_id and payment_method='order' for update;
  if v_store_id is null then raise exception 'Order has not synced yet or is unavailable'; end if;
  select m.role into v_role
  from public.organization_memberships m
  join public.stores st on st.organization_id=m.organization_id
  where st.id=v_store_id and m.user_id=auth.uid() and m.status='active';
  if v_role is null or v_role not in ('admin','manager') then raise exception 'Only managers and admins can record order payments'; end if;
  select coalesce(sum(amount_kobo),0) into paid from public.order_payments where sale_id=p_sale_id;
  if p_amount_kobo <= 0 or p_amount_kobo > total-deposit-paid then raise exception 'Payment cannot exceed the outstanding balance'; end if;
  insert into public.order_payments(sale_id,store_id,amount_kobo,paid_at,recorded_by)
  values(p_sale_id,v_store_id,p_amount_kobo,coalesce(p_paid_at,current_date),auth.uid());
end $$;

grant execute on function public.update_order_management(uuid,text,text,bigint), public.record_order_payment(uuid,bigint,date) to authenticated;
