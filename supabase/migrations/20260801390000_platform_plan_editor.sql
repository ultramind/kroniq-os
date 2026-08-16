-- Platform-admin controlled plans and an entitlement catalogue matching Kroniqos modules.
update public.subscription_plans set
  limits = '{"stores":1,"staff":5,"products":2000,"warehouses":0,"product_images":0,"storefront_sections":0,"service_jobs":0}'::jsonb,
  features = '["Retail POS and offline checkout","Inventory, deliveries and customer credit","Expenses and basic reports"]'::jsonb
where code = 'starter';
update public.subscription_plans set
  limits = '{"stores":3,"staff":20,"products":10000,"warehouses":2,"product_images":2,"storefront_sections":8,"service_jobs":500}'::jsonb,
  features = '["Everything in Starter","Profit reports and CSV exports","Warehouses and stock controls","Online storefront, logo and product images","Service jobs, projects and invoices"]'::jsonb
where code = 'growth';
update public.subscription_plans set
  limits = '{"stores":20,"staff":100,"products":50000,"warehouses":20,"product_images":2,"storefront_sections":8,"service_jobs":5000}'::jsonb,
  features = '["Everything in Growth","Multi-branch operations","Advanced analytics and audit trail","Priority support and operational tools"]'::jsonb
where code = 'business';
update public.subscription_plans set
  limits = '{"stores":100,"staff":1000,"products":100000,"warehouses":100,"product_images":2,"storefront_sections":8,"service_jobs":50000}'::jsonb,
  features = '["Everything in Business","Custom limits and integrations","Dedicated support and onboarding"]'::jsonb
where code = 'enterprise';

create or replace function public.update_subscription_plan(
  p_code text, p_name text, p_description text, p_monthly_price_kobo bigint,
  p_limits jsonb, p_features jsonb, p_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare previous jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if coalesce(trim(p_name), '') = '' or p_monthly_price_kobo < 0 then raise exception 'Plan name and price are invalid'; end if;
  if jsonb_typeof(p_limits) <> 'object' or jsonb_typeof(p_features) <> 'array' then raise exception 'Limits must be an object and features must be a list'; end if;
  select jsonb_build_object('name',name,'description',description,'monthly_price_kobo',monthly_price_kobo,'limits',limits,'features',features,'active',active) into previous from public.subscription_plans where code=p_code for update;
  if previous is null then raise exception 'Plan not found'; end if;
  update public.subscription_plans set name=trim(p_name), description=coalesce(p_description,''), monthly_price_kobo=p_monthly_price_kobo, limits=p_limits, features=p_features, active=p_active, updated_at=now() where code=p_code;
  insert into public.platform_audit_events(actor_id,action,before_data,after_data) values (auth.uid(),'subscription_plan_updated',previous,jsonb_build_object('code',p_code,'name',trim(p_name),'limits',p_limits,'active',p_active));
end $$;
grant execute on function public.update_subscription_plan(text,text,text,bigint,jsonb,jsonb,boolean) to authenticated;
