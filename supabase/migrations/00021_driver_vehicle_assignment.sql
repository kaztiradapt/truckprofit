-- A driver's default vehicle is used to prefill new trips.

alter table public.drivers
  add column if not exists assigned_vehicle_id uuid;

alter table public.drivers
  drop constraint if exists drivers_assigned_vehicle_fk,
  add constraint drivers_assigned_vehicle_fk
    foreign key (assigned_vehicle_id, organization_id)
    references public.vehicles(id, organization_id);

create unique index if not exists drivers_active_assigned_vehicle_key
  on public.drivers (organization_id, assigned_vehicle_id)
  where assigned_vehicle_id is not null and deleted_at is null;

revoke all on function public.update_driver_record(uuid, uuid, text, text) from public;
drop function if exists public.update_driver_record(uuid, uuid, text, text);

create function public.update_driver_record(
  p_organization_id uuid,
  p_driver_id uuid,
  p_display_name text,
  p_status text,
  p_assigned_vehicle_id uuid default null
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

  if p_assigned_vehicle_id is not null and not exists (
    select 1 from public.vehicles vehicle
    where vehicle.id = p_assigned_vehicle_id and vehicle.organization_id = p_organization_id
      and vehicle.deleted_at is null and vehicle.status = 'ACTIVE'
  ) then raise exception 'Assigned vehicle is unavailable'; end if;

  if p_assigned_vehicle_id is not null and exists (
    select 1 from public.drivers driver
    where driver.organization_id = p_organization_id
      and driver.id <> p_driver_id
      and driver.assigned_vehicle_id = p_assigned_vehicle_id
      and driver.deleted_at is null
  ) then raise exception 'Vehicle is already assigned to another driver'; end if;

  if p_assigned_vehicle_id is not null and exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.driver_id = p_driver_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
      and trip.vehicle_id <> p_assigned_vehicle_id
  ) then raise exception 'Driver active trip uses another vehicle'; end if;

  if p_status <> 'ACTIVE' and exists (
    select 1 from public.trips trip
    where trip.organization_id = p_organization_id and trip.driver_id = p_driver_id
      and trip.status = 'ACTIVE' and trip.deleted_at is null
  ) then raise exception 'Driver has an active trip'; end if;

  update public.drivers set
    display_name = trim(p_display_name),
    status = p_status,
    assigned_vehicle_id = p_assigned_vehicle_id,
    updated_at = now()
  where id = p_driver_id and organization_id = p_organization_id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (p_organization_id, 'driver', p_driver_id, 'UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('display_name', current_driver.display_name, 'status', current_driver.status, 'assigned_vehicle_id', current_driver.assigned_vehicle_id),
    jsonb_build_object('display_name', trim(p_display_name), 'status', p_status, 'assigned_vehicle_id', p_assigned_vehicle_id));
  return p_driver_id;
end;
$$;

grant execute on function public.update_driver_record(uuid, uuid, text, text, uuid) to authenticated;
