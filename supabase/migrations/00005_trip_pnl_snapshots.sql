-- TruckProfit P0 integration. This migration only extends the live Fleet Economics schema.
-- Existing monetary columns remain NUMERIC (exact decimal), while the calculation layer
-- writes immutable reporting totals in integer minor units.

create type public.expense_review_status as enum ('PENDING', 'APPROVED', 'REJECTED');

alter table public.expense_categories
  add column economic_group text not null default 'OTHER'
    check (economic_group in ('FUEL', 'TOLLS', 'REPAIR', 'MAINTENANCE', 'OTHER'));

update public.expense_categories
set economic_group = case code
  when 'FUEL' then 'FUEL'
  when 'TOLL' then 'TOLLS'
  when 'REPAIR' then 'REPAIR'
  else 'OTHER'
end;

alter table public.expenses
  add column review_status public.expense_review_status not null default 'APPROVED',
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column review_note text,
  add column reporting_amount_minor bigint;

alter table public.incomes
  add column reporting_amount_minor bigint;

update public.expenses
set reporting_amount_minor = round(amount * 100)::bigint
where reporting_amount_minor is null;

update public.incomes
set reporting_amount_minor = round(amount * 100)::bigint
where reporting_amount_minor is null;

alter table public.expenses
  alter column reporting_amount_minor set not null,
  add constraint expenses_reporting_amount_minor_positive check (reporting_amount_minor > 0);

alter table public.incomes
  alter column reporting_amount_minor set not null,
  add constraint incomes_reporting_amount_minor_positive check (reporting_amount_minor > 0);

create or replace function public.set_reporting_amount_minor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reporting_amount_minor is null or tg_op = 'UPDATE' and new.amount is distinct from old.amount then
    new.reporting_amount_minor := round(new.amount * 100)::bigint;
  end if;
  if new.reporting_amount_minor <= 0 then
    raise exception 'Reporting amount must be positive';
  end if;
  return new;
end;
$$;

create trigger expenses_set_reporting_amount_minor
  before insert or update of amount, reporting_amount_minor on public.expenses
  for each row execute procedure public.set_reporting_amount_minor();

create trigger incomes_set_reporting_amount_minor
  before insert or update of amount, reporting_amount_minor on public.incomes
  for each row execute procedure public.set_reporting_amount_minor();

create table public.pnl_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trip_id uuid not null,
  formula_version text not null,
  input_revision char(64) not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  revenue_minor bigint not null,
  direct_expenses_minor bigint not null,
  driver_compensation_minor bigint not null,
  estimated_tax_minor bigint not null,
  total_expenses_minor bigint not null,
  contribution_profit_minor bigint not null,
  management_profit_minor bigint not null,
  total_km integer not null check (total_km >= 0),
  loaded_km integer not null check (loaded_km >= 0),
  empty_km integer not null check (empty_km >= 0),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  is_current boolean not null default true,
  calculated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (trip_id, input_revision),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id),
  check (loaded_km + empty_km = total_km)
);

create unique index pnl_snapshots_one_current_per_trip
  on public.pnl_snapshots (trip_id) where is_current;

create table public.pnl_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  snapshot_id uuid not null,
  code text not null,
  label text not null,
  amount_minor bigint not null,
  source_type text,
  source_id uuid,
  sequence_no integer not null check (sequence_no > 0),
  created_at timestamptz not null default now(),
  unique (snapshot_id, sequence_no),
  foreign key (snapshot_id, organization_id) references public.pnl_snapshots(id, organization_id) on delete cascade
);

create index expenses_pending_review_idx
  on public.expenses (organization_id, occurred_at desc)
  where deleted_at is null and status <> 'VOIDED' and review_status = 'PENDING';

create index pnl_snapshots_org_calculated_idx
  on public.pnl_snapshots (organization_id, calculated_at desc);

