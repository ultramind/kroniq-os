-- Applies the stores RLS protection to projects that already ran the initial migration.
alter table public.stores enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stores' and policyname = 'staff see own store') then
    create policy "staff see own store" on public.stores for select using (id = public.current_store_id());
  end if;
end $$;
