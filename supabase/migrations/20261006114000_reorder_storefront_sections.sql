create or replace function public.move_current_storefront_section(p_section_id uuid, p_direction text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store_id uuid;
  v_role public.app_role;
  v_position integer;
  v_swap_id uuid;
  v_swap_position integer;
begin
  if p_direction not in ('up', 'down') then raise exception 'Invalid direction'; end if;
  select store_id, role into v_store_id, v_role from public.profiles where id = auth.uid();
  if v_store_id is null or v_role <> 'admin' then raise exception 'Only administrators can arrange homepage sections'; end if;

  select position into v_position
  from public.storefront_sections
  where id = p_section_id and store_id = v_store_id;
  if v_position is null then raise exception 'Homepage section not found'; end if;

  if p_direction = 'up' then
    select id, position into v_swap_id, v_swap_position
    from public.storefront_sections
    where store_id = v_store_id and position < v_position
    order by position desc, created_at desc
    limit 1;
  else
    select id, position into v_swap_id, v_swap_position
    from public.storefront_sections
    where store_id = v_store_id and position > v_position
    order by position asc, created_at asc
    limit 1;
  end if;
  if v_swap_id is null then return; end if;

  update public.storefront_sections
  set position = case
    when id = p_section_id then v_swap_position
    when id = v_swap_id then v_position
    else position
  end,
  updated_at = now()
  where id in (p_section_id, v_swap_id) and store_id = v_store_id;
end;
$$;

grant execute on function public.move_current_storefront_section(uuid, text) to authenticated;
