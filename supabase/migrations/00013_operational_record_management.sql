-- Safe editing and recoverable deletion for operational records.

alter table public.organization_staff
  add column if not exists deleted_at timestamptz;

drop index if exists public.organization_staff_email_key;
drop index if exists public.organization_staff_telegram_id_key;
drop index if exists public.organization_staff_telegram_username_key;

create unique index organization_staff_email_key
  on public.organization_staff (organization_id, lower(email))
  where email is not null and deleted_at is null;
create unique index organization_staff_telegram_id_key
  on public.organization_staff (organization_id, telegram_user_id)
  where telegram_user_id is not null and deleted_at is null;
create unique index organization_staff_telegram_username_key
  on public.organization_staff (organization_id, lower(telegram_username))
  where telegram_username is not null and deleted_at is null;

alter table public.vehicles
  drop constraint if exists vehicles_organization_id_plate_number_key;
create unique index if not exists vehicles_active_plate_number_key
  on public.vehicles (organization_id, plate_number)
  where deleted_at is null;

alter table public.drivers
  drop constraint if exists drivers_organization_id_profile_id_key,
  drop constraint if exists drivers_organization_id_telegram_user_id_key;
create unique index if not exists drivers_active_profile_key
  on public.drivers (organization_id, profile_id)
  where profile_id is not null and deleted_at is null;
create unique index if not exists drivers_active_telegram_user_key
  on public.drivers (organization_id, telegram_user_id)
  where telegram_user_id is not null and deleted_at is null;

create or replace function public.update_vehicle_record(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_display_name text,
  p_plate_number text,
  p_make_model text,
  p_fuel_norm numeric,
  p_status text
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare current_vehicle public.vehicles%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_VEHICLES') then
    raise exception 'Vehicle management permission required';
  end if;
  if char_length(trim(p_display_name)) < 2 or char_length(trim(p_plate_number)) < 3
    or p_status not in ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED')
    or (p_fuel_norm is not null and (p_fuel_norm <= 0 or p_fuel_norm > 200)) then
    raise exception 'Invalid vehicle data';
  end if;

  select vehicle.* into current_vehicle
  from public.vehicles vehicle
  where vehicle.id = p_vehicle_id and vehicle.organization_id = p_organization_id and vehicle.deleted_at is null
  for update;
  if not found then raise exception 'Vehicle not found'; end if;

  if p_status <> 'ACTIVE' and exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.vehicle_id = p_vehicle_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
  ) then raise exception 'Vehicle has an active trip'; end if;

  update public.vehicles set
    display_name = trim(p_display_name), plate_number = upper(trim(p_plate_number)),
    make_model = nullif(trim(p_make_model), ''), fuel_norm_l_per_100km = p_fuel_norm,
    status = p_status, updated_at = now()
  where id = p_vehicle_id and organization_id = p_organization_id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (p_organization_id, 'vehicle', p_vehicle_id, 'UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('display_name', current_vehicle.display_name, 'plate_number', current_vehicle.plate_number, 'status', current_vehicle.status),
    jsonb_build_object('display_name', trim(p_display_name), 'plate_number', upper(trim(p_plate_number)), 'status', p_status));
  return p_vehicle_id;
end;
$$;

create or replace function public.archive_vehicle_record(p_organization_id uuid, p_vehicle_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_VEHICLES')
    or not public.has_org_permission(p_organization_id, 'DELETE_RECORDS') then
    raise exception 'Vehicle deletion permission required';
  end if;
  if exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.vehicle_id = p_vehicle_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
  ) then raise exception 'Vehicle has an active trip'; end if;
  update public.vehicles set status = 'ARCHIVED', deleted_at = now(), updated_at = now()
  where id = p_vehicle_id and organization_id = p_organization_id and deleted_at is null;
  if not found then raise exception 'Vehicle not found'; end if;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, reason)
  values (p_organization_id, 'vehicle', p_vehicle_id, 'ARCHIVED', auth.uid(), 'WEB', 'Deleted from dashboard');
  return p_vehicle_id;
end;
$$;

