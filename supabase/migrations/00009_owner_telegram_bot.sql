alter table public.profiles
  add column if not exists telegram_user_id bigint;

-- Reuse an already linked owner-driver Telegram account where the mapping is
-- unambiguous. Profiles with conflicting historical mappings stay unlinked
-- and can be connected explicitly from the owner dashboard.
with profile_candidates as (
  select driver.profile_id, min(driver.telegram_user_id) as telegram_user_id
  from public.drivers driver
  where driver.profile_id is not null
    and driver.telegram_user_id is not null
    and driver.deleted_at is null
  group by driver.profile_id
  having count(distinct driver.telegram_user_id) = 1
), unique_candidates as (
  select candidate.*
  from profile_candidates candidate
  where not exists (
    select 1
    from profile_candidates duplicate
    where duplicate.telegram_user_id = candidate.telegram_user_id
      and duplicate.profile_id <> candidate.profile_id
  )
)
update public.profiles profile
set telegram_user_id = candidate.telegram_user_id,
    updated_at = now()
from unique_candidates candidate
where profile.id = candidate.profile_id
  and profile.telegram_user_id is null;

create unique index if not exists profiles_telegram_user_id_key
  on public.profiles (telegram_user_id)
  where telegram_user_id is not null;

create table if not exists public.telegram_profile_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (used_at is null and used_by_telegram_user_id is null)
    or (used_at is not null and used_by_telegram_user_id is not null)
  )
);

create unique index if not exists telegram_profile_invites_one_open_per_profile
  on public.telegram_profile_invites (profile_id)
  where used_at is null;

alter table public.telegram_profile_invites enable row level security;

create policy telegram_profile_invites_manage_own on public.telegram_profile_invites for all
  using (
    profile_id = auth.uid()
    and public.has_org_role(
      organization_id,
      array['OWNER']::public.organization_role[]
    )
  )
  with check (
    profile_id = auth.uid()
    and created_by = auth.uid()
    and public.has_org_role(
      organization_id,
      array['OWNER']::public.organization_role[]
    )
  );

create or replace function public.claim_owner_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint
)
returns table (
  organization_id uuid,
  profile_id uuid,
  owner_name text,
  organization_name text,
  base_currency char(3)
)
language plpgsql
security definer set search_path = ''
as $$
declare
  invite public.telegram_profile_invites%rowtype;
  linked_profile public.profiles%rowtype;
  owner_driver public.drivers%rowtype;
begin
  if p_telegram_user_id <= 0
    or left(trim(p_invitation_code), 6) <> 'owner_'
    or length(trim(p_invitation_code)) < 38 then
    raise exception 'Invalid invitation';
  end if;

  select candidate.* into invite
  from public.telegram_profile_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if invite.used_at is not null and invite.used_by_telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation is already used';
  end if;
  if invite.used_at is null and invite.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = invite.organization_id
      and membership.user_id = invite.profile_id
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE'
  ) then
    raise exception 'Active owner membership not found';
  end if;

  select candidate.* into linked_profile
  from public.profiles candidate
  where candidate.id = invite.profile_id
  for update;

  if not found then
    raise exception 'Owner profile not found';
  end if;
  if linked_profile.telegram_user_id is not null
    and linked_profile.telegram_user_id <> p_telegram_user_id then
    raise exception 'Owner is already linked to another Telegram account';
  end if;
  if exists (
    select 1
    from public.profiles candidate
    where candidate.telegram_user_id = p_telegram_user_id
      and candidate.id <> linked_profile.id
  ) then
    raise exception 'Telegram account is already linked to another profile';
  end if;

  select candidate.* into owner_driver
  from public.drivers candidate
  where candidate.organization_id = invite.organization_id
    and candidate.profile_id = invite.profile_id
    and candidate.deleted_at is null
  for update;

  if found and owner_driver.telegram_user_id is not null
    and owner_driver.telegram_user_id <> p_telegram_user_id then
    raise exception 'Owner-driver is already linked to another Telegram account';
  end if;
  if exists (
    select 1
    from public.drivers candidate
    where candidate.organization_id = invite.organization_id
      and candidate.telegram_user_id = p_telegram_user_id
      and candidate.deleted_at is null
      and (owner_driver.id is null or candidate.id <> owner_driver.id)
  ) then
    raise exception 'Telegram account is already linked to another driver';
  end if;

  update public.profiles
  set telegram_user_id = p_telegram_user_id,
      updated_at = now()
  where id = linked_profile.id;

  if owner_driver.id is not null then
    update public.drivers
    set telegram_user_id = p_telegram_user_id,
        status = 'ACTIVE',
        updated_at = now()
    where id = owner_driver.id;
  end if;

  update public.telegram_profile_invites
  set used_at = coalesce(used_at, now()),
      used_by_telegram_user_id = p_telegram_user_id
  where id = invite.id;

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
    invite.organization_id,
    'profile',
    linked_profile.id,
    'OWNER_TELEGRAM_LINKED',
    linked_profile.id,
    'TELEGRAM',
    jsonb_build_object('telegram_user_id', p_telegram_user_id)
  );

  return query
  select
    organization.id,
    linked_profile.id,
    coalesce(nullif(trim(linked_profile.display_name), ''), 'Владелец'),
    organization.name,
    organization.base_currency
  from public.organizations organization
  where organization.id = invite.organization_id;
