-- Platform administrators can extend an organisation's trial without changing its plan.
create or replace function public.extend_organization_trial(
  p_organization_id uuid,
  p_days integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_previous_end timestamptz;
  v_trial_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Trial extension must be between 1 and 365 days';
  end if;

  select *
    into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Organisation subscription not found';
  end if;

  if v_subscription.status not in ('trial', 'past_due') then
    raise exception 'Only trial or past-due organisations can receive a trial extension';
  end if;

  v_previous_end := v_subscription.trial_ends_at;
  v_trial_end := greatest(coalesce(v_subscription.trial_ends_at, now()), now())
    + make_interval(days => p_days);

  update public.organization_subscriptions
  set status = 'trial',
      trial_ends_at = v_trial_end,
      past_due_at = null,
      grace_period_ends_at = null,
      suspended_at = null,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.organizations
  set status = 'trial',
      updated_at = now()
  where id = p_organization_id;

  insert into public.platform_audit_events (actor_id, organization_id, action, before_data, after_data)
  values (
    auth.uid(),
    p_organization_id,
    'organization_trial_extended',
    jsonb_build_object('trial_ends_at', v_previous_end, 'status', v_subscription.status),
    jsonb_build_object('trial_ends_at', v_trial_end, 'status', 'trial', 'days_added', p_days)
  );

  return v_trial_end;
end;
$$;

grant execute on function public.extend_organization_trial(uuid, integer) to authenticated;
