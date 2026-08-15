create policy "managers manage own store categories" on public.categories
for all using (
  store_id = public.current_store_id()
  and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager'))
)
with check (
  store_id = public.current_store_id()
  and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager'))
);
