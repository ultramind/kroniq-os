-- Sends sales changes to connected POS dashboards. The normal 30-second pull remains a fallback.
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel publication_rel
    join pg_publication publication on publication.oid = publication_rel.prpubid
    where publication.pubname = 'supabase_realtime'
      and publication_rel.prrelid = 'public.sales'::regclass
  ) then
    execute 'alter publication supabase_realtime add table public.sales';
  end if;
end $$;
