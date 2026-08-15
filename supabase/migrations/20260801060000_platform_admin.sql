-- Platform control plane. These users belong to AltraMorph, not to a tenant organisation.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "platform admins see own membership" on public.platform_admins
  for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_events_created_idx on public.platform_audit_events(created_at desc);
alter table public.platform_audit_events enable row level security;

create policy "platform admins view platform audit" on public.platform_audit_events
  for select using (public.is_platform_admin());

-- Platform staff can read tenant metadata for operations, but tenant users retain
-- their existing organisation-scoped access through the policies created earlier.
create policy "platform admins view organizations" on public.organizations
  for select using (public.is_platform_admin());

create policy "platform admins view subscriptions" on public.organization_subscriptions
  for select using (public.is_platform_admin());

create policy "platform admins view stores" on public.stores
  for select using (public.is_platform_admin());

create or replace function public.set_organization_status(p_organization_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  if p_status not in ('trial', 'active', 'suspended', 'cancelled') then
    raise exception 'Invalid organization status';
  end if;

  select status into previous_status from public.organizations where id = p_organization_id for update;
  if previous_status is null then
    raise exception 'Organization not found';
  end if;

  update public.organizations set status = p_status where id = p_organization_id;
  insert into public.platform_audit_events (actor_id, organization_id, action, before_data, after_data)
  values (auth.uid(), p_organization_id, 'organization_status_changed', jsonb_build_object('status', previous_status), jsonb_build_object('status', p_status));
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.set_organization_status(uuid, text) to authenticated;

comment on table public.platform_admins is 'AltraMorph operational users. This is deliberately separate from tenant staff roles.';
