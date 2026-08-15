-- Support, safety, and operational control for the AltraMorph SaaS platform.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  assigned_to uuid references auth.users(id),
  subject text not null check (char_length(trim(subject)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 10 and 4000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index support_tickets_organization_idx on public.support_tickets(organization_id, created_at desc);
alter table public.support_tickets enable row level security;
create policy "organisation members view their support tickets" on public.support_tickets for select using (organization_id = public.current_organization_id());
create policy "platform admins manage support tickets" on public.support_tickets for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.create_support_ticket(p_subject text, p_description text, p_priority text default 'normal')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ticket_id uuid; v_organization_id uuid;
begin
  v_organization_id := public.current_organization_id();
  if v_organization_id is null then raise exception 'Organisation membership required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  insert into public.support_tickets(organization_id, created_by, subject, description, priority)
  values(v_organization_id, auth.uid(), trim(p_subject), trim(p_description), p_priority)
  returning id into v_ticket_id;
  insert into public.platform_audit_events(actor_id, organization_id, action, after_data)
  values(auth.uid(), v_organization_id, 'support_ticket_created', jsonb_build_object('ticket_id', v_ticket_id, 'priority', p_priority));
  return v_ticket_id;
end $$;
grant execute on function public.create_support_ticket(text, text, text) to authenticated;

create table public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_admin_id uuid not null references auth.users(id),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text
);
create index platform_support_sessions_active_idx on public.platform_support_sessions(organization_id, expires_at) where ended_at is null;
alter table public.platform_support_sessions enable row level security;
create policy "platform admins view support sessions" on public.platform_support_sessions for select using (public.is_platform_admin());

create or replace function public.begin_platform_support_session(p_organization_id uuid, p_reason text, p_minutes integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_expires_at timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_minutes < 5 or p_minutes > 60 then raise exception 'Support access must be between 5 and 60 minutes'; end if;
  if not exists(select 1 from public.organizations where id = p_organization_id) then raise exception 'Organisation not found'; end if;
  v_expires_at := now() + make_interval(mins => p_minutes);
  insert into public.platform_support_sessions(organization_id, platform_admin_id, reason, expires_at)
  values(p_organization_id, auth.uid(), trim(p_reason), v_expires_at) returning id into v_session_id;
  insert into public.platform_audit_events(actor_id, organization_id, action, after_data)
  values(auth.uid(), p_organization_id, 'support_access_started', jsonb_build_object('session_id', v_session_id, 'expires_at', v_expires_at, 'reason', trim(p_reason)));
  return v_session_id;
end $$;

create or replace function public.end_platform_support_session(p_session_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_organization_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  update public.platform_support_sessions set ended_at = now(), ended_reason = nullif(trim(p_reason), '')
  where id = p_session_id and ended_at is null and platform_admin_id = auth.uid()
  returning organization_id into v_organization_id;
  if v_organization_id is null then raise exception 'Active support session not found'; end if;
  insert into public.platform_audit_events(actor_id, organization_id, action, after_data)
  values(auth.uid(), v_organization_id, 'support_access_ended', jsonb_build_object('session_id', p_session_id, 'reason', nullif(trim(p_reason), '')));
end $$;
grant execute on function public.begin_platform_support_session(uuid, text, integer) to authenticated;
grant execute on function public.end_platform_support_session(uuid, text) to authenticated;

create table public.maintenance_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  message text not null check (char_length(trim(message)) between 3 and 1000),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'draft' check (status in ('draft', 'active', 'resolved')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_notices enable row level security;
create policy "authenticated users read active notices" on public.maintenance_notices for select to authenticated using (status = 'active' and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "platform admins manage notices" on public.maintenance_notices for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create table public.platform_operations (
  operation_key text primary key check (operation_key in ('email_templates', 'sending_domain', 'backups', 'monitoring', 'error_tracking', 'ci_cd')),
  display_name text not null,
  status text not null default 'not_configured' check (status in ('not_configured', 'configured', 'healthy', 'degraded')),
  details text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.platform_operations(operation_key, display_name) values
  ('email_templates', 'Email templates'), ('sending_domain', 'Sending domain'), ('backups', 'Database backups'), ('monitoring', 'Uptime monitoring'), ('error_tracking', 'Error tracking'), ('ci_cd', 'CI/CD pipeline')
on conflict(operation_key) do nothing;
alter table public.platform_operations enable row level security;
create policy "platform admins manage operations" on public.platform_operations for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.update_platform_operation(p_operation_key text, p_status text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_status not in ('not_configured', 'configured', 'healthy', 'degraded') then raise exception 'Invalid operation status'; end if;
  update public.platform_operations set status = p_status, details = nullif(trim(p_details), ''), updated_by = auth.uid(), updated_at = now() where operation_key = p_operation_key;
  if not found then raise exception 'Unknown operation'; end if;
  insert into public.platform_audit_events(actor_id, action, after_data) values(auth.uid(), 'platform_operation_updated', jsonb_build_object('operation', p_operation_key, 'status', p_status));
end $$;
grant execute on function public.update_platform_operation(text, text, text) to authenticated;
