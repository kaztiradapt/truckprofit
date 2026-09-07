-- Enforce recoverable deletion at the database boundary, including direct UPDATEs.
create or replace function public.guard_operational_soft_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception 'Moving records between organizations is forbidden' using errcode = '42501';
  end if;
  if auth.uid() is not null and (
    (tg_op = 'INSERT' and new.deleted_at is not null)
    or (tg_op = 'UPDATE' and old.deleted_at is distinct from new.deleted_at)
  ) and not public.has_org_permission(new.organization_id, 'DELETE_RECORDS') then
    raise exception 'Delete records permission required' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_operational_soft_delete() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['drivers', 'vehicles', 'trailers', 'trips', 'trip_legs', 'expenses', 'incomes', 'organization_staff'] loop
    execute format('create trigger guard_soft_delete before insert or update on public.%I for each row execute function public.guard_operational_soft_delete()', table_name);
  end loop;
end;
$$;

-- Agreed customer revenue is a plan, not driver activity. Keep the operational
-- lock once expenses, odometer, location or driver status facts exist.
create or replace function public.update_trip_record(
  p_organization_id uuid,
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_title text,
  p_origin_city text,
  p_destination_city text,
  p_load_state text,
  p_started_at timestamptz,
  p_origin_address text default null,
  p_destination_address text default null,
  p_origin_latitude double precision default null,
  p_origin_longitude double precision default null,
  p_destination_latitude double precision default null,
  p_destination_longitude double precision default null,
  p_distance_km numeric default null
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
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then raise exception 'Trip management permission required'; end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_origin_city)) < 2 or char_length(trim(p_destination_city)) < 2
    or char_length(trim(coalesce(p_origin_address, p_origin_city))) < 2
    or char_length(trim(coalesce(p_destination_address, p_destination_city))) < 2
    or p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') or p_started_at is null
    or p_distance_km is null or p_distance_km <= 0 or p_distance_km > 100000 then raise exception 'Invalid trip data'; end if;
  if (p_origin_latitude is null) <> (p_origin_longitude is null)
    or (p_destination_latitude is null) <> (p_destination_longitude is null)
    or (p_origin_latitude is not null and (p_origin_latitude not between -90 and 90 or p_origin_longitude not between -180 and 180))
    or (p_destination_latitude is not null and (p_destination_latitude not between -90 and 90 or p_destination_longitude not between -180 and 180)) then
    raise exception 'Invalid trip route coordinates';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null) then raise exception 'Vehicle is unavailable'; end if;
  if p_driver_id is not null and not exists (select 1 from public.drivers where id = p_driver_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null) then raise exception 'Driver is unavailable'; end if;

  select trip.* into current_trip from public.trips trip
  where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.deleted_at is null for update;
  if not found then raise exception 'Trip not found'; end if;
  select leg.* into current_leg from public.trip_legs leg
  where leg.trip_id = p_trip_id and leg.organization_id = p_organization_id and leg.sequence_no = 1 and leg.deleted_at is null for update;
  if not found then raise exception 'First trip leg not found'; end if;

  has_facts := exists (select 1 from public.expenses where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null)
    or exists (select 1 from public.odometer_records where organization_id = p_organization_id and trip_id = p_trip_id)
    or exists (select 1 from public.vehicle_status_records where organization_id = p_organization_id and trip_id = p_trip_id)
    or exists (select 1 from public.trip_location_points where organization_id = p_organization_id and trip_id = p_trip_id)
    or current_leg.start_odometer_km is not null or current_leg.end_odometer_km is not null;
  if has_facts and (
    current_trip.vehicle_id is distinct from p_vehicle_id or current_trip.driver_id is distinct from p_driver_id
    or current_trip.started_at is distinct from p_started_at or current_leg.load_state::text is distinct from p_load_state
  ) then raise exception 'Trip facts already exist; assignment, date and load state are locked'; end if;

  update public.trips set vehicle_id = p_vehicle_id, driver_id = p_driver_id,
    title = trim(p_title), started_at = p_started_at, updated_by = auth.uid(), updated_at = now()
  where id = p_trip_id and organization_id = p_organization_id;
  update public.trip_legs set
    origin_city = trim(p_origin_city), destination_city = trim(p_destination_city),
    origin_address = trim(coalesce(p_origin_address, p_origin_city)),
    destination_address = trim(coalesce(p_destination_address, p_destination_city)),
    origin_latitude = p_origin_latitude, origin_longitude = p_origin_longitude,
    destination_latitude = p_destination_latitude, destination_longitude = p_destination_longitude,
    distance_km = round(p_distance_km, 1),
    load_state = p_load_state::public.trip_leg_load_state, start_at = p_started_at, updated_at = now()
  where id = current_leg.id and organization_id = p_organization_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (p_organization_id, 'trip', p_trip_id, 'UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('title', current_trip.title, 'vehicle_id', current_trip.vehicle_id, 'driver_id', current_trip.driver_id, 'distance_km', current_leg.distance_km, 'origin_address', current_leg.origin_address, 'destination_address', current_leg.destination_address),
    jsonb_build_object('title', trim(p_title), 'vehicle_id', p_vehicle_id, 'driver_id', p_driver_id, 'distance_km', round(p_distance_km, 1), 'origin_address', trim(coalesce(p_origin_address, p_origin_city)), 'destination_address', trim(coalesce(p_destination_address, p_destination_city))));
  return p_trip_id;
end;
$$;
