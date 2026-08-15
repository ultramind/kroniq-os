create table if not exists public.service_catalogue (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  default_price_kobo bigint not null default 0 check (default_price_kobo >= 0),
  estimated_duration_minutes integer check (estimated_duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_catalogue_store_name_idx on public.service_catalogue(store_id, name);
alter table public.service_catalogue enable row level security;
drop policy if exists "store staff manage service catalogue" on public.service_catalogue;
create policy "store staff manage service catalogue" on public.service_catalogue for all to authenticated using (store_id = public.current_store_id()) with check (store_id = public.current_store_id());

create table if not exists public.service_workflow_stages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);
create index if not exists service_workflow_stages_store_position_idx on public.service_workflow_stages(store_id, position);
alter table public.service_workflow_stages enable row level security;
drop policy if exists "store admins manage service workflow stages" on public.service_workflow_stages;
create policy "store admins manage service workflow stages" on public.service_workflow_stages for all to authenticated using (store_id = public.current_store_id()) with check (store_id = public.current_store_id());
