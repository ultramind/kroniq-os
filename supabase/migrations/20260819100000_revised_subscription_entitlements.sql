-- Commercial plans use machine-readable entitlements. Display features remain
-- editable marketing copy; these entitlement keys drive server-side access.
alter table public.subscription_plans
  add column if not exists entitlements jsonb not null default '[]'::jsonb;

-- Keep database-created subscriptions aligned with the 60-day onboarding trial.
create or replace function public.assign_default_trial_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'trial' and new.trial_ends_at is null then
    new.trial_ends_at := now() + interval '60 days';
  end if;
  return new;
end;
$$;

update public.subscription_plans
set
  name = 'Starter',
  description = 'For market traders and small businesses running daily sales.',
  limits = '{"stores":1,"staff":5,"products":2000,"warehouses":0,"product_images":0,"storefront_sections":0,"service_jobs":0}'::jsonb,
  entitlements = '["pos","offline_checkout","inventory","deliveries","expenses","credits","orders","flexible_pricing","basic_reports"]'::jsonb,
  features = '["Offline-first POS and inventory","Cash, transfer, card, credit and customer orders","Flexible pricing with approval controls","Expenses, deliveries, credit register and basic reports"]'::jsonb
where code = 'starter';

update public.subscription_plans
set
  name = 'Growth',
  description = 'For growing retail and service operations.',
  limits = '{"stores":3,"staff":20,"products":10000,"warehouses":2,"product_images":2,"storefront_sections":8,"service_jobs":500}'::jsonb,
  entitlements = '["pos","offline_checkout","inventory","deliveries","expenses","credits","orders","flexible_pricing","basic_reports","packaging","warehouses","bulk_import","advanced_reports","online_storefront","storefront_branding","service_contracts"]'::jsonb,
  features = '["Everything in Starter","Packs and cartons, warehouses and bulk imports","Profit reports and advanced exports","Online storefront, brand controls and product images","Service contracts, invoices and workflows"]'::jsonb
where code = 'growth';

update public.subscription_plans
set
  name = 'Scale',
  description = 'For established businesses with larger teams and operations.',
  limits = '{"stores":20,"staff":100,"products":50000,"warehouses":20,"product_images":2,"storefront_sections":8,"service_jobs":5000}'::jsonb,
  entitlements = '["pos","offline_checkout","inventory","deliveries","expenses","credits","orders","flexible_pricing","basic_reports","packaging","warehouses","bulk_import","advanced_reports","online_storefront","storefront_branding","service_contracts","multi_branch","advanced_audit","priority_support"]'::jsonb,
  features = '["Everything in Growth","Higher staff, product, warehouse and future branch capacity","Advanced audit visibility and priority support"]'::jsonb
where code = 'business';

update public.subscription_plans
set
  name = 'Kroniqos Plus',
  description = 'For strategic rollouts, tailored limits and assisted operations.',
  limits = '{"stores":100,"staff":1000,"products":100000,"warehouses":100,"product_images":2,"storefront_sections":8,"service_jobs":50000}'::jsonb,
  entitlements = '["pos","offline_checkout","inventory","deliveries","expenses","credits","orders","flexible_pricing","basic_reports","packaging","warehouses","bulk_import","advanced_reports","online_storefront","storefront_branding","service_contracts","multi_branch","advanced_audit","priority_support","integrations","assisted_onboarding"]'::jsonb,
  features = '["Everything in Scale","Tailored limits, integrations and assisted onboarding","Dedicated commercial support"]'::jsonb
where code = 'enterprise';

create or replace function public.organization_has_entitlement(p_organization_id uuid, p_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_subscriptions sub
    join public.subscription_plans plan on plan.code = sub.plan_code
    where sub.organization_id = p_organization_id
      and sub.status in ('trial', 'active')
      and (sub.status = 'trial' or plan.entitlements ? p_entitlement)
  );
$$;