create or replace function public.update_driver_record(
  p_organization_id uuid,
  p_driver_id uuid,
  p_display_name text,
  p_status text
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare current_driver public.drivers%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_DRIVERS') then
    raise exception 'Driver management permission required';
  end if;
  if char_length(trim(p_display_name)) < 2 or p_status not in ('INVITED', 'ACTIVE', 'INACTIVE') then
    raise exception 'Invalid driver data';
  end if;
  select driver.* into current_driver from public.drivers driver
  where driver.id = p_driver_id and driver.organization_id = p_organization_id and driver.deleted_at is null
  for update;
  if not found then raise exception 'Driver not found'; end if;
  if p_status <> 'ACTIVE' and exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.driver_id = p_driver_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
  ) then raise exception 'Driver has an active trip'; end if;
  update public.drivers set display_name = trim(p_display_name), status = p_status, updated_at = now()
  where id = p_driver_id and organization_id = p_organization_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (p_organization_id, 'driver', p_driver_id, 'UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('display_name', current_driver.display_name, 'status', current_driver.status),
    jsonb_build_object('display_name', trim(p_display_name), 'status', p_status));
  return p_driver_id;
end;
$$;

create or replace function public.archive_driver_record(p_organization_id uuid, p_driver_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_DRIVERS')
    or not public.has_org_permission(p_organization_id, 'DELETE_RECORDS') then
    raise exception 'Driver deletion permission required';
  end if;
  if exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.driver_id = p_driver_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
  ) then raise exception 'Driver has an active trip'; end if;
  update public.drivers set status = 'INACTIVE', deleted_at = now(), updated_at = now()
  where id = p_driver_id and organization_id = p_organization_id and deleted_at is null;
  if not found then raise exception 'Driver not found'; end if;
  delete from public.telegram_driver_invites where organization_id = p_organization_id and driver_id = p_driver_id and used_at is null;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, reason)
  values (p_organization_id, 'driver', p_driver_id, 'ARCHIVED', auth.uid(), 'WEB', 'Deleted from dashboard');
  return p_driver_id;
end;
$$;

create or replace function public.update_trip_record(
  p_organization_id uuid,
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_title text,
  p_origin_city text,
  p_destination_city text,
  p_load_state text,
  p_started_at timestamptz
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  current_trip public.trips%rowtype;
  current_leg public.trip_legs%rowtype;
  has_facts boolean;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then
    raise exception 'Trip management permission required';
  end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_origin_city)) < 2
    or char_length(trim(p_destination_city)) < 2
    or p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') or p_started_at is null then
    raise exception 'Invalid trip data';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null) then
    raise exception 'Vehicle is unavailable';
  end if;
  if p_driver_id is not null and not exists (select 1 from public.drivers where id = p_driver_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null) then
    raise exception 'Driver is unavailable';
  end if;

  select trip.* into current_trip from public.trips trip
  where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.deleted_at is null
  for update;
  if not found then raise exception 'Trip not found'; end if;
  select leg.* into current_leg from public.trip_legs leg
  where leg.trip_id = p_trip_id and leg.organization_id = p_organization_id and leg.sequence_no = 1 and leg.deleted_at is null
  for update;
  if not found then raise exception 'First trip leg not found'; end if;

  has_facts := exists (select 1 from public.expenses where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null)
    or exists (select 1 from public.incomes where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null)
    or exists (select 1 from public.odometer_records where organization_id = p_organization_id and trip_id = p_trip_id)
    or exists (select 1 from public.vehicle_status_records where organization_id = p_organization_id and trip_id = p_trip_id)
    or exists (select 1 from public.trip_location_points where organization_id = p_organization_id and trip_id = p_trip_id)
    or current_leg.start_odometer_km is not null or current_leg.end_odometer_km is not null;

  if has_facts and (
    current_trip.vehicle_id is distinct from p_vehicle_id
    or current_trip.driver_id is distinct from p_driver_id
    or current_trip.started_at is distinct from p_started_at
    or current_leg.load_state::text is distinct from p_load_state
  ) then raise exception 'Trip facts already exist; assignment, date and load state are locked'; end if;

  update public.trips set vehicle_id = p_vehicle_id, driver_id = p_driver_id,
    title = trim(p_title), started_at = p_started_at, updated_by = auth.uid(), updated_at = now()
  where id = p_trip_id and organization_id = p_organization_id;
  update public.trip_legs set origin_city = trim(p_origin_city), destination_city = trim(p_destination_city),
    load_state = p_load_state::public.trip_leg_load_state, start_at = p_started_at, updated_at = now()
  where id = current_leg.id and organization_id = p_organization_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (p_organization_id, 'trip', p_trip_id, 'UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('title', current_trip.title, 'vehicle_id', current_trip.vehicle_id, 'driver_id', current_trip.driver_id),
    jsonb_build_object('title', trim(p_title), 'vehicle_id', p_vehicle_id, 'driver_id', p_driver_id));
  return p_trip_id;
