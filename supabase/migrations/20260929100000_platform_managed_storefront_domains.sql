-- Platform-managed custom domains for Growth storefronts. DNS and Vercel
-- attachment remain an audited platform-admin operation.
create table if not exists public.storefront_custom_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  domain text not null unique,
  status text not null default 'requested'
    check (status in ('requested', 'dns_required', 'verifying', 'active', 'failed', 'removed')),
  dns_record_type text,
  dns_record_name text,
  dns_record_value text,
  provider_reference text,
  failure_message text,
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_custom_domains_domain_format check (
    domain = lower(domain)
    and domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    and domain not like '%.%.'
    and length(domain) <= 253
  )
);

create index if not exists storefront_custom_domains_status_idx
  on public.storefront_custom_domains(status, requested_at desc);

alter table public.storefront_custom_domains enable row level security;

drop policy if exists "store members view custom domain" on public.storefront_custom_domains;
create policy "store members view custom domain"
  on public.storefront_custom_domains for select to authenticated
  using (store_id = public.current_store_id());

drop policy if exists "platform admins view custom domains" on public.storefront_custom_domains;
create policy "platform admins view custom domains"
  on public.storefront_custom_domains for select to authenticated
  using (public.is_platform_admin());

-- Custom domains are a Growth-and-higher entitlement. Trial tenants retain
-- their full feature preview through organization_has_entitlement.
update public.subscription_plans
set entitlements = case
  when entitlements ? 'online_storefront' and not (entitlements ? 'custom_domains')
    then entitlements || jsonb_build_array('custom_domains')
  else entitlements
end
where code in ('growth', 'business', 'enterprise');

update public.subscription_plans
set features = features || jsonb_build_array('Platform-managed custom domain and SSL')
where code in ('growth', 'business', 'enterprise')
  and not (features ? 'Platform-managed custom domain and SSL');

