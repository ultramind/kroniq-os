-- Growth and higher can use packaging and flexible pricing.
update public.subscription_plans
set features = case code
  when 'starter' then features
  when 'growth' then features || '["Product packs and cartons","Flexible pricing with price floors"]'::jsonb
  else features || '["Product packs and cartons","Flexible pricing with price floors"]'::jsonb
end
where code in ('growth','business','enterprise');

create or replace function public.current_store_has_entitlement(p_entitlement text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_entitlement
    when 'packaging' then exists (
      select 1 from public.profiles p join public.stores s on s.id=p.store_id join public.organization_subscriptions sub on sub.organization_id=s.organization_id
      where p.id=auth.uid() and sub.plan_code in ('growth','business','enterprise') and sub.status in ('trial','active')
    )
    when 'flexible_pricing' then exists (
      select 1 from public.profiles p join public.stores s on s.id=p.store_id join public.organization_subscriptions sub on sub.organization_id=s.organization_id
      where p.id=auth.uid() and sub.plan_code in ('growth','business','enterprise') and sub.status in ('trial','active')
    )
    else false
  end;
$$;

create or replace function public.enforce_packaging_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.current_store_has_entitlement('packaging') then raise exception 'Product packs and cartons require the Growth plan or higher'; end if;
  return new;
end;
$$;
drop trigger if exists require_packaging_entitlement on public.product_packaging;
create trigger require_packaging_entitlement before insert or update on public.product_packaging for each row execute function public.enforce_packaging_entitlement();

create or replace function public.enforce_flexible_pricing_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.flexible_pricing_enabled and not public.current_store_has_entitlement('flexible_pricing') then raise exception 'Flexible pricing requires the Growth plan or higher'; end if;
  return new;
end;
$$;
drop trigger if exists require_flexible_pricing_entitlement on public.stores;
create trigger require_flexible_pricing_entitlement before update of flexible_pricing_enabled on public.stores for each row execute function public.enforce_flexible_pricing_entitlement();

create or replace function public.enforce_sale_entitlements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.packaging_id is not null and not public.current_store_has_entitlement('packaging') then raise exception 'Product packs and cartons require the Growth plan or higher'; end if;
  if new.price_override_reason is not null and not public.current_store_has_entitlement('flexible_pricing') then raise exception 'Flexible pricing requires the Growth plan or higher'; end if;
  return new;
end;
$$;
drop trigger if exists require_sale_entitlements on public.sale_items;
create trigger require_sale_entitlements before insert on public.sale_items for each row execute function public.enforce_sale_entitlements();
