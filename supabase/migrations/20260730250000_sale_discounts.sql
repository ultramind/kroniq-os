alter table public.sales add column if not exists discount_kobo bigint not null default 0 check (discount_kobo >= 0);
alter table public.sales add column if not exists discount_reason text;
alter table public.sales add column if not exists discount_approved_by uuid references public.profiles;
