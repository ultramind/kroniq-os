-- An organisation may operate retail, services, or both.
alter table public.organizations add column if not exists business_modes text[] not null default array['retail']::text[];
update public.organizations set business_modes = array['retail']::text[] where business_modes is null or cardinality(business_modes) = 0;
alter table public.organizations drop constraint if exists organizations_business_modes_valid;
alter table public.organizations add constraint organizations_business_modes_valid check (
  cardinality(business_modes) between 1 and 2
  and business_modes <@ array['retail', 'services']::text[]
);
