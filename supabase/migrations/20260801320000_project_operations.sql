-- Operational records belonging to a service project/contract.
create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  description text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  spent_at date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_expenses_job_idx on public.project_expenses(service_job_id, spent_at desc);
alter table public.project_expenses enable row level security;
drop policy if exists "store staff manage project expenses" on public.project_expenses;
create policy "store staff manage project expenses" on public.project_expenses for all to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_job_id, profile_id)
);
alter table public.project_assignments enable row level security;
drop policy if exists "store staff manage project assignments" on public.project_assignments;
create policy "store staff manage project assignments" on public.project_assignments for all to authenticated
  using (exists (select 1 from public.service_jobs j where j.id = service_job_id and j.store_id = public.current_store_id()))
  with check (exists (select 1 from public.service_jobs j where j.id = service_job_id and j.store_id = public.current_store_id()));
