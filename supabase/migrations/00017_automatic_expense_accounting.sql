-- Expenses are operational facts and are included in the trip economy immediately.
-- The owner no longer has a separate approval queue.

update public.expenses
set review_status = 'APPROVED',
    reviewed_at = coalesce(reviewed_at, now()),
    review_note = coalesce(review_note, 'Автоматически учтено после отключения согласования'),
    updated_at = now()
where review_status = 'PENDING'
  and deleted_at is null
  and status <> 'VOIDED';

drop index if exists public.expenses_pending_review_idx;

drop function if exists public.review_expense(uuid, uuid, text, text);

update public.organization_access_roles
set permissions = array_remove(permissions, 'REVIEW_EXPENSES'),
    updated_at = now()
where 'REVIEW_EXPENSES' = any(permissions);

create or replace function public.seed_organization_access_roles()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.organization_access_roles (organization_id, name, permissions, is_system)
  values
    (
      new.id,
      'Управляющий',
      array['VIEW_DASHBOARD', 'VIEW_FINANCE', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS', 'MANAGE_FINANCE']::text[],
      true
    ),
    (
      new.id,
      'Диспетчер',
      array['VIEW_DASHBOARD', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS']::text[],
      true
    ),
    (
      new.id,
      'Наблюдатель',
      array['VIEW_DASHBOARD']::text[],
      true
    )
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.record_telegram_expense(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_category_code text,
  p_amount numeric,
  p_currency char(3),
  p_occurred_at timestamptz,
  p_odometer_km numeric default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_price_per_unit numeric default null,
  p_location_text text default null,
  p_comment text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_vehicle_id uuid;
  category_id uuid;
  expense_id uuid;
  last_odometer_km numeric;
begin
  if p_amount <= 0 or p_currency !~ '^[A-Z]{3}$' then raise exception 'Expense amount or currency is invalid'; end if;

  select trip.vehicle_id into assigned_vehicle_id
  from public.trips trip
  where trip.id = p_trip_id
    and trip.organization_id = p_organization_id
    and trip.driver_id = p_driver_id
    and trip.status = 'ACTIVE'
    and trip.deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  select category.id into category_id
  from public.expense_categories category
  where category.organization_id = p_organization_id
    and category.code = upper(trim(p_category_code))
    and category.is_active;
  if not found then raise exception 'Expense category is not available'; end if;
  if upper(trim(p_category_code)) = 'FUEL' and (p_quantity is null or p_unit <> 'L' or p_price_per_unit is null) then
    raise exception 'Fuel must include litres and price per litre';
  end if;

  if p_odometer_km is not null then
    select max(record.value_km) into last_odometer_km
    from public.odometer_records record
    where record.organization_id = p_organization_id
      and record.vehicle_id = assigned_vehicle_id
      and record.recorded_at <= p_occurred_at;
    if last_odometer_km is not null and p_odometer_km < last_odometer_km then raise exception 'Odometer cannot be lower than the latest record'; end if;
  end if;

  insert into public.expenses (
    organization_id, vehicle_id, driver_id, trip_id, category_id, amount, currency,
    occurred_at, odometer_km, quantity, unit, price_per_unit, location_text, comment, source, review_status
  ) values (
    p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, category_id, round(p_amount, 2), p_currency,
    p_occurred_at, p_odometer_km, p_quantity, p_unit, p_price_per_unit, p_location_text, p_comment, 'TELEGRAM', 'APPROVED'
  ) returning id into expense_id;

  if p_odometer_km is not null then
    insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
    values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_odometer_km, p_occurred_at, 'TELEGRAM');
  end if;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (
    p_organization_id,
    'expense',
    expense_id,
    'CREATED',
    'TELEGRAM',
    jsonb_build_object('amount', round(p_amount, 2), 'currency', p_currency, 'review_status', 'APPROVED')
  );
  return expense_id;
end;
$$;

