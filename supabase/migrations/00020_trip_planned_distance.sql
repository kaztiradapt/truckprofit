-- Store the planned mileage selected from routing (or entered manually) on the first leg.

revoke all on function public.create_trip_with_first_leg(uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision) from public;
drop function public.create_trip_with_first_leg(uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision);

create function public.create_trip_with_first_leg(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_title text,
  p_origin_city text,
  p_destination_city text,
  p_load_state text,
  p_started_at timestamptz default now(),
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
declare trip_id uuid;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then raise exception 'Trip management permission required'; end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_origin_city)) < 2 or char_length(trim(p_destination_city)) < 2
    or char_length(trim(coalesce(p_origin_address, p_origin_city))) < 2
    or char_length(trim(coalesce(p_destination_address, p_destination_city))) < 2 then
    raise exception 'Trip title, cities and addresses are required';
  end if;
  if p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') then raise exception 'Invalid load state'; end if;
  if p_distance_km is null or p_distance_km <= 0 or p_distance_km > 100000 then raise exception 'Invalid trip distance'; end if;
  if (p_origin_latitude is null) <> (p_origin_longitude is null)
    or (p_destination_latitude is null) <> (p_destination_longitude is null)
    or (p_origin_latitude is not null and (p_origin_latitude not between -90 and 90 or p_origin_longitude not between -180 and 180))
    or (p_destination_latitude is not null and (p_destination_latitude not between -90 and 90 or p_destination_longitude not between -180 and 180)) then
    raise exception 'Invalid trip route coordinates';
  end if;
  if not exists (select 1 from public.vehicles vehicle where vehicle.id = p_vehicle_id and vehicle.organization_id = p_organization_id and vehicle.deleted_at is null and vehicle.status = 'ACTIVE') then raise exception 'Vehicle is unavailable'; end if;
  if p_driver_id is not null and not exists (select 1 from public.drivers driver where driver.id = p_driver_id and driver.organization_id = p_organization_id and driver.deleted_at is null and driver.status = 'ACTIVE') then raise exception 'Driver is unavailable'; end if;

  insert into public.trips (organization_id, vehicle_id, driver_id, title, status, started_at, created_by, updated_by)
  values (p_organization_id, p_vehicle_id, p_driver_id, trim(p_title), 'ACTIVE', p_started_at, auth.uid(), auth.uid()) returning id into trip_id;
  insert into public.trip_legs (
    organization_id, trip_id, sequence_no, origin_city, destination_city, origin_address, destination_address,
    origin_latitude, origin_longitude, destination_latitude, destination_longitude, load_state, start_at, distance_km
  ) values (
    p_organization_id, trip_id, 1, trim(p_origin_city), trim(p_destination_city),
    trim(coalesce(p_origin_address, p_origin_city)), trim(coalesce(p_destination_address, p_destination_city)),
    p_origin_latitude, p_origin_longitude, p_destination_latitude, p_destination_longitude,
    p_load_state::public.trip_leg_load_state, p_started_at, round(p_distance_km, 1)
  );
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (p_organization_id, 'trip', trip_id, 'CREATED', auth.uid(), 'WEB', jsonb_build_object(
    'first_leg', true,
    'distance_km', round(p_distance_km, 1),
    'origin_address', trim(coalesce(p_origin_address, p_origin_city)),
    'destination_address', trim(coalesce(p_destination_address, p_destination_city)),
    'origin_coordinates', case when p_origin_latitude is null then null else jsonb_build_array(p_origin_latitude, p_origin_longitude) end,
    'destination_coordinates', case when p_destination_latitude is null then null else jsonb_build_array(p_destination_latitude, p_destination_longitude) end
  ));
  return trip_id;
end;
$$;

revoke all on function public.update_trip_record(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision) from public;
drop function public.update_trip_record(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision);

create function public.update_trip_record(
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
    or exists (select 1 from public.incomes where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null)
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

grant execute on function public.create_trip_with_first_leg(uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision, numeric) to authenticated;
grant execute on function public.update_trip_record(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, double precision, double precision, double precision, double precision, numeric) to authenticated;
