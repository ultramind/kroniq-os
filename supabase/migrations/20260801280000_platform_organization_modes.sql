create or replace function public.set_platform_organization_business_modes(p_organization_id uuid, p_business_modes text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_previous text[];
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if cardinality(p_business_modes) not between 1 and 2 or not (p_business_modes <@ array['retail', 'services']::text[]) then raise exception 'Invalid business modes'; end if;
  select business_modes into v_previous from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organisation not found'; end if;
  update public.organizations set business_modes = p_business_modes where id = p_organization_id;
  insert into public.platform_audit_events(actor_id, organization_id, action, before_data, after_data) values (auth.uid(), p_organization_id, 'organization_business_modes_changed', jsonb_build_object('business_modes', v_previous), jsonb_build_object('business_modes', p_business_modes));
end;
$$;
grant execute on function public.set_platform_organization_business_modes(uuid, text[]) to authenticated;
