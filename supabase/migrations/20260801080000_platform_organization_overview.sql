-- A dedicated platform read endpoint avoids tenant RLS interactions in the control plane.
create or replace function public.platform_organization_overview()
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  return query
  select o.id, o.name, o.slug, o.status, o.created_at
  from public.organizations o
  order by o.created_at desc;
end;
$$;

grant execute on function public.platform_organization_overview() to authenticated;