create or replace function public.request_current_storefront_domain(p_domain text)
returns table(id uuid, domain text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_organization_id uuid;
  v_role public.app_role;
  v_domain text;
  v_existing_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'An authenticated administrator is required';
  end if;

  select profile.store_id, store.organization_id, profile.role
    into v_store_id, v_organization_id, v_role
  from public.profiles profile
  join public.stores store on store.id = profile.store_id
  where profile.id = auth.uid();

  if v_store_id is null or v_role <> 'admin' then
    raise exception 'Only store administrators can request a custom domain';
  end if;
  if not public.organization_has_entitlement(v_organization_id, 'custom_domains') then
    raise exception 'A Growth plan or higher is required for a custom domain';
  end if;

  v_domain := lower(trim(regexp_replace(regexp_replace(coalesce(p_domain, ''), '^https?://', '', 'i'), '/+$', '', 'g')));
  v_domain := regexp_replace(v_domain, '^www\.', '');
  if v_domain !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or v_domain like '%.%.' or v_domain not like '%.%' then
    raise exception 'Enter a valid root domain, for example kohaels.com';
  end if;

  select custom_domain.store_id
    into v_existing_store_id
  from public.storefront_custom_domains custom_domain
  where custom_domain.domain = v_domain
    and custom_domain.status <> 'removed';

  if v_existing_store_id is not null and v_existing_store_id <> v_store_id then
    raise exception 'This domain is already assigned to another storefront';
  end if;

  insert into public.storefront_custom_domains (
    store_id, domain, status, requested_by, requested_at, reviewed_by,
    reviewed_at, verified_at, dns_record_type, dns_record_name, dns_record_value,
    provider_reference, failure_message, updated_at
  )
  values (v_store_id, v_domain, 'requested', auth.uid(), now(), null, null, null, null, null, null, null, null, now())
  on conflict (store_id) do update set
    domain = excluded.domain,
    status = 'requested',
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    reviewed_by = null,
    reviewed_at = null,
    verified_at = null,
    dns_record_type = null,
    dns_record_name = null,
    dns_record_value = null,
    provider_reference = null,
    failure_message = null,
    updated_at = now()
  returning storefront_custom_domains.id, storefront_custom_domains.domain, storefront_custom_domains.status
  into id, domain, status;

  insert into public.platform_audit_events(actor_id, organization_id, action, after_data)
  values (auth.uid(), v_organization_id, 'storefront_custom_domain_requested', jsonb_build_object('domain', v_domain));

  return next;
end;
$$;

create or replace function public.current_storefront_custom_domain()
returns table(
  id uuid,
  domain text,
  status text,
  dns_record_type text,
  dns_record_name text,
  dns_record_value text,
  failure_message text,
  requested_at timestamptz,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select custom_domain.id, custom_domain.domain, custom_domain.status,
    custom_domain.dns_record_type, custom_domain.dns_record_name,
    custom_domain.dns_record_value, custom_domain.failure_message,
    custom_domain.requested_at, custom_domain.verified_at
  from public.storefront_custom_domains custom_domain
  where custom_domain.store_id = public.current_store_id()
    and custom_domain.status <> 'removed'
  limit 1;
$$;

create or replace function public.platform_storefront_custom_domains(p_organization_id uuid)
returns table(
  id uuid,
  store_id uuid,
  store_name text,
  domain text,
  status text,
  dns_record_type text,
  dns_record_name text,
  dns_record_value text,
  provider_reference text,
  failure_message text,
  requested_at timestamptz,
  verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;

  return query
  select custom_domain.id, custom_domain.store_id, store.name, custom_domain.domain,
    custom_domain.status, custom_domain.dns_record_type, custom_domain.dns_record_name,
    custom_domain.dns_record_value, custom_domain.provider_reference,
    custom_domain.failure_message, custom_domain.requested_at, custom_domain.verified_at
  from public.storefront_custom_domains custom_domain
  join public.stores store on store.id = custom_domain.store_id
  where store.organization_id = p_organization_id
    and custom_domain.status <> 'removed'
  order by custom_domain.requested_at desc;
end;
$$;

create or replace function public.update_platform_storefront_custom_domain(
  p_domain_id uuid,
  p_status text,
  p_dns_record_type text default null,
  p_dns_record_name text default null,
  p_dns_record_value text default null,
  p_provider_reference text default null,
  p_failure_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_before jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if p_status not in ('requested', 'dns_required', 'verifying', 'active', 'failed', 'removed') then
    raise exception 'Invalid custom domain status';
  end if;

  select store.organization_id,
      jsonb_build_object('domain', custom_domain.domain, 'status', custom_domain.status)
    into v_organization_id, v_before
  from public.storefront_custom_domains custom_domain
  join public.stores store on store.id = custom_domain.store_id
  where custom_domain.id = p_domain_id;

  if v_organization_id is null then
    raise exception 'Custom domain request not found';
  end if;

  update public.storefront_custom_domains
  set
    status = p_status,
    dns_record_type = nullif(trim(coalesce(p_dns_record_type, '')), ''),
    dns_record_name = nullif(trim(coalesce(p_dns_record_name, '')), ''),
    dns_record_value = nullif(trim(coalesce(p_dns_record_value, '')), ''),
    provider_reference = nullif(trim(coalesce(p_provider_reference, '')), ''),
    failure_message = nullif(trim(coalesce(p_failure_message, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    verified_at = case when p_status = 'active' then coalesce(verified_at, now()) else null end,
    updated_at = now()
  where id = p_domain_id;

  insert into public.platform_audit_events(actor_id, organization_id, action, before_data, after_data)
  values (
    auth.uid(), v_organization_id, 'storefront_custom_domain_updated', v_before,
    jsonb_build_object('status', p_status)
  );
end;
$$;

-- This is intentionally public and returns only a published storefront slug.
-- It lets the web app resolve an active custom hostname without exposing tenant data.
create or replace function public.public_storefront_slug_by_domain(p_domain text)
returns table(slug text)
language sql
stable
security definer
set search_path = public
as $$
  select storefront.slug
  from public.storefront_custom_domains custom_domain
  join public.storefronts storefront on storefront.store_id = custom_domain.store_id
  join public.stores store on store.id = storefront.store_id
  where custom_domain.domain = lower(trim(regexp_replace(coalesce(p_domain, ''), '^www\.', '')))
    and custom_domain.status = 'active'
    and storefront.enabled
    and public.organization_has_entitlement(store.organization_id, 'online_storefront')
  limit 1;
$$;

grant execute on function public.request_current_storefront_domain(text) to authenticated;
grant execute on function public.current_storefront_custom_domain() to authenticated;
grant execute on function public.platform_storefront_custom_domains(uuid) to authenticated;
grant execute on function public.update_platform_storefront_custom_domain(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.public_storefront_slug_by_domain(text) to anon, authenticated;