end;
$$;

-- A driver invitation also connects the authenticated profile when that driver
-- belongs to one. This makes an owner-driver immediately available in both bot
-- modes after a single invitation.
create or replace function public.claim_driver_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint
)
returns table (organization_id uuid, driver_id uuid, driver_name text, base_currency char(3))
language plpgsql
security definer set search_path = ''
as $$
declare
  invite public.telegram_driver_invites%rowtype;
  linked_driver public.drivers%rowtype;
  linked_profile public.profiles%rowtype;
begin
  if p_telegram_user_id <= 0 or length(trim(p_invitation_code)) < 32 then
    raise exception 'Invalid invitation';
  end if;

  select candidate.* into invite
  from public.telegram_driver_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if invite.used_at is not null and invite.used_by_telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation is already used';
  end if;
  if invite.used_at is null and invite.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;

  select candidate.* into linked_driver
  from public.drivers candidate
  where candidate.id = invite.driver_id
    and candidate.organization_id = invite.organization_id
    and candidate.deleted_at is null
  for update;

  if not found then
    raise exception 'Driver not found';
  end if;
  if linked_driver.telegram_user_id is not null
    and linked_driver.telegram_user_id <> p_telegram_user_id then
    raise exception 'Driver is already linked to another Telegram account';
  end if;

  if linked_driver.profile_id is not null then
    select candidate.* into linked_profile
    from public.profiles candidate
    where candidate.id = linked_driver.profile_id
    for update;

    if linked_profile.telegram_user_id is not null
      and linked_profile.telegram_user_id <> p_telegram_user_id then
      raise exception 'Profile is already linked to another Telegram account';
    end if;
    if exists (
      select 1
      from public.profiles candidate
      where candidate.telegram_user_id = p_telegram_user_id
        and candidate.id <> linked_profile.id
    ) then
      raise exception 'Telegram account is already linked to another profile';
    end if;

    update public.profiles
    set telegram_user_id = p_telegram_user_id,
        updated_at = now()
    where id = linked_profile.id;
  end if;

  update public.drivers
  set telegram_user_id = p_telegram_user_id,
      status = 'ACTIVE',
      updated_at = now()
  where id = linked_driver.id;

  update public.telegram_driver_invites
  set used_at = coalesce(used_at, now()),
      used_by_telegram_user_id = p_telegram_user_id
  where id = invite.id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (
    invite.organization_id,
    'driver',
    linked_driver.id,
    'TELEGRAM_LINKED',
    'TELEGRAM',
    jsonb_build_object('telegram_user_id', p_telegram_user_id)
  );

  return query
  select organization.id, linked_driver.id, linked_driver.display_name, organization.base_currency
  from public.organizations organization
  where organization.id = invite.organization_id;
end;
$$;

-- If an already connected owner enables driver mode later, carry the same
-- Telegram identity to the new driver record.
create or replace function public.enable_owner_driver_mode(p_organization_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  owner_display_name text;
  owner_telegram_user_id bigint;
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

  select
    coalesce(nullif(trim(profile.display_name), ''), 'Владелец'),
    profile.telegram_user_id
  into owner_display_name, owner_telegram_user_id
  from public.profiles profile
  where profile.id = auth.uid();

  insert into public.drivers (
    organization_id,
    profile_id,
    display_name,
    telegram_user_id,
    status
  )
  values (
    p_organization_id,
    auth.uid(),
    owner_display_name,
    owner_telegram_user_id,
    'ACTIVE'
  )
  on conflict (organization_id, profile_id) do update
  set display_name = excluded.display_name,
      telegram_user_id = coalesce(public.drivers.telegram_user_id, excluded.telegram_user_id),
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

grant select on table
  public.profiles,
  public.organization_memberships,
  public.vehicles,
  public.telegram_profile_invites,
  public.trip_financial_summary
to service_role;

grant select, insert, update, delete on table
  public.telegram_profile_invites
to authenticated;

revoke all on function public.claim_owner_telegram_invite(text, bigint) from public;
revoke all on function public.claim_driver_telegram_invite(text, bigint) from public;
revoke all on function public.enable_owner_driver_mode(uuid) from public;

grant execute on function public.claim_owner_telegram_invite(text, bigint) to service_role;
grant execute on function public.claim_driver_telegram_invite(text, bigint) to service_role;
grant execute on function public.enable_owner_driver_mode(uuid) to authenticated;
