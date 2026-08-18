-- A user chooses an active company after authenticating. The compatibility profile
-- remains the active POS workspace used by the existing RLS policies and RPCs.
create or replace function public.activate_organization_workspace(p_organization_id uuid)
returns table(store_id uuid, role public.app_role, organization_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_name text;
begin
  select m.role, o.name
  into v_role, v_name
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_role is null then
    raise exception 'You do not have active access to this company';
  end if;

  select s.id into v_store_id
  from public.stores s
  where s.organization_id = p_organization_id
    and s.status = 'active'
  order by s.is_primary desc, s.created_at
  limit 1;

  if v_store_id is null then
    raise exception 'This company has no active store';
  end if;

  update public.profiles
  set store_id = v_store_id, role = v_role
  where id = auth.uid();

  if not found then
    raise exception 'A staff profile is required before selecting a company';
  end if;

  return query select v_store_id, v_role, v_name;
end;
$$;

grant execute on function public.activate_organization_workspace(uuid) to authenticated;
