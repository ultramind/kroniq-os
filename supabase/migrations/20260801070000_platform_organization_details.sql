-- Platform operations need tenant staff metadata and aggregate usage, not raw sales.
create policy "platform admins view profiles" on public.profiles
  for select using (public.is_platform_admin());

create or replace function public.platform_organization_metrics(p_organization_id uuid)
returns table (
  product_count bigint,
  sale_count bigint,
  sales_total_kobo bigint,
  staff_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  return query
  select
    (select count(*) from public.products p join public.stores s on s.id = p.store_id where s.organization_id = p_organization_id),
    (select count(*) from public.sales sa join public.stores s on s.id = sa.store_id where s.organization_id = p_organization_id),
    (select coalesce(sum(sa.total_kobo), 0) from public.sales sa join public.stores s on s.id = sa.store_id where s.organization_id = p_organization_id),
    (select count(*) from public.profiles pr join public.stores s on s.id = pr.store_id where s.organization_id = p_organization_id);
end;
$$;

grant execute on function public.platform_organization_metrics(uuid) to authenticated;
