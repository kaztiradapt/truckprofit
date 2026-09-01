-- Preserve the exact route alternative selected during trip creation.

alter table public.trip_legs
  add column if not exists route_geometry jsonb;

alter table public.trip_legs
  drop constraint if exists trip_legs_route_geometry_shape,
  add constraint trip_legs_route_geometry_shape check (
    case
      when route_geometry is null then true
      when jsonb_typeof(route_geometry) = 'array' then jsonb_array_length(route_geometry) between 2 and 25000
      else false
    end
  );

create or replace function public.set_trip_route_geometry(
  p_organization_id uuid,
  p_trip_id uuid,
  p_route_geometry jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  route_point jsonb;
  longitude_value double precision;
  latitude_value double precision;
  previous_geometry jsonb;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then
    raise exception 'Trip management permission required';
  end if;
  if p_route_geometry is not null then
    if jsonb_typeof(p_route_geometry) <> 'array' or jsonb_array_length(p_route_geometry) not between 2 and 25000 then
      raise exception 'Invalid trip route geometry';
    end if;
    for route_point in select value from jsonb_array_elements(p_route_geometry)
    loop
      begin
        if jsonb_typeof(route_point) <> 'array' or jsonb_array_length(route_point) < 2 then
          raise exception 'Invalid trip route geometry';
        end if;
        longitude_value := (route_point ->> 0)::double precision;
        latitude_value := (route_point ->> 1)::double precision;
        if longitude_value not between -180 and 180 or latitude_value not between -90 and 90 then
          raise exception 'Invalid trip route geometry';
        end if;
      exception when others then
        raise exception 'Invalid trip route geometry';
      end;
    end loop;
  end if;

  select leg.route_geometry into previous_geometry
  from public.trip_legs leg
  where leg.organization_id = p_organization_id and leg.trip_id = p_trip_id
    and leg.sequence_no = 1 and leg.deleted_at is null
  for update;
  if not found then raise exception 'First trip leg not found'; end if;

  update public.trip_legs set route_geometry = p_route_geometry, updated_at = now()
  where organization_id = p_organization_id and trip_id = p_trip_id
    and sequence_no = 1 and deleted_at is null;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data)
  values (
    p_organization_id, 'trip', p_trip_id, 'ROUTE_GEOMETRY_UPDATED', auth.uid(), 'WEB',
    jsonb_build_object('point_count', case when previous_geometry is null then 0 else jsonb_array_length(previous_geometry) end),
    jsonb_build_object('point_count', case when p_route_geometry is null then 0 else jsonb_array_length(p_route_geometry) end)
  );
  return p_trip_id;
end;
$$;

revoke all on function public.set_trip_route_geometry(uuid, uuid, jsonb) from public;
grant execute on function public.set_trip_route_geometry(uuid, uuid, jsonb) to authenticated;
