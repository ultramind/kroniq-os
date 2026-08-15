-- Internal AltraMorph platform roles. Existing platform administrators remain owners.
alter table public.platform_admins add column if not exists platform_role text not null default 'owner' check (platform_role in ('owner', 'operator', 'support', 'finance', 'viewer'));

create or replace function public.current_platform_role()
returns text language sql stable security definer set search_path = public as $$
  select platform_role from public.platform_admins where user_id = auth.uid()
$$;
grant execute on function public.current_platform_role() to authenticated;

create or replace function public.set_platform_admin_role(p_user_id uuid, p_platform_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_previous text;
begin
  if public.current_platform_role() <> 'owner' then raise exception 'Only platform owners can change platform roles'; end if;
  if p_platform_role not in ('owner', 'operator', 'support', 'finance', 'viewer') then raise exception 'Invalid platform role'; end if;
  select platform_role into v_previous from public.platform_admins where user_id = p_user_id for update;
  if v_previous is null then raise exception 'Platform administrator not found'; end if;
  update public.platform_admins set platform_role = p_platform_role where user_id = p_user_id;
  insert into public.platform_audit_events(actor_id, action, before_data, after_data)
  values(auth.uid(), 'platform_role_changed', jsonb_build_object('user_id', p_user_id, 'role', v_previous), jsonb_build_object('user_id', p_user_id, 'role', p_platform_role));
end $$;
grant execute on function public.set_platform_admin_role(uuid, text) to authenticated;

create or replace function public.platform_team()
returns table(user_id uuid, email text, platform_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  return query select a.user_id, u.email::text, a.platform_role, a.created_at from public.platform_admins a join auth.users u on u.id = a.user_id order by a.created_at;
end $$;
grant execute on function public.platform_team() to authenticated;
