create table public.subscription_plans (
  code text primary key check (code ~ '^[a-z0-9_-]+$'),
  name text not null,
  description text not null default '',
  monthly_price_kobo bigint not null default 0 check (monthly_price_kobo >= 0),
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (code, name, description, monthly_price_kobo, limits, features) values
  ('starter', 'Starter', 'For a single small supermarket getting started with POS.', 0, '{"stores":1,"staff":5,"products":2000,"warehouses":0}'::jsonb, '["Checkout and offline sales","Inventory","Basic reports","Customer credit"]'::jsonb),
  ('growth', 'Growth', 'For growing retailers with advanced operations.', 2500000, '{"stores":3,"staff":20,"products":10000,"warehouses":2}'::jsonb, '["Everything in Starter","Profit reports","Warehouses","Supplier deliveries","Advanced exports"]'::jsonb),
  ('business', 'Business', 'For multi-branch supermarket operations.', 7500000, '{"stores":20,"staff":100,"products":50000,"warehouses":20}'::jsonb, '["Everything in Growth","Multi-branch controls","Priority support","Custom reporting"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_kobo = excluded.monthly_price_kobo,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();

alter table public.subscription_plans enable row level security;
create policy "platform admins manage subscription plans" on public.subscription_plans
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.set_organization_plan(p_organization_id uuid, p_plan_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_plan text;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;
  if not exists (select 1 from public.subscription_plans where code = p_plan_code and active) then
    raise exception 'Plan is unavailable';
  end if;

  select plan_code into previous_plan from public.organization_subscriptions where organization_id = p_organization_id for update;
  if previous_plan is null then
    insert into public.organization_subscriptions (organization_id, plan_code, status)
    values (p_organization_id, p_plan_code, 'trial');
  else
    update public.organization_subscriptions set plan_code = p_plan_code, updated_at = now() where organization_id = p_organization_id;
  end if;

  insert into public.platform_audit_events (actor_id, organization_id, action, before_data, after_data)
  values (auth.uid(), p_organization_id, 'organization_plan_changed', jsonb_build_object('plan_code', previous_plan), jsonb_build_object('plan_code', p_plan_code));
end;
$$;

grant execute on function public.set_organization_plan(uuid, text) to authenticated;
