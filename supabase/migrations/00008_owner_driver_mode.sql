-- Keep the existing four-argument bootstrap function for backwards
-- compatibility and add an explicit owner-driver mode for new accounts.
create or replace function public.bootstrap_organization_with_owner(
  input_name text,
  input_slug text,
  input_currency char(3),
  input_timezone text,
  input_create_owner_driver boolean
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  new_organization_id uuid;
  owner_display_name text;
  new_driver_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  new_organization_id := public.bootstrap_organization_with_owner(
    input_name,
    input_slug,
    input_currency,
    input_timezone
  );

  if coalesce(input_create_owner_driver, false) then
    select coalesce(nullif(trim(profile.display_name), ''), 'Владелец')
    into owner_display_name
    from public.profiles profile
    where profile.id = auth.uid();

    insert into public.drivers (organization_id, profile_id, display_name, status)
    values (new_organization_id, auth.uid(), owner_display_name, 'ACTIVE')
    returning id into new_driver_id;

    insert into public.audit_events (
      organization_id,
      entity_type,
      entity_id,
      action,
      actor_user_id,
      source,
      after_data
    )
    values (
      new_organization_id,
      'driver',
      new_driver_id,
      'OWNER_DRIVER_ENABLED',
      auth.uid(),
      'WEB',
      jsonb_build_object('profile_id', auth.uid())
    );
  end if;

  return new_organization_id;
end;
$$;

revoke all on function public.bootstrap_organization_with_owner(text, text, char(3), text, boolean) from public;
grant execute on function public.bootstrap_organization_with_owner(text, text, char(3), text, boolean) to authenticated;

-- Existing owners can opt into the same mode without opening a new account.
create or replace function public.enable_owner_driver_mode(p_organization_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  owner_display_name text;
  owner_driver_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE'
  ) then
    raise exception 'Active owner membership required';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Владелец')
  into owner_display_name
  from public.profiles profile
  where profile.id = auth.uid();

  insert into public.drivers (organization_id, profile_id, display_name, status)
  values (p_organization_id, auth.uid(), owner_display_name, 'ACTIVE')
  on conflict (organization_id, profile_id) do update
  set display_name = excluded.display_name,
      status = 'ACTIVE',
      deleted_at = null,
      updated_at = now()
  returning id into owner_driver_id;

  insert into public.audit_events (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    source,
    after_data
  )
  values (
    p_organization_id,
    'driver',
    owner_driver_id,
    'OWNER_DRIVER_ENABLED',
    auth.uid(),
    'WEB',
    jsonb_build_object('profile_id', auth.uid())
  );

  return owner_driver_id;
end;
$$;

revoke all on function public.enable_owner_driver_mode(uuid) from public;
grant execute on function public.enable_owner_driver_mode(uuid) to authenticated;
