-- SaaS foundation: an organisation is the paying company; a store is one of its branches.
-- Existing single-store tenants are backfilled as a company with one primary branch.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.stores add column if not exists organization_id uuid references public.organizations;
alter table public.stores add column if not exists is_primary boolean not null default true;
alter table public.stores add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));

-- Use each existing store id as its first organisation id. This makes the migration
-- deterministic and guarantees every existing record remains associated with its store.
insert into public.organizations (id, name, slug, status)
select
  id,
  name,
  lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(id::text, 8),
  'active'
from public.stores
where organization_id is null
on conflict (id) do nothing;

update public.stores set organization_id = id where organization_id is null;
alter table public.stores alter column organization_id set not null;
create index stores_organization_id_idx on public.stores(organization_id);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations on delete cascade,
  plan_code text not null default 'starter',
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_subscriptions (organization_id, plan_code, status)
select id, 'starter', 'active' from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public as $$
  select s.organization_id
  from public.profiles p
  join public.stores s on s.id = p.store_id
  where p.id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.organization_subscriptions enable row level security;

create policy "organization admins view own company" on public.organizations
  for select using (
    id = public.current_organization_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "organization admins view own subscription" on public.organization_subscriptions
  for select using (
    organization_id = public.current_organization_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

comment on table public.organizations is 'SaaS tenant/company. A company can own one or more stores/branches.';
comment on table public.stores is 'A physical or online branch belonging to an organization.';
