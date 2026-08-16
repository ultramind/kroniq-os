-- Corrective migration for platform organisation detail cards.
-- It is safe to run even when the original platform metrics migration succeeded.
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
as $platform_organization_metrics$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  return query
  select
    (select count(*)::bigint from public.products product join public.stores store on store.id = product.store_id where store.organization_id = p_organization_id),
    (select count(*)::bigint from public.sales sale join public.stores store on store.id = sale.store_id where store.organization_id = p_organization_id),
    (select coalesce(sum(sale.total_kobo), 0)::bigint from public.sales sale join public.stores store on store.id = sale.store_id where store.organization_id = p_organization_id),
    (select count(*)::bigint from public.profiles profile join public.stores store on store.id = profile.store_id where store.organization_id = p_organization_id);
end;
$platform_organization_metrics$;

grant execute on function public.platform_organization_metrics(uuid) to authenticated;
