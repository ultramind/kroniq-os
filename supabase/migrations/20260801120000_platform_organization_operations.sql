alter table public.organizations add column if not exists business_email text;
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists address text;

create or replace function public.update_platform_organization_profile(
  p_organization_id uuid,
  p_name text,
  p_business_email text default null,
  p_phone text default null,
  p_address text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Organisation name is required'; end if;
  update public.organizations set name = trim(p_name), business_email = nullif(trim(p_business_email), ''), phone = nullif(trim(p_phone), ''), address = nullif(trim(p_address), '') where id = p_organization_id;
  if not found then raise exception 'Organisation not found'; end if;
  insert into public.platform_audit_events(actor_id, organization_id, action, after_data) values (auth.uid(), p_organization_id, 'organization_profile_updated', jsonb_build_object('name', trim(p_name)));
end $$;

create or replace function public.set_platform_store_status(p_store_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_organization_id uuid; v_previous text;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'Invalid store status'; end if;
  select organization_id, status into v_organization_id, v_previous from public.stores where id = p_store_id for update;
  if v_organization_id is null then raise exception 'Store not found'; end if;
  update public.stores set status = p_status where id = p_store_id;
  insert into public.platform_audit_events(actor_id, organization_id, action, before_data, after_data) values (auth.uid(), v_organization_id, 'store_status_changed', jsonb_build_object('status', v_previous), jsonb_build_object('status', p_status));
end $$;

grant execute on function public.update_platform_organization_profile(uuid, text, text, text, text) to authenticated;
grant execute on function public.set_platform_store_status(uuid, text) to authenticated;

create or replace function public.platform_organization_profile(p_organization_id uuid)
returns table (id uuid, name text, slug text, status text, business_email text, phone text, address text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  return query select o.id, o.name, o.slug, o.status, o.business_email, o.phone, o.address, o.created_at from public.organizations o where o.id = p_organization_id;
end $$;
grant execute on function public.platform_organization_profile(uuid) to authenticated;