create or replace function public.review_expense(
  p_organization_id uuid,
  p_expense_id uuid,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  resulting_status public.expense_review_status;
begin
  if not public.is_owner_or_manager(p_organization_id) then
    raise exception 'Only an owner or manager can review an expense';
  end if;
  if upper(trim(p_decision)) not in ('APPROVED', 'REJECTED') then
    raise exception 'Expense decision must be APPROVED or REJECTED';
  end if;
  resulting_status := upper(trim(p_decision))::public.expense_review_status;

  update public.expenses
  set review_status = resulting_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = nullif(trim(p_note), ''),
      updated_at = now()
  where id = p_expense_id
    and organization_id = p_organization_id
    and deleted_at is null
    and status <> 'VOIDED'
    and review_status = 'PENDING';
  if not found then
    raise exception 'Pending expense is unavailable';
  end if;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (
    p_organization_id,
    'expense',
    p_expense_id,
    case when resulting_status = 'APPROVED' then 'APPROVED' else 'REJECTED' end,
    auth.uid(),
    'WEB',
    jsonb_build_object('review_status', resulting_status, 'note', nullif(trim(p_note), ''))
  );

  return p_expense_id;
end;
$$;

create or replace function public.publish_trip_pnl(
  p_organization_id uuid,
  p_trip_id uuid,
  p_formula_version text,
  p_input_revision char(64),
  p_currency char(3),
  p_totals jsonb,
  p_line_items jsonb,
  p_warnings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  snapshot_id uuid;
  line_item jsonb;
  total_km integer;
  loaded_km integer;
  empty_km integer;
begin
  if p_currency !~ '^[A-Z]{3}$' or jsonb_typeof(p_totals) <> 'object' or jsonb_typeof(p_line_items) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    raise exception 'Invalid P&L payload';
  end if;
  if not exists (select 1 from public.trips where id = p_trip_id and organization_id = p_organization_id and deleted_at is null) then
    raise exception 'Trip is unavailable';
  end if;

  select id into snapshot_id
  from public.pnl_snapshots
  where trip_id = p_trip_id and input_revision = p_input_revision;
  if found then return snapshot_id; end if;

  total_km := (p_totals ->> 'totalKm')::integer;
  loaded_km := (p_totals ->> 'loadedKm')::integer;
  empty_km := (p_totals ->> 'emptyKm')::integer;
  if total_km < 0 or loaded_km < 0 or empty_km < 0 or loaded_km + empty_km <> total_km then
    raise exception 'Invalid P&L mileage totals';
  end if;

  update public.pnl_snapshots set is_current = false
  where organization_id = p_organization_id and trip_id = p_trip_id and is_current;

  insert into public.pnl_snapshots (
    organization_id, trip_id, formula_version, input_revision, currency,
    revenue_minor, direct_expenses_minor, driver_compensation_minor,
    estimated_tax_minor, total_expenses_minor, contribution_profit_minor,
    management_profit_minor, total_km, loaded_km, empty_km, warnings
  ) values (
    p_organization_id, p_trip_id, p_formula_version, p_input_revision, p_currency,
    (p_totals ->> 'revenueMinor')::bigint,
    (p_totals ->> 'directExpensesMinor')::bigint,
    (p_totals ->> 'driverCompensationMinor')::bigint,
    (p_totals ->> 'estimatedTaxMinor')::bigint,
    (p_totals ->> 'totalExpensesMinor')::bigint,
    (p_totals ->> 'contributionProfitMinor')::bigint,
    (p_totals ->> 'managementProfitMinor')::bigint,
    total_km, loaded_km, empty_km, p_warnings
  ) returning id into snapshot_id;

  for line_item in select * from jsonb_array_elements(p_line_items)
  loop
    insert into public.pnl_lines (organization_id, snapshot_id, code, label, amount_minor, source_type, source_id, sequence_no)
    values (
      p_organization_id,
      snapshot_id,
      line_item ->> 'code',
      line_item ->> 'label',
      (line_item ->> 'amountMinor')::bigint,
      nullif(line_item ->> 'sourceType', ''),
      nullif(line_item ->> 'sourceId', '')::uuid,
      (line_item ->> 'sequenceNo')::integer
    );
  end loop;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'trip', p_trip_id, 'PNL_CALCULATED', 'SYSTEM', jsonb_build_object('snapshot_id', snapshot_id, 'formula_version', p_formula_version));

  return snapshot_id;
end;
$$;

create or replace function public.driver_start_assigned_leg(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_odometer_km numeric,
  p_load_state text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_vehicle_id uuid;
  leg_id uuid;
  latest_odometer numeric;
begin
  if p_odometer_km < 0 or p_load_state not in ('LOADED', 'EMPTY') then
    raise exception 'Invalid odometer or load state';
  end if;
  select vehicle_id into assigned_vehicle_id
  from public.trips
  where id = p_trip_id and organization_id = p_organization_id and driver_id = p_driver_id and status = 'ACTIVE' and deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  select max(value_km) into latest_odometer
  from public.odometer_records
  where organization_id = p_organization_id and vehicle_id = assigned_vehicle_id;
  if latest_odometer is not null and p_odometer_km < latest_odometer then raise exception 'Odometer cannot decrease'; end if;

  select id into leg_id
  from public.trip_legs
  where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null
    and start_odometer_km is null and end_odometer_km is null
  order by sequence_no
  limit 1
  for update;
  if not found then raise exception 'No planned leg is available'; end if;

  update public.trip_legs
  set start_at = now(), start_odometer_km = p_odometer_km, load_state = p_load_state::public.trip_leg_load_state, updated_at = now()
  where id = leg_id;
  insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
  values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_odometer_km, now(), 'TELEGRAM');
  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'trip_leg', leg_id, 'STARTED', 'TELEGRAM', jsonb_build_object('odometer_km', p_odometer_km, 'load_state', p_load_state));
  return leg_id;