create or replace function public.current_store_has_entitlement(p_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.organization_has_entitlement(store.organization_id, p_entitlement)
  from public.profiles profile
  join public.stores store on store.id = profile.store_id
  where profile.id = auth.uid();
$$;
grant execute on function public.organization_has_entitlement(uuid, text) to anon, authenticated;
grant execute on function public.current_store_has_entitlement(text) to authenticated;

create or replace function public.can_use_online_storefront()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and public.organization_has_entitlement(store.organization_id, 'online_storefront')
  );
$$;

create or replace function public.can_use_storefront_logo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and public.organization_has_entitlement(store.organization_id, 'storefront_branding')
  );
$$;

create or replace function public.enforce_organization_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_active_members integer;
begin
  if new.status <> 'active' or (tg_op = 'update' and old.status = 'active') then return new; end if;
  select coalesce((plan.limits ->> 'staff')::integer, 5) into v_limit
  from public.organization_subscriptions sub
  join public.subscription_plans plan on plan.code = sub.plan_code
  where sub.organization_id = new.organization_id and sub.status in ('trial', 'active')
  limit 1;
  v_limit := coalesce(v_limit, 5);
  select count(*) into v_active_members
  from public.organization_memberships
  where organization_id = new.organization_id and status = 'active';
  if v_active_members >= v_limit then
    raise exception 'Staff limit reached (% of % active staff). Upgrade your plan or deactivate a staff member first.', v_active_members, v_limit;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_organization_staff_limit on public.organization_memberships;
create trigger enforce_organization_staff_limit
before insert or update of status on public.organization_memberships
for each row execute function public.enforce_organization_staff_limit();

create or replace function public.enforce_warehouse_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_limit integer;
  v_warehouse_count integer;
begin
  if new.location_type <> 'warehouse' then return new; end if;
  select organization_id into v_organization_id from public.stores where id = new.store_id;
  select coalesce((plan.limits ->> 'warehouses')::integer, 0) into v_limit
  from public.organization_subscriptions sub
  join public.subscription_plans plan on plan.code = sub.plan_code
  where sub.organization_id = v_organization_id and sub.status in ('trial', 'active')
  limit 1;
  v_limit := coalesce(v_limit, 0);
  select count(*) into v_warehouse_count
  from public.inventory_locations location
  join public.stores store on store.id = location.store_id
  where store.organization_id = v_organization_id and location.location_type = 'warehouse' and location.active;
  if v_warehouse_count >= v_limit then
    raise exception 'Warehouse limit reached (% of %). Upgrade your plan to add another warehouse.', v_warehouse_count, v_limit;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_organization_warehouse_limit on public.inventory_locations;
create trigger enforce_organization_warehouse_limit
before insert on public.inventory_locations
for each row execute function public.enforce_warehouse_limit();

create or replace function public.enforce_service_contract_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.stores where id = new.store_id;
  if not public.organization_has_entitlement(v_organization_id, 'service_contracts') then
    raise exception 'Service contracts require the Growth plan or higher';
  end if;
  return new;
end;
$$;
drop trigger if exists require_service_contract_entitlement on public.service_jobs;
create trigger require_service_contract_entitlement
before insert on public.service_jobs
for each row execute function public.enforce_service_contract_entitlement();

