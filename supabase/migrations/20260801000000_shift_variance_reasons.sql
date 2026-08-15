alter table public.cash_shifts add column if not exists variance_reason text;

create or replace function public.close_cash_shift(p_shift_id uuid, p_closure jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid;
begin
  select store_id into current_store from public.profiles where id = auth.uid();
  if current_store is null then raise exception 'Staff profile required'; end if;
  if coalesce((p_closure->>'variance')::numeric, 0) <> 0 and nullif(trim(coalesce(p_closure->>'varianceReason', '')), '') is null then
    raise exception 'A variance explanation is required';
  end if;
  update public.cash_shifts set
    closed_at = (p_closure->>'closedAt')::timestamptz,
    counted_cash_kobo = round((p_closure->>'countedCash')::numeric * 100),
    expected_cash_kobo = round((p_closure->>'expectedCash')::numeric * 100),
    variance_kobo = round((p_closure->>'variance')::numeric * 100),
    variance_reason = nullif(trim(p_closure->>'varianceReason'), '')
  where id = p_shift_id and store_id = current_store and closed_at is null;
  if not found and not exists (select 1 from public.cash_shifts where id = p_shift_id and closed_at is not null) then raise exception 'Shift not found'; end if;
end $$;
