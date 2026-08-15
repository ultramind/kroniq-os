alter table public.organization_subscriptions add column if not exists first_paid_at timestamptz;

update public.organization_subscriptions s
set first_paid_at = payments.first_paid_at
from (
  select organization_id, min(paid_at) as first_paid_at
  from public.subscription_payments
  where status = 'success' and paid_at is not null
  group by organization_id
) payments
where s.organization_id = payments.organization_id and s.first_paid_at is null;

create or replace function public.platform_audit_log(
  p_search text default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  organization_id uuid,
  organization_name text,
  actor_email text,
  before_data jsonb,
  after_data jsonb
)
as $platform_audit_log$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  return query
  select e.id, e.created_at, e.action, e.organization_id, o.name::text, u.email::text, e.before_data, e.after_data
  from public.platform_audit_events e
  left join public.organizations o on o.id = e.organization_id
  left join auth.users u on u.id = e.actor_id
  where (p_search is null or p_search = '' or coalesce(o.name, '') ilike '%' || p_search || '%' or coalesce(u.email, '') ilike '%' || p_search || '%' or e.action ilike '%' || p_search || '%')
    and (p_from is null or e.created_at >= p_from::timestamptz)
    and (p_to is null or e.created_at < (p_to + 1)::timestamptz)
  order by e.created_at desc
  limit 500;
end;
$platform_audit_log$
language plpgsql
stable
security definer
set search_path = public;

create or replace function public.platform_analytics(p_from date, p_to date)
returns table (
  active_organizations bigint,
  new_signups bigint,
  churned_organizations bigint,
  total_stores bigint,
  total_staff bigint,
  sales_volume_kobo bigint,
  subscription_revenue_kobo bigint,
  trials_started bigint,
  trials_converted bigint
)
as $platform_analytics$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  return query
  select
    (select count(*) from public.organizations where status = 'active'),
    (select count(*) from public.organizations where created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz),
    (select count(*) from public.platform_audit_events where action = 'organization_status_changed' and after_data->>'status' = 'cancelled' and created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz),
    (select count(*) from public.stores where status = 'active'),
    (select count(*) from public.profiles),
    (select coalesce(sum(total_kobo), 0)::bigint from public.sales where sold_at >= p_from::timestamptz and sold_at < (p_to + 1)::timestamptz),
    (select coalesce(sum(amount_kobo), 0)::bigint from public.subscription_payments where status = 'success' and paid_at >= p_from::timestamptz and paid_at < (p_to + 1)::timestamptz),
    (select count(*) from public.organization_subscriptions where trial_started_at >= p_from::timestamptz and trial_started_at < (p_to + 1)::timestamptz),
    (select count(*) from public.organization_subscriptions where trial_started_at >= p_from::timestamptz and trial_started_at < (p_to + 1)::timestamptz and first_paid_at is not null);
end;
$platform_analytics$
language plpgsql
stable
security definer
set search_path = public;

grant execute on function public.platform_audit_log(text, date, date) to authenticated;
grant execute on function public.platform_analytics(date, date) to authenticated;
