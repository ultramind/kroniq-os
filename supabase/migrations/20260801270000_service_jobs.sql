create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  service_id uuid references public.service_catalogue(id) on delete set null,
  current_stage_id uuid references public.service_workflow_stages(id) on delete set null,
  title text not null,
  description text,
  quoted_amount_kobo bigint not null default 0 check (quoted_amount_kobo >= 0),
  due_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_jobs_store_created_idx on public.service_jobs(store_id, created_at desc);
create index if not exists service_jobs_customer_idx on public.service_jobs(customer_id);
alter table public.service_jobs enable row level security;
drop policy if exists "store staff manage service jobs" on public.service_jobs;
create policy "store staff manage service jobs" on public.service_jobs for all to authenticated using (store_id = public.current_store_id()) with check (store_id = public.current_store_id());

create table if not exists public.service_job_stage_history (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  stage_id uuid references public.service_workflow_stages(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.service_job_stage_history enable row level security;
drop policy if exists "store staff manage service job history" on public.service_job_stage_history;
create policy "store staff manage service job history" on public.service_job_stage_history for all to authenticated
using (exists (select 1 from public.service_jobs j where j.id = service_job_id and j.store_id = public.current_store_id()))
with check (exists (select 1 from public.service_jobs j where j.id = service_job_id and j.store_id = public.current_store_id()));
