-- Billing records are separate from POS payments and are only for SaaS subscriptions.
alter table public.subscription_plans add column if not exists paystack_plan_code text unique;
alter table public.organization_subscriptions add column if not exists trial_started_at timestamptz;
alter table public.organization_subscriptions add column if not exists past_due_at timestamptz;
alter table public.organization_subscriptions add column if not exists grace_period_ends_at timestamptz;
alter table public.organization_subscriptions add column if not exists suspended_at timestamptz;

update public.organization_subscriptions
set trial_started_at = coalesce(trial_started_at, created_at)
where trial_started_at is null;

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  provider text not null default 'paystack',
  provider_reference text not null unique,
  provider_transaction_id text,
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null check (status in ('initialized', 'success', 'failed', 'abandoned', 'refunded')),
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscription_payments_org_created_idx on public.subscription_payments(organization_id, created_at desc);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.subscription_payments enable row level security;
alter table public.billing_webhook_events enable row level security;

create policy "platform admins view subscription payments" on public.subscription_payments
  for select using (public.is_platform_admin());
create policy "company admins view own subscription payments" on public.subscription_payments
  for select using (organization_id = public.current_organization_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "platform admins view billing webhook events" on public.billing_webhook_events
  for select using (public.is_platform_admin());
create policy "authenticated users view active subscription plans" on public.subscription_plans
  for select using (active);

create or replace function public.apply_billing_lifecycle(p_now timestamptz default now())
returns table (trials_marked_past_due integer, organizations_suspended integer)
language plpgsql
security definer
set search_path = public
as $$
declare trial_count integer; suspension_count integer;
begin
  with expired_trials as (
    update public.organization_subscriptions
    set status = 'past_due', past_due_at = p_now, grace_period_ends_at = p_now + interval '3 days', updated_at = p_now
    where status = 'trial' and trial_ends_at is not null and trial_ends_at <= p_now
    returning organization_id
  ) select count(*) into trial_count from expired_trials;

  with suspended as (
    update public.organizations o
    set status = 'suspended'
    from public.organization_subscriptions s
    where s.organization_id = o.id and s.status = 'past_due'
      and s.grace_period_ends_at is not null and s.grace_period_ends_at <= p_now
      and o.status <> 'suspended'
    returning o.id
  ), stamped as (
    update public.organization_subscriptions s
    set suspended_at = p_now, updated_at = p_now
    from suspended where suspended.id = s.organization_id
    returning s.organization_id
  ) select count(*) into suspension_count from stamped;

  return query select coalesce(trial_count, 0), coalesce(suspension_count, 0);
end;
$$;

grant execute on function public.apply_billing_lifecycle(timestamptz) to service_role;

create or replace function public.current_organization_billing_status()
returns table (organization_status text, subscription_status text, grace_period_ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.status, s.status, s.grace_period_ends_at
  from public.profiles p
  join public.stores st on st.id = p.store_id
  join public.organizations o on o.id = st.organization_id
  left join public.organization_subscriptions s on s.organization_id = o.id
  where p.id = auth.uid()
$$;
grant execute on function public.current_organization_billing_status() to authenticated;

-- Supabase Cron runs this directly in the database every hour. If pg_cron was not
-- enabled in the project, enable it in Dashboard → Integrations → Cron, then rerun this block.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'billing-lifecycle-hourly';
  perform cron.schedule('billing-lifecycle-hourly', '5 * * * *', 'select public.apply_billing_lifecycle();');
exception when others then
  raise notice 'Enable Supabase Cron and schedule: select public.apply_billing_lifecycle();';
end $$;