end;
$$;

create or replace function public.driver_finish_assigned_leg(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_odometer_km numeric
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_vehicle_id uuid;
  leg_id uuid;
  start_odometer numeric;
begin
  if p_odometer_km < 0 then raise exception 'Invalid odometer'; end if;
  select vehicle_id into assigned_vehicle_id
  from public.trips
  where id = p_trip_id and organization_id = p_organization_id and driver_id = p_driver_id and status = 'ACTIVE' and deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  select id, start_odometer_km into leg_id, start_odometer
  from public.trip_legs
  where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null
    and start_odometer_km is not null and end_odometer_km is null
  order by sequence_no
  limit 1
  for update;
  if not found then raise exception 'No active leg is available'; end if;
  if p_odometer_km < start_odometer then raise exception 'Odometer cannot decrease'; end if;

  update public.trip_legs
  set end_at = now(), end_odometer_km = p_odometer_km, distance_km = p_odometer_km - start_odometer, updated_at = now()
  where id = leg_id;
  insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
  values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_odometer_km, now(), 'TELEGRAM');
  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'trip_leg', leg_id, 'COMPLETED', 'TELEGRAM', jsonb_build_object('odometer_km', p_odometer_km, 'distance_km', p_odometer_km - start_odometer));
  return leg_id;
end;
$$;

create or replace function public.complete_trip_from_facts(
  p_organization_id uuid,
  p_trip_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_owner_or_manager(p_organization_id) then raise exception 'Only an owner or manager can complete a trip'; end if;
  if not exists (
    select 1 from public.trips where id = p_trip_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null
  ) then raise exception 'Active trip is unavailable'; end if;
  if exists (
    select 1 from public.trip_legs
    where organization_id = p_organization_id and trip_id = p_trip_id and deleted_at is null
      and (start_odometer_km is null or end_odometer_km is null or end_at is null or load_state = 'UNKNOWN')
  ) then raise exception 'Every trip leg must have a completed odometer and load state'; end if;

  update public.trips set status = 'COMPLETED', completed_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_trip_id and organization_id = p_organization_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source)
  values (p_organization_id, 'trip', p_trip_id, 'COMPLETED', auth.uid(), 'WEB');
  return p_trip_id;
end;
$$;

-- Telegram-provided amounts are facts awaiting review. Existing records stay approved,
-- so the already deployed dashboard remains historically consistent.
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
  where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.driver_id = p_driver_id and trip.status = 'ACTIVE' and trip.deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  select category.id into category_id
  from public.expense_categories category
  where category.organization_id = p_organization_id and category.code = upper(trim(p_category_code)) and category.is_active;
  if not found then raise exception 'Expense category is not available'; end if;
  if upper(trim(p_category_code)) = 'FUEL' and (p_quantity is null or p_unit <> 'L' or p_price_per_unit is null) then
    raise exception 'Fuel must include litres and price per litre';
  end if;

  if p_odometer_km is not null then
    select max(record.value_km) into last_odometer_km
    from public.odometer_records record
    where record.organization_id = p_organization_id and record.vehicle_id = assigned_vehicle_id and record.recorded_at <= p_occurred_at;
    if last_odometer_km is not null and p_odometer_km < last_odometer_km then raise exception 'Odometer cannot be lower than the latest record'; end if;
  end if;

  insert into public.expenses (
    organization_id, vehicle_id, driver_id, trip_id, category_id, amount, currency,
    occurred_at, odometer_km, quantity, unit, price_per_unit, location_text, comment, source, review_status
  ) values (
    p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, category_id, round(p_amount, 2), p_currency,
    p_occurred_at, p_odometer_km, p_quantity, p_unit, p_price_per_unit, p_location_text, p_comment, 'TELEGRAM', 'PENDING'
  ) returning id into expense_id;

  if p_odometer_km is not null then
    insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
    values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_odometer_km, p_occurred_at, 'TELEGRAM');
  end if;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'expense', expense_id, 'CREATED', 'TELEGRAM', jsonb_build_object('amount', round(p_amount, 2), 'currency', p_currency, 'review_status', 'PENDING'));
  return expense_id;
