-- Lets every authenticated staff member print an invoice with their own tenant identity,
-- without granting direct access to every organisation record.
create or replace function public.current_store_invoice_brand()
returns table(company_name text, logo_url text)
language sql stable security definer set search_path = public as $$
  select o.name, f.logo_url
  from public.profiles p
  join public.stores s on s.id = p.store_id
  join public.organizations o on o.id = s.organization_id
  left join public.storefronts f on f.store_id = s.id
  where p.id = auth.uid();
$$;

grant execute on function public.current_store_invoice_brand() to authenticated;
