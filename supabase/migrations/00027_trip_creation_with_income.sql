-- Create the operational trip and its primary customer income in one transaction.

create function public.create_trip_with_first_leg_and_income(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_title text,
  p_origin_city text,
  p_destination_city text,
  p_load_state text,
  p_started_at timestamptz,
  p_origin_address text,
  p_destination_address text,
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_distance_km numeric,
  p_customer_name text,
  p_income_amount numeric,
  p_income_currency char(3),
  p_expected_payment_at date,
  p_income_comment text,
  p_fx_rate_to_reporting numeric
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  trip_id uuid;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then
    raise exception 'Trip management permission required';
  end if;
  if not public.has_org_permission(p_organization_id, 'MANAGE_FINANCE') then
    raise exception 'Finance management permission required';
  end if;

  trip_id := public.create_trip_with_first_leg(
    p_organization_id,
    p_vehicle_id,
    p_driver_id,
    p_title,
    p_origin_city,
    p_destination_city,
    p_load_state,
    p_started_at,
    p_origin_address,
    p_destination_address,
    p_origin_latitude,
    p_origin_longitude,
    p_destination_latitude,
    p_destination_longitude,
    p_distance_km
  );

  perform public.record_owner_income(
    p_organization_id,
    trip_id,
    p_customer_name,
    p_income_amount,
    p_income_currency,
    p_expected_payment_at,
    p_income_comment,
    p_fx_rate_to_reporting
  );

  return trip_id;
end;
$$;

revoke all on function public.create_trip_with_first_leg_and_income(
  uuid, uuid, uuid, text, text, text, text, timestamptz, text, text,
  double precision, double precision, double precision, double precision,
  numeric, text, numeric, char(3), date, text, numeric
) from public;

grant execute on function public.create_trip_with_first_leg_and_income(
  uuid, uuid, uuid, text, text, text, text, timestamptz, text, text,
  double precision, double precision, double precision, double precision,
  numeric, text, numeric, char(3), date, text, numeric
) to authenticated;
