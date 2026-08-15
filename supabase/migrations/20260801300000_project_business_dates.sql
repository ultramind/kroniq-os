-- Preserve the audit timestamp while allowing legitimate backdated business records.
alter table public.service_jobs add column if not exists project_date date;
update public.service_jobs set project_date = created_at::date where project_date is null;
alter table public.service_jobs alter column project_date set not null;
alter table public.project_payments add column if not exists entered_at timestamptz not null default now();
comment on column public.service_jobs.project_date is 'Actual contract/project start date; may be backdated.';
comment on column public.project_payments.received_at is 'Actual payment date; may be backdated.';
