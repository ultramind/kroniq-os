-- Keep read policies scoped to the selected workspace. For mutations, verify
-- the caller's active organisation membership against the actual record store.
create or replace function public.has_active_store_membership(
  p_store_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores store
    join public.organization_memberships membership on membership.organization_id = store.organization_id
    where store.id = p_store_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and (p_roles is null or membership.role::text = any(p_roles))
  );
$$;

grant execute on function public.has_active_store_membership(uuid, text[]) to authenticated;

create or replace function public.has_active_storage_store_membership(
  p_object_name text,
  p_roles text[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  begin
    v_store_id := split_part(p_object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.has_active_store_membership(v_store_id, p_roles);
end;
$$;

grant execute on function public.has_active_storage_store_membership(text, text[]) to authenticated;

create or replace function public.storage_object_has_entitlement(
  p_object_name text,
  p_entitlement text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_organization_id uuid;
begin
  begin
    v_store_id := split_part(p_object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  select organization_id into v_organization_id from public.stores where id = v_store_id;
  return v_organization_id is not null and public.organization_has_entitlement(v_organization_id, p_entitlement);
end;
$$;

grant execute on function public.storage_object_has_entitlement(text, text) to authenticated;

-- Catalogue and packaging: only managers and admins can mutate records.
drop policy if exists "managers and admins manage products" on public.products;
create policy "active managers manage products" on public.products for insert to authenticated
  with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers update products" on public.products for update to authenticated
  using (public.has_active_store_membership(store_id, array['admin', 'manager']))
  with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers delete products" on public.products for delete to authenticated
  using (public.has_active_store_membership(store_id, array['admin', 'manager']));

drop policy if exists "managers manage own store categories" on public.categories;
create policy "active managers add categories" on public.categories for insert to authenticated with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers update categories" on public.categories for update to authenticated using (public.has_active_store_membership(store_id, array['admin', 'manager'])) with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers delete categories" on public.categories for delete to authenticated using (public.has_active_store_membership(store_id, array['admin', 'manager']));

drop policy if exists "managers manage product packaging" on public.product_packaging;
create policy "active managers add product packaging" on public.product_packaging for insert to authenticated with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers update product packaging" on public.product_packaging for update to authenticated using (public.has_active_store_membership(store_id, array['admin', 'manager'])) with check (public.has_active_store_membership(store_id, array['admin', 'manager']));
create policy "active managers delete product packaging" on public.product_packaging for delete to authenticated using (public.has_active_store_membership(store_id, array['admin', 'manager']));

-- Customers and service workflows: keep the original staff permissions, but
-- validate tenant membership rather than the compatibility profile pointer.
drop policy if exists "store staff manage customers" on public.customers;
create policy "active staff add customers" on public.customers for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update customers" on public.customers for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete customers" on public.customers for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store staff manage service catalogue" on public.service_catalogue;
create policy "active staff add service catalogue" on public.service_catalogue for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update service catalogue" on public.service_catalogue for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete service catalogue" on public.service_catalogue for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store admins manage service workflow stages" on public.service_workflow_stages;
create policy "active staff add service workflow stages" on public.service_workflow_stages for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update service workflow stages" on public.service_workflow_stages for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete service workflow stages" on public.service_workflow_stages for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store staff manage service jobs" on public.service_jobs;
create policy "active staff add service jobs" on public.service_jobs for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update service jobs" on public.service_jobs for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete service jobs" on public.service_jobs for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store staff manage service job history" on public.service_job_stage_history;
create policy "active staff add service job history" on public.service_job_stage_history for insert to authenticated
  with check (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  ));
create policy "active staff update service job history" on public.service_job_stage_history for update to authenticated
  using (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  )) with check (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  ));
create policy "active staff delete service job history" on public.service_job_stage_history for delete to authenticated
  using (exists (select 1 from public.service_jobs job where job.id = service_job_id and public.has_active_store_membership(job.store_id)));

drop policy if exists "store staff manage project payments" on public.project_payments;
create policy "active staff add project payments" on public.project_payments for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update project payments" on public.project_payments for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete project payments" on public.project_payments for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store staff manage project expenses" on public.project_expenses;
create policy "active staff add project expenses" on public.project_expenses for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update project expenses" on public.project_expenses for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete project expenses" on public.project_expenses for delete to authenticated using (public.has_active_store_membership(store_id));

drop policy if exists "store staff manage project assignments" on public.project_assignments;
create policy "active staff add project assignments" on public.project_assignments for insert to authenticated
  with check (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  ));
create policy "active staff update project assignments" on public.project_assignments for update to authenticated
  using (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  )) with check (exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  ));
