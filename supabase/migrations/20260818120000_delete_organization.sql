-- Permanent tenant deletion is restricted to platform administrators. Auth users
-- are retained so an owner can sign in and create a fresh company afterwards.
alter table public.profiles alter column store_id drop not null;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and confrelid = 'public.stores'::regclass
    and contype = 'f';
  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;
alter table public.profiles add constraint profiles_store_id_fkey foreign key (store_id) references public.stores(id) on delete set null;

-- Every operational record is owned by its branch and should disappear with it.
do $$
declare item record;
begin
  for item in
    select c.conname, n.nspname, cls.relname
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'public.stores'::regclass
      and c.conrelid <> 'public.profiles'::regclass
  loop
    execute format('alter table %I.%I drop constraint %I', item.nspname, item.relname, item.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (store_id) references public.stores(id) on delete cascade',
      item.nspname,
      item.relname,
      item.conname
    );
  end loop;
end $$;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.stores'::regclass
    and confrelid = 'public.organizations'::regclass
    and contype = 'f';
  if constraint_name is not null then
    execute format('alter table public.stores drop constraint %I', constraint_name);
  end if;
end $$;
alter table public.stores add constraint stores_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;

create or replace function public.delete_platform_organization(p_organization_id uuid, p_confirmation text)
returns void language plpgsql security definer set search_path = public as $$
declare company_name text;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  select name into company_name from public.organizations where id = p_organization_id for update;
  if company_name is null then raise exception 'Organisation not found'; end if;
  if trim(p_confirmation) <> company_name then raise exception 'Type the exact organisation name to confirm deletion'; end if;
  insert into public.platform_audit_events(actor_id, organization_id, action, before_data)
  values(auth.uid(), p_organization_id, 'organization_deleted', jsonb_build_object('name', company_name));
  delete from public.organizations where id = p_organization_id;
end;
$$;
grant execute on function public.delete_platform_organization(uuid, text) to authenticated;
