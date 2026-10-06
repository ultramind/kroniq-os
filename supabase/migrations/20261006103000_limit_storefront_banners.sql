-- A homepage can contain up to two dedicated promotional banners.
create or replace function public.enforce_storefront_banner_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_banner_count integer;
begin
  if new.section_type <> 'banner' then
    return new;
  end if;

  select count(*) into v_banner_count
  from public.storefront_sections section
  where section.store_id = new.store_id
    and section.section_type = 'banner'
    and section.id <> coalesce(new.id, gen_random_uuid());

  if v_banner_count >= 2 then
    raise exception 'A storefront can have a maximum of two homepage banners';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_storefront_banner_limit on public.storefront_sections;
create trigger enforce_storefront_banner_limit
before insert or update of section_type, store_id on public.storefront_sections
for each row execute function public.enforce_storefront_banner_limit();