create policy "active staff delete project assignments" on public.project_assignments for delete to authenticated
  using (exists (select 1 from public.service_jobs job where job.id = service_job_id and public.has_active_store_membership(job.store_id)));

drop policy if exists "project documents store access" on public.project_documents;
create policy "active staff add project documents" on public.project_documents for insert to authenticated with check (public.has_active_store_membership(store_id));
create policy "active staff update project documents" on public.project_documents for update to authenticated using (public.has_active_store_membership(store_id)) with check (public.has_active_store_membership(store_id));
create policy "active staff delete project documents" on public.project_documents for delete to authenticated using (public.has_active_store_membership(store_id));

-- Storefront controls stay admin-only.
drop policy if exists "store admins manage storefront" on public.storefronts;
create policy "active admins add storefront" on public.storefronts for insert to authenticated with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins update storefront" on public.storefronts for update to authenticated using (public.has_active_store_membership(store_id, array['admin'])) with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins delete storefront" on public.storefronts for delete to authenticated using (public.has_active_store_membership(store_id, array['admin']));

drop policy if exists "store admins manage storefront sections" on public.storefront_sections;
create policy "active admins add storefront sections" on public.storefront_sections for insert to authenticated with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins update storefront sections" on public.storefront_sections for update to authenticated using (public.has_active_store_membership(store_id, array['admin'])) with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins delete storefront sections" on public.storefront_sections for delete to authenticated using (public.has_active_store_membership(store_id, array['admin']));

drop policy if exists "store admins manage storefront testimonials" on public.storefront_testimonials;
create policy "active admins add storefront testimonials" on public.storefront_testimonials for insert to authenticated with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins update storefront testimonials" on public.storefront_testimonials for update to authenticated using (public.has_active_store_membership(store_id, array['admin'])) with check (public.has_active_store_membership(store_id, array['admin']));
create policy "active admins delete storefront testimonials" on public.storefront_testimonials for delete to authenticated using (public.has_active_store_membership(store_id, array['admin']));

-- File uploads use the store id encoded in their path. Preserve public reads
-- where intended, but authorise writes through active membership.
drop policy if exists "staff upload own store product images" on storage.objects;
drop policy if exists "staff update own store product images" on storage.objects;
create policy "active managers upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_active_storage_store_membership(name, array['admin', 'manager']));
create policy "active managers update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_active_storage_store_membership(name, array['admin', 'manager']))
  with check (bucket_id = 'product-images' and public.has_active_storage_store_membership(name, array['admin', 'manager']));

drop policy if exists "storefront image upload by store" on storage.objects;
drop policy if exists "storefront image update by store" on storage.objects;
drop policy if exists "storefront image delete by store" on storage.objects;
create policy "active admins upload storefront images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'storefront-images'
    and public.has_active_storage_store_membership(name, array['admin'])
    and (split_part(name, '/', 2) <> 'logo' or public.storage_object_has_entitlement(name, 'storefront_branding'))
  );
create policy "active admins update storefront images" on storage.objects for update to authenticated
  using (bucket_id = 'storefront-images' and public.has_active_storage_store_membership(name, array['admin']))
  with check (
    bucket_id = 'storefront-images'
    and public.has_active_storage_store_membership(name, array['admin'])
    and (split_part(name, '/', 2) <> 'logo' or public.storage_object_has_entitlement(name, 'storefront_branding'))
  );
create policy "active admins delete storefront images" on storage.objects for delete to authenticated
  using (
    bucket_id = 'storefront-images'
    and public.has_active_storage_store_membership(name, array['admin'])
    and (split_part(name, '/', 2) <> 'logo' or public.storage_object_has_entitlement(name, 'storefront_branding'))
  );

drop policy if exists "project documents storage upload" on storage.objects;
drop policy if exists "project documents storage delete" on storage.objects;
create policy "active staff upload project documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents' and public.has_active_storage_store_membership(name));
create policy "active staff delete project documents" on storage.objects for delete to authenticated
  using (bucket_id = 'project-documents' and public.has_active_storage_store_membership(name));

drop policy if exists "store admins update own store" on public.stores;
create policy "active admins update stores" on public.stores for update to authenticated
  using (public.has_active_store_membership(id, array['admin']))
  with check (public.has_active_store_membership(id, array['admin']));
