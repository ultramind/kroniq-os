-- Product limits are enforced in PostgreSQL, never just in the client UI.
create or replace function public.enforce_organization_product_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  organization uuid;
  product_limit integer;
  active_products integer;
begin
  if not new.active or (tg_op = 'UPDATE' and old.active) then return new; end if;
  select s.organization_id into organization from public.stores s where s.id = new.store_id;
  select coalesce((plan.limits->>'products')::integer, 2000) into product_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan on plan.code = subscription.plan_code
  where subscription.organization_id = organization and subscription.status in ('trial', 'active', 'past_due')
  limit 1;
  product_limit := coalesce(product_limit, 2000);
  select count(*) into active_products
  from public.products product join public.stores store on store.id = product.store_id
  where store.organization_id = organization and product.active;
  if active_products >= product_limit then
    raise exception 'Product limit reached (% of % active products). Upgrade your plan or archive products before adding another.', active_products, product_limit;
  end if;
  return new;
end $$;

drop trigger if exists enforce_organization_product_limit on public.products;
create trigger enforce_organization_product_limit
before insert or update of active on public.products
for each row execute function public.enforce_organization_product_limit();

create or replace function public.current_product_plan_usage()
returns table(used_products bigint, product_limit integer, plan_code text)
language sql stable security definer set search_path = public as $$
  with context as (select public.current_organization_id() as organization_id), plan as (
    select subscription.plan_code, coalesce((subscription_plan.limits->>'products')::integer, 2000) as product_limit
    from context join public.organization_subscriptions subscription on subscription.organization_id = context.organization_id
    join public.subscription_plans subscription_plan on subscription_plan.code = subscription.plan_code
    where subscription.status in ('trial', 'active', 'past_due') limit 1
  )
  select count(product.id), coalesce(plan.product_limit, 2000), coalesce(plan.plan_code, 'starter')
  from context left join public.stores store on store.organization_id = context.organization_id
  left join public.products product on product.store_id = store.id and product.active
  cross join plan
  group by plan.product_limit, plan.plan_code
$$;
grant execute on function public.current_product_plan_usage() to authenticated;