end;
$$;

create or replace function public.archive_trip_record(p_organization_id uuid, p_trip_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS')
    or not public.has_org_permission(p_organization_id, 'DELETE_RECORDS') then
    raise exception 'Trip deletion permission required';
  end if;
  update public.trips set status = 'CANCELLED', deleted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_trip_id and organization_id = p_organization_id and deleted_at is null;
  if not found then raise exception 'Trip not found'; end if;
  update public.trip_legs set deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where trip_id = p_trip_id and organization_id = p_organization_id;
  update public.expenses set status = 'VOIDED', deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid(),
    deleted_reason = coalesce(deleted_reason, 'Trip deleted from dashboard'), updated_at = now()
  where trip_id = p_trip_id and organization_id = p_organization_id;
  update public.incomes set payment_status = 'VOIDED', deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid(),
    deleted_reason = coalesce(deleted_reason, 'Trip deleted from dashboard'), updated_at = now()
  where trip_id = p_trip_id and organization_id = p_organization_id;
  update public.driver_compensation_calculations set calculation_status = 'VOIDED', updated_at = now()
  where trip_id = p_trip_id and organization_id = p_organization_id;
  update public.pnl_snapshots set is_current = false
  where trip_id = p_trip_id and organization_id = p_organization_id and is_current;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, reason)
  values (p_organization_id, 'trip', p_trip_id, 'ARCHIVED', auth.uid(), 'WEB', 'Deleted from dashboard with related financial records voided');
  return p_trip_id;
end;
$$;

create or replace function public.archive_organization_staff(p_organization_id uuid, p_staff_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare current_staff public.organization_staff%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TEAM')
    or not public.has_org_permission(p_organization_id, 'DELETE_RECORDS') then
    raise exception 'Staff deletion permission required';
  end if;
  select staff.* into current_staff from public.organization_staff staff
  where staff.id = p_staff_id and staff.organization_id = p_organization_id and staff.deleted_at is null
  for update;
  if not found then raise exception 'Staff member not found'; end if;
  if current_staff.access_role_id is null or exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id and membership.user_id = current_staff.profile_id and membership.role = 'OWNER'
  ) then raise exception 'Organization owner cannot be deleted'; end if;
  update public.organization_staff set status = 'SUSPENDED', deleted_at = now(), updated_at = now()
  where id = p_staff_id and organization_id = p_organization_id;
  if current_staff.profile_id is not null then
    update public.organization_memberships set status = 'SUSPENDED', updated_at = now()
    where organization_id = p_organization_id and user_id = current_staff.profile_id and role <> 'OWNER';
  end if;
  delete from public.telegram_staff_invites where organization_id = p_organization_id and staff_id = p_staff_id and used_at is null;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, reason)
  values (p_organization_id, 'organization_staff', p_staff_id, 'ARCHIVED', auth.uid(), 'WEB', 'Access removed from dashboard');
  return p_staff_id;
end;
$$;

revoke all on function public.update_vehicle_record(uuid, uuid, text, text, text, numeric, text) from public;
revoke all on function public.archive_vehicle_record(uuid, uuid) from public;
revoke all on function public.update_driver_record(uuid, uuid, text, text) from public;
revoke all on function public.archive_driver_record(uuid, uuid) from public;
revoke all on function public.update_trip_record(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.archive_trip_record(uuid, uuid) from public;
revoke all on function public.archive_organization_staff(uuid, uuid) from public;

grant execute on function public.update_vehicle_record(uuid, uuid, text, text, text, numeric, text) to authenticated;
grant execute on function public.archive_vehicle_record(uuid, uuid) to authenticated;
grant execute on function public.update_driver_record(uuid, uuid, text, text) to authenticated;
grant execute on function public.archive_driver_record(uuid, uuid) to authenticated;
grant execute on function public.update_trip_record(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.archive_trip_record(uuid, uuid) to authenticated;
grant execute on function public.archive_organization_staff(uuid, uuid) to authenticated;