end;
$$;

create or replace view public.trip_financial_summary
with (security_invoker = true)
as
with leg_totals as (
  select trip_id, organization_id,
    coalesce(sum(distance_km), 0) as total_km,
    coalesce(sum(distance_km) filter (where load_state = 'LOADED'), 0) as loaded_km,
    coalesce(sum(distance_km) filter (where load_state = 'EMPTY'), 0) as empty_km
  from public.trip_legs where deleted_at is null group by trip_id, organization_id
), income_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as revenue
  from public.incomes where deleted_at is null and payment_status <> 'VOIDED' group by trip_id, organization_id
), expense_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as expenses
  from public.expenses where deleted_at is null and status <> 'VOIDED' and review_status = 'APPROVED' group by trip_id, organization_id
), compensation_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as driver_compensation
  from public.driver_compensation_calculations where calculation_status <> 'VOIDED' group by trip_id, organization_id
), default_tax as (
  select organization_id, estimated_income_tax_rate from public.tax_profiles where is_default and valid_to is null
)
select
  trip.id as trip_id, trip.organization_id,
  coalesce(income.revenue, 0) as revenue, coalesce(expense.expenses, 0) as expenses,
  coalesce(compensation.driver_compensation, 0) as driver_compensation,
  coalesce(leg.total_km, 0) as total_km, coalesce(leg.loaded_km, 0) as loaded_km, coalesce(leg.empty_km, 0) as empty_km,
  case when coalesce(leg.total_km, 0) > 0 then round(coalesce(leg.empty_km, 0) / leg.total_km * 100, 2) end as empty_mileage_pct,
  coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0) as profit_before_estimated_tax,
  round(greatest(coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0), 0) * coalesce(tax.estimated_income_tax_rate, 0), 2) as estimated_tax,
  coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0) - round(greatest(coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0), 0) * coalesce(tax.estimated_income_tax_rate, 0), 2) as operating_profit,
  case when coalesce(leg.total_km, 0) > 0 then round((coalesce(expense.expenses, 0) + coalesce(compensation.driver_compensation, 0)) / leg.total_km, 2) end as cost_per_km,
  case when coalesce(leg.total_km, 0) > 0 then round((coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0) - round(greatest(coalesce(income.revenue, 0) - coalesce(expense.expenses, 0) - coalesce(compensation.driver_compensation, 0), 0) * coalesce(tax.estimated_income_tax_rate, 0), 2)) / leg.total_km, 2) end as profit_per_km
from public.trips trip
left join leg_totals leg on leg.trip_id = trip.id
left join income_totals income on income.trip_id = trip.id
left join expense_totals expense on expense.trip_id = trip.id
left join compensation_totals compensation on compensation.trip_id = trip.id
left join default_tax tax on tax.organization_id = trip.organization_id
where trip.deleted_at is null;

alter table public.pnl_snapshots enable row level security;
alter table public.pnl_lines enable row level security;

create policy pnl_snapshots_select_member on public.pnl_snapshots for select
  using (public.is_active_member(organization_id));
create policy pnl_lines_select_member on public.pnl_lines for select
  using (public.is_active_member(organization_id));

grant select on public.pnl_snapshots, public.pnl_lines to authenticated;

revoke all on function public.review_expense(uuid, uuid, text, text) from public;
revoke all on function public.publish_trip_pnl(uuid, uuid, text, char(64), char(3), jsonb, jsonb, jsonb) from public;
revoke all on function public.record_telegram_expense(uuid, uuid, uuid, text, numeric, char(3), timestamptz, numeric, numeric, text, numeric, text, text) from public;
revoke all on function public.driver_start_assigned_leg(uuid, uuid, uuid, numeric, text) from public;
revoke all on function public.driver_finish_assigned_leg(uuid, uuid, uuid, numeric) from public;
revoke all on function public.complete_trip_from_facts(uuid, uuid) from public;

grant execute on function public.review_expense(uuid, uuid, text, text) to authenticated;
grant execute on function public.publish_trip_pnl(uuid, uuid, text, char(64), char(3), jsonb, jsonb, jsonb) to service_role;
grant execute on function public.record_telegram_expense(uuid, uuid, uuid, text, numeric, char(3), timestamptz, numeric, numeric, text, numeric, text, text) to service_role;
grant execute on function public.driver_start_assigned_leg(uuid, uuid, uuid, numeric, text) to service_role;
grant execute on function public.driver_finish_assigned_leg(uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.complete_trip_from_facts(uuid, uuid) to authenticated;