drop function if exists public.update_subscription_plan(text, text, text, bigint, jsonb, jsonb, boolean);
create or replace function public.update_subscription_plan(
  p_code text,
  p_name text,
  p_description text,
  p_monthly_price_kobo bigint,
  p_limits jsonb,
  p_features jsonb,
  p_entitlements jsonb,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if coalesce(trim(p_name), '') = '' or p_monthly_price_kobo < 0 then raise exception 'Plan name and price are invalid'; end if;
  if jsonb_typeof(p_limits) <> 'object' or jsonb_typeof(p_features) <> 'array' or jsonb_typeof(p_entitlements) <> 'array' then
    raise exception 'Limits must be an object and features and entitlements must be lists';
  end if;
  select jsonb_build_object('name', name, 'description', description, 'monthly_price_kobo', monthly_price_kobo, 'limits', limits, 'features', features, 'entitlements', entitlements, 'active', active)
  into v_previous from public.subscription_plans where code = p_code for update;
  if v_previous is null then raise exception 'Plan not found'; end if;
  update public.subscription_plans
  set name = trim(p_name), description = coalesce(p_description, ''), monthly_price_kobo = p_monthly_price_kobo,
      limits = p_limits, features = p_features, entitlements = p_entitlements, active = p_active, updated_at = now()
  where code = p_code;
  insert into public.platform_audit_events(actor_id, action, before_data, after_data)
  values (auth.uid(), 'subscription_plan_updated', v_previous, jsonb_build_object('code', p_code, 'name', trim(p_name), 'limits', p_limits, 'entitlements', p_entitlements, 'active', p_active));
end;
$$;
grant execute on function public.update_subscription_plan(text, text, text, bigint, jsonb, jsonb, jsonb, boolean) to authenticated;

-- Public storefront queries cannot rely on auth.uid(), so resolve entitlement
-- directly from the storefront organisation. Trials deliberately pass here.
drop function if exists public.public_storefront(text);
create function public.public_storefront(p_slug text)
returns table(store_name text, slug text, headline text, description text, phone text, whatsapp text, address text, primary_color text, hero_image_urls text[], logo_url text, vision text, mission text, trust_stats jsonb, template_key text)
language sql stable security definer set search_path = public as $$
  select o.name, f.slug, f.headline, f.description, f.phone, f.whatsapp, f.address, f.primary_color, f.hero_image_urls, f.logo_url, f.vision, f.mission, f.trust_stats, f.template_key
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  where f.enabled and f.slug = lower(trim(p_slug)) and s.status = 'active' and o.status in ('trial', 'active')
    and public.organization_has_entitlement(o.id, 'online_storefront')
$$;

drop function if exists public.public_storefront_products(text);
create function public.public_storefront_products(p_slug text)
returns table(id uuid, name text, description text, image_url text, image_urls text[], price_kobo bigint, category text, is_featured boolean, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.image_urls, p.price_kobo, c.name, p.is_featured, p.published_at
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.products p on p.store_id = f.store_id
  left join public.categories c on c.id = p.category_id
  where f.enabled and f.slug = lower(trim(p_slug)) and p.active and p.online_published and p.stock_quantity > 0
    and public.organization_has_entitlement(o.id, 'online_storefront')
  order by p.published_at desc nulls last, p.name
$$;

drop function if exists public.public_storefront_sections(text);
create function public.public_storefront_sections(p_slug text)
returns table(id uuid, section_type text, title text, body text, image_url text, cta_label text, cta_url text, display_position integer)
language sql stable security definer set search_path = public as $$
  select sec.id, sec.section_type, sec.title, sec.body, sec.image_url, sec.cta_label, sec.cta_url, sec.position
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.storefront_sections sec on sec.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and sec.visible
    and public.organization_has_entitlement(o.id, 'online_storefront')
  order by sec.position, sec.created_at
$$;

drop function if exists public.public_storefront_testimonials(text);
create function public.public_storefront_testimonials(p_slug text)
returns table(id uuid, customer_name text, customer_title text, quote text, rating smallint, photo_url text, verified boolean, display_position integer)
language sql stable security definer set search_path = public as $$
  select t.id, t.customer_name, t.customer_title, t.quote, t.rating, t.photo_url, t.verified, t.position
  from public.storefronts f
  join public.stores s on s.id = f.store_id
  join public.organizations o on o.id = s.organization_id
  join public.storefront_testimonials t on t.store_id = f.store_id
  where f.enabled and f.slug = lower(trim(p_slug)) and t.published
    and public.organization_has_entitlement(o.id, 'online_storefront')
  order by t.position, t.created_at desc
$$;

grant execute on function public.public_storefront(text) to anon, authenticated;
grant execute on function public.public_storefront_products(text) to anon, authenticated;
grant execute on function public.public_storefront_sections(text) to anon, authenticated;
grant execute on function public.public_storefront_testimonials(text) to anon, authenticated;
