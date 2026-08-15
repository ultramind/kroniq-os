create table public.cash_shifts (
  id uuid primary key, store_id uuid not null references public.stores, cashier_id uuid not null references public.profiles,
  opened_at timestamptz not null, opening_cash_kobo bigint not null, closed_at timestamptz, counted_cash_kobo bigint, expected_cash_kobo bigint, variance_kobo bigint
);
alter table public.cash_shifts enable row level security;
create policy "staff see own store shifts" on public.cash_shifts for select using (store_id = public.current_store_id());

create or replace function public.open_cash_shift(p_shift jsonb) returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid;
begin select store_id into current_store from public.profiles where id = auth.uid(); if current_store is null then raise exception 'Staff profile required'; end if;
insert into public.cash_shifts (id, store_id, cashier_id, opened_at, opening_cash_kobo) values ((p_shift->>'id')::uuid, current_store, auth.uid(), (p_shift->>'openedAt')::timestamptz, round((p_shift->>'openingCash')::numeric * 100)) on conflict (id) do nothing; end $$;

create or replace function public.close_cash_shift(p_shift_id uuid, p_closure jsonb) returns void language plpgsql security definer set search_path = public as $$
declare current_store uuid;
begin select store_id into current_store from public.profiles where id = auth.uid(); if current_store is null then raise exception 'Staff profile required'; end if;
update public.cash_shifts set closed_at = (p_closure->>'closedAt')::timestamptz, counted_cash_kobo = round((p_closure->>'countedCash')::numeric * 100), expected_cash_kobo = round((p_closure->>'expectedCash')::numeric * 100), variance_kobo = round((p_closure->>'variance')::numeric * 100) where id = p_shift_id and store_id = current_store and closed_at is null; if not found and not exists (select 1 from public.cash_shifts where id = p_shift_id and closed_at is not null) then raise exception 'Shift not found'; end if; end $$;
