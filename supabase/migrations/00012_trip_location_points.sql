create table public.trip_location_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trip_id uuid not null,
  vehicle_id uuid not null,
  driver_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  horizontal_accuracy_m numeric(8, 2) check (horizontal_accuracy_m is null or horizontal_accuracy_m between 0 and 1500),
  recorded_at timestamptz not null,
  telegram_message_id bigint not null check (telegram_message_id > 0),
  source public.expense_source not null default 'TELEGRAM',
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (driver_id, telegram_message_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id) on delete cascade,
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id)
);

create index trip_location_points_trip_recorded_idx
  on public.trip_location_points (trip_id, recorded_at desc);
create index trip_location_points_vehicle_recorded_idx
  on public.trip_location_points (vehicle_id, recorded_at desc);

alter table public.trip_location_points enable row level security;

create policy trip_location_points_select_dashboard_or_driver
  on public.trip_location_points for select
  using (
    public.has_org_permission(organization_id, 'VIEW_DASHBOARD')
    or public.is_current_driver(organization_id, driver_id)
  );

create or replace function public.record_telegram_trip_location(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_horizontal_accuracy_m numeric,
  p_recorded_at timestamptz,
  p_telegram_message_id bigint
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  assigned_trip public.trips%rowtype;
  location_id uuid;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180
    or (p_horizontal_accuracy_m is not null and (p_horizontal_accuracy_m < 0 or p_horizontal_accuracy_m > 1500))
    or p_recorded_at is null
    or p_recorded_at < now() - interval '24 hours'
    or p_recorded_at > now() + interval '5 minutes'
    or p_telegram_message_id is null or p_telegram_message_id <= 0 then
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
    source
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
    'TELEGRAM'
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
      'horizontal_accuracy_m', p_horizontal_accuracy_m
    )
  );

  return location_id;
end;
$$;

grant select on public.trip_location_points to authenticated;
grant select, insert, update, delete on public.trip_location_points to service_role;

revoke all on function public.record_telegram_trip_location(uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, bigint) from public;
grant execute on function public.record_telegram_trip_location(uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, bigint) to service_role;
