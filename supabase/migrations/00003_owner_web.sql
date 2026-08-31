-- The project has Data API auto-exposure disabled. Grant table access explicitly;
-- RLS policies from 00001 remain the authorization boundary.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.organizations,
  public.organization_memberships,
  public.drivers,
  public.vehicles,
  public.trailers,
  public.trips,
  public.trip_legs,
  public.expense_categories,
  public.expenses,
  public.incomes,
  public.odometer_records,
  public.vehicle_status_records,
  public.tax_profiles,
  public.driver_compensation_rules,
  public.driver_compensation_calculations,
  public.maintenance_records,
  public.attachments,
  public.audit_events,
  public.telegram_driver_invites
to authenticated;
grant select on public.trip_financial_summary to authenticated;

create or replace function public.create_trip_with_first_leg(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_title text,
  p_origin_city text,
  p_destination_city text,
  p_load_state text,
  p_started_at timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  trip_id uuid;
begin
  if not public.is_owner_or_manager(p_organization_id) then
    raise exception 'Only an owner or manager can create a trip';
  end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_origin_city)) < 2 or char_length(trim(p_destination_city)) < 2 then
    raise exception 'Trip title and cities are required';
  end if;
  if p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') then
    raise exception 'Invalid load state';
  end if;
  if not exists (
    select 1 from public.vehicles vehicle
    where vehicle.id = p_vehicle_id and vehicle.organization_id = p_organization_id and vehicle.deleted_at is null and vehicle.status = 'ACTIVE'
  ) then
    raise exception 'Vehicle is unavailable';
  end if;
  if p_driver_id is not null and not exists (
    select 1 from public.drivers driver
    where driver.id = p_driver_id and driver.organization_id = p_organization_id and driver.deleted_at is null and driver.status = 'ACTIVE'
  ) then
    raise exception 'Driver is unavailable';
  end if;

  insert into public.trips (organization_id, vehicle_id, driver_id, title, status, started_at, created_by, updated_by)
  values (p_organization_id, p_vehicle_id, p_driver_id, trim(p_title), 'ACTIVE', p_started_at, auth.uid(), auth.uid())
  returning id into trip_id;

  insert into public.trip_legs (organization_id, trip_id, sequence_no, origin_city, destination_city, load_state, start_at)
  values (p_organization_id, trip_id, 1, trim(p_origin_city), trim(p_destination_city), p_load_state::public.trip_leg_load_state, p_started_at);

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (p_organization_id, 'trip', trip_id, 'CREATED', auth.uid(), 'WEB', jsonb_build_object('first_leg', true));

  return trip_id;
end;
$$;

create or replace function public.record_owner_income(
  p_organization_id uuid,
  p_trip_id uuid,
  p_customer_name text,
  p_amount numeric,
  p_currency char(3),
  p_expected_payment_at date default null,
  p_comment text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  income_id uuid;
begin
  if not public.is_owner_or_manager(p_organization_id) then
    raise exception 'Only an owner or manager can add income';
  end if;
  if p_amount <= 0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Income amount and currency are invalid';
  end if;
  if not exists (
    select 1 from public.trips trip
    where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.deleted_at is null
  ) then
    raise exception 'Trip is unavailable';
  end if;

  insert into public.incomes (
    organization_id, trip_id, customer_name, amount, currency, payment_status,
    expected_payment_at, comment, created_by, updated_by
  ) values (
    p_organization_id, p_trip_id, nullif(trim(p_customer_name), ''), round(p_amount, 2), p_currency,
    'PLANNED', p_expected_payment_at, nullif(trim(p_comment), ''), auth.uid(), auth.uid()
  ) returning id into income_id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (p_organization_id, 'income', income_id, 'CREATED', auth.uid(), 'WEB', jsonb_build_object('amount', round(p_amount, 2), 'currency', p_currency));

  return income_id;
end;
$$;

revoke all on function public.create_trip_with_first_leg(uuid, uuid, uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text) from public;
grant execute on function public.create_trip_with_first_leg(uuid, uuid, uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text) to authenticated;
