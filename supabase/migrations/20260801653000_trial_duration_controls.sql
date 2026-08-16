-- Every new trial expires after 14 days unless a platform administrator changes it.
create or replace function public.assign_default_trial_end()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'trial' and new.trial_ends_at is null then new.trial_ends_at := now() + interval '14 days'; end if;
  return new;
end;
$$;
drop trigger if exists assign_default_trial_end on public.organization_subscriptions;
create trigger assign_default_trial_end before insert on public.organization_subscriptions for each row execute function public.assign_default_trial_end();

create or replace function public.set_organization_trial(p_organization_id uuid, p_trial_ends_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare previous_data jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_trial_ends_at is not null and p_trial_ends_at <= now() then raise exception 'Trial end must be in the future'; end if;
  select jsonb_build_object('status',status,'trial_ends_at',trial_ends_at) into previous_data from public.organization_subscriptions where organization_id=p_organization_id for update;
  if previous_data is null then raise exception 'Organisation subscription not found'; end if;
  update public.organization_subscriptions set status=case when p_trial_ends_at is null then 'active' else 'trial' end, trial_ends_at=p_trial_ends_at, updated_at=now() where organization_id=p_organization_id;
  insert into public.platform_audit_events(actor_id,organization_id,action,before_data,after_data)
  values(auth.uid(),p_organization_id,'organization_trial_updated',previous_data,jsonb_build_object('trial_ends_at',p_trial_ends_at,'note',p_note));
end;
$$;
grant execute on function public.set_organization_trial(uuid,timestamptz,text) to authenticated;
