-- Restore membership-safe reads for service tables whose previous ALL
-- policies were split into write-only policies during the workspace update.

drop policy if exists "active staff view customers" on public.customers;
create policy "active staff view customers" on public.customers
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view service catalogue" on public.service_catalogue;
create policy "active staff view service catalogue" on public.service_catalogue
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view service workflow stages" on public.service_workflow_stages;
create policy "active staff view service workflow stages" on public.service_workflow_stages
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view service jobs" on public.service_jobs;
create policy "active staff view service jobs" on public.service_jobs
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view service job history" on public.service_job_stage_history;
create policy "active staff view service job history" on public.service_job_stage_history
for select to authenticated
using (
  exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  )
);

drop policy if exists "active staff view project payments" on public.project_payments;
create policy "active staff view project payments" on public.project_payments
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view project expenses" on public.project_expenses;
create policy "active staff view project expenses" on public.project_expenses
for select to authenticated
using (public.has_active_store_membership(store_id));

drop policy if exists "active staff view project assignments" on public.project_assignments;
create policy "active staff view project assignments" on public.project_assignments
for select to authenticated
using (
  exists (
    select 1 from public.service_jobs job
    where job.id = service_job_id and public.has_active_store_membership(job.store_id)
  )
);

drop policy if exists "active staff view project documents" on public.project_documents;
create policy "active staff view project documents" on public.project_documents
for select to authenticated
using (public.has_active_store_membership(store_id));
