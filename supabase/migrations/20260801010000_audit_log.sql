create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores,
  actor_id uuid references public.profiles,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('created', 'updated', 'deleted')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_store_created_idx on public.audit_events(store_id, created_at desc);
alter table public.audit_events enable row level security;
create policy "admins view own store audit events" on public.audit_events
  for select using (
    store_id = public.current_store_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare record_data jsonb; previous_data jsonb; record_store uuid; record_id uuid;
begin
  record_data := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
  previous_data := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
  record_store := coalesce((record_data->>'store_id')::uuid, (previous_data->>'store_id')::uuid);
  record_id := coalesce((record_data->>'id')::uuid, (previous_data->>'id')::uuid);
  if record_store is not null then
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

create trigger audit_products after insert or update or delete on public.products for each row execute function public.write_audit_event();
create trigger audit_sales after insert or update or delete on public.sales for each row execute function public.write_audit_event();
create trigger audit_stock_movements after insert or update or delete on public.stock_movements for each row execute function public.write_audit_event();
create trigger audit_supplier_deliveries after insert or update or delete on public.supplier_deliveries for each row execute function public.write_audit_event();
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.write_audit_event();
create trigger audit_credit_payments after insert or update or delete on public.credit_payments for each row execute function public.write_audit_event();
create trigger audit_cash_shifts after insert or update or delete on public.cash_shifts for each row execute function public.write_audit_event();
