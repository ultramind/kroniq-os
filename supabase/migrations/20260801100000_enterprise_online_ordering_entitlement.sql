-- Enterprise plan and online-storefront entitlement.
insert into public.subscription_plans (code, name, description, monthly_price_kobo, limits, features) values
  ('enterprise', 'Enterprise', 'A tailored plan for high-volume or specialised retail operations.', 0, '{"stores":100,"staff":1000,"products":100000,"warehouses":100}'::jsonb, '["Everything in Business","Branded online landing page","Customer cart and online ordering","Custom limits and pricing","Dedicated onboarding and support","Custom integrations"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();

update public.subscription_plans
set features = '["Everything in Growth","Multi-branch controls","Branded online landing page","Customer cart and online ordering","Priority support","Custom reporting"]'::jsonb,
    updated_at = now()
where code = 'business';
