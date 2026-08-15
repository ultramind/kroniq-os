-- Service jobs are presented as Projects; this ledger supports deposits and instalments.
create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'credit')),
  payment_reference text,
  note text,
  received_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_payments_job_idx on public.project_payments(service_job_id, received_at desc);
alter table public.project_payments enable row level security;
drop policy if exists "store staff manage project payments" on public.project_payments;
create policy "store staff manage project payments" on public.project_payments for all to authenticated using (store_id = public.current_store_id()) with check (store_id = public.current_store_id());
