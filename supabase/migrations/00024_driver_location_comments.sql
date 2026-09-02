-- Let a driver attach an optional comment to the exact Telegram location point.

drop function if exists public.record_telegram_trip_location(
  uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, bigint
);

create or replace function public.record_telegram_trip_location(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_horizontal_accuracy_m numeric,
  p_recorded_at timestamptz,
  p_telegram_message_id bigint,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  assigned_trip public.trips%rowtype;
  location_id uuid;
  normalized_note text;
begin
  normalized_note := nullif(trim(coalesce(p_note, '')), '');
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180
    or (p_horizontal_accuracy_m is not null and (p_horizontal_accuracy_m < 0 or p_horizontal_accuracy_m > 1500))
    or p_recorded_at is null
    or p_recorded_at < now() - interval '24 hours'
    or p_recorded_at > now() + interval '5 minutes'
    or p_telegram_message_id is null or p_telegram_message_id <= 0
    or (normalized_note is not null and char_length(normalized_note) > 300) then
    raise exception 'Invalid Telegram location';
  end if;

  select trip.* into assigned_trip
  from public.trips trip
  where trip.id = p_trip_id
    and trip.organization_id = p_organization_id
    and trip.driver_id = p_driver_id
    and trip.status = 'ACTIVE'
    and trip.deleted_at is null
  for update;
  if not found then raise exception 'Active assigned trip not found'; end if;

  insert into public.trip_location_points (
    organization_id,
    trip_id,
    vehicle_id,
    driver_id,
    latitude,
    longitude,
    horizontal_accuracy_m,
    recorded_at,
    telegram_message_id,
    source,
    note
  ) values (
    p_organization_id,
    p_trip_id,
    assigned_trip.vehicle_id,
    p_driver_id,
    p_latitude,
    p_longitude,
    p_horizontal_accuracy_m,
    p_recorded_at,
    p_telegram_message_id,
    'TELEGRAM',
    normalized_note
  )
  on conflict (driver_id, telegram_message_id) do nothing
  returning id into location_id;

  if location_id is null then
    select point.id into location_id
    from public.trip_location_points point
    where point.driver_id = p_driver_id
      and point.telegram_message_id = p_telegram_message_id;
    return location_id;
  end if;

  insert into public.audit_events (
    organization_id,
    entity_type,
    entity_id,
    action,
    source,
    after_data
  ) values (
    p_organization_id,
    'trip_location_point',
    location_id,
    'RECORDED',
    'TELEGRAM',
    jsonb_build_object(
      'trip_id', p_trip_id,
      'driver_id', p_driver_id,
      'horizontal_accuracy_m', p_horizontal_accuracy_m,
      'note', normalized_note
    )
  );

  return location_id;
end;
$$;

revoke all on function public.record_telegram_trip_location(
  uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, bigint, text
) from public;
grant execute on function public.record_telegram_trip_location(
  uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, bigint, text
) to service_role;
