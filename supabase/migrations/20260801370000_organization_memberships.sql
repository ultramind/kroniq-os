-- SaaS identity foundation: one authenticated person can belong to multiple companies.
-- The existing profiles table remains the active-workspace compatibility record during
-- the gradual RLS migration, so current POS users continue working unchanged.
create type public.membership_status as enum ('active', 'suspended', 'deactivated');

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.app_role not null default 'cashier',
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_memberships_user_idx on public.organization_memberships(user_id, status);
create index organization_memberships_organization_idx on public.organization_memberships(organization_id, status);

-- Every existing tenant profile becomes its first membership.
insert into public.organization_memberships (organization_id, user_id, role, status, created_at, updated_at)
select s.organization_id, p.id, p.role, 'active', p.created_at, now()
from public.profiles p
join public.stores s on s.id = p.store_id
on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();

alter table public.organization_memberships enable row level security;
create policy "users view their memberships" on public.organization_memberships for select
using (user_id = auth.uid());
create policy "tenant admins view memberships" on public.organization_memberships for select
using (organization_id = public.current_organization_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "tenant admins manage memberships" on public.organization_memberships for all
using (organization_id = public.current_organization_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (organization_id = public.current_organization_id() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create or replace function public.current_user_memberships()
returns table(organization_id uuid, organization_name text, role public.app_role, status public.membership_status)
language sql stable security definer set search_path = public as $$
  select m.organization_id, o.name, m.role, m.status
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by o.name
$$;
grant execute on function public.current_user_memberships() to authenticated;
