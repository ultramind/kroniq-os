-- Optional contract/scope PDF for each project. Files are private and scoped to the tenant store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-documents', 'project-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.project_documents enable row level security;

drop policy if exists "project documents store access" on public.project_documents;
create policy "project documents store access" on public.project_documents
  for all to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());

drop policy if exists "project documents storage read" on storage.objects;
create policy "project documents storage read" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = public.current_store_id()::text);

drop policy if exists "project documents storage upload" on storage.objects;
create policy "project documents storage upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = public.current_store_id()::text);

drop policy if exists "project documents storage delete" on storage.objects;
create policy "project documents storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = public.current_store_id()::text);
