-- Deleting an organisation cascades through branch-owned records. During that
-- cascade the branch may already be gone, so do not create a tenant audit row
-- that would reference a deleted store.
create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare record_data jsonb; previous_data jsonb; record_store uuid; record_id uuid;
begin
  record_data := case TG_OP when 'DELETE' then null else to_jsonb(NEW) end;
  previous_data := case TG_OP when 'INSERT' then null else to_jsonb(OLD) end;
  record_store := coalesce((record_data->>'store_id')::uuid, (previous_data->>'store_id')::uuid);
  record_id := coalesce((record_data->>'id')::uuid, (previous_data->>'id')::uuid);
  if record_store is not null and exists (select 1 from public.stores where id = record_store) then
    insert into public.audit_events (store_id, actor_id, entity_type, entity_id, action, before_data, after_data)
    values (
      record_store,
      auth.uid(),
      TG_TABLE_NAME,
      record_id,
      case TG_OP when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
      previous_data,
      record_data
    );
  end if;
  return coalesce(NEW, OLD);
end $$;
