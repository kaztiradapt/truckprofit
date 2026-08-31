create extension if not exists pgcrypto;

create type public.organization_role as enum ('OWNER', 'MANAGER', 'DRIVER');
create type public.member_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED');
create type public.trip_status as enum ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
create type public.trip_leg_load_state as enum ('LOADED', 'EMPTY', 'UNKNOWN');
create type public.expense_source as enum ('WEB', 'TELEGRAM', 'IMPORT');
create type public.expense_status as enum ('RECORDED', 'VOIDED');
create type public.income_payment_status as enum ('PLANNED', 'INVOICED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOIDED');
create type public.compensation_rule_type as enum ('PER_KM', 'PERCENT_OF_PROFIT', 'DAILY_ALLOWANCE', 'GEO_DAILY_ALLOWANCE', 'IDLE_PROGRESSIVE');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  base_currency char(3) not null default 'KZT' check (base_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Qostanay',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null,
  status public.member_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  external_reference text,
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  telegram_user_id bigint,
  status text not null default 'ACTIVE' check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, profile_id),
  unique (organization_id, telegram_user_id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_reference text,
  plate_number text not null,
  display_name text not null,
  make_model text,
  fuel_norm_l_per_100km numeric(7, 2) check (fuel_norm_l_per_100km is null or fuel_norm_l_per_100km > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, plate_number)
);

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plate_number text not null,
  display_name text not null,
  trailer_type text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, plate_number)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_reference text,
  vehicle_id uuid not null,
  trailer_id uuid,
  driver_id uuid,
  title text not null,
  status public.trip_status not null default 'DRAFT',
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, external_reference),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (trailer_id, organization_id) references public.trailers(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table public.trip_legs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  origin_city text not null,
  destination_city text not null,
  cargo_name text,
  load_state public.trip_leg_load_state not null default 'UNKNOWN',
  start_at timestamptz,
  end_at timestamptz,
  start_odometer_km numeric(12, 1) check (start_odometer_km is null or start_odometer_km >= 0),
  end_odometer_km numeric(12, 1) check (end_odometer_km is null or end_odometer_km >= 0),
  distance_km numeric(10, 1) check (distance_km is null or distance_km >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  unique (trip_id, sequence_no),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id) on delete cascade,
  check (end_at is null or start_at is null or end_at >= start_at),
  check (end_odometer_km is null or start_odometer_km is null or end_odometer_km >= start_odometer_km)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  display_name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  driver_id uuid,
  trip_id uuid,
  trip_leg_id uuid,
  category_id uuid not null,
  amount numeric(16, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  quantity numeric(14, 3) check (quantity is null or quantity > 0),
  unit text,
  price_per_unit numeric(16, 4) check (price_per_unit is null or price_per_unit > 0),
  location_text text,
  comment text,
  source public.expense_source not null,
  status public.expense_status not null default 'RECORDED',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id),
  foreign key (trip_leg_id, organization_id) references public.trip_legs(id, organization_id),
  foreign key (category_id, organization_id) references public.expense_categories(id, organization_id),
  check (deleted_at is null or deleted_reason is not null),
  check (quantity is null or price_per_unit is null or abs(amount - round(quantity * price_per_unit, 2)) <= 1)
);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trip_id uuid not null,
  trip_leg_id uuid,
  customer_name text,
  amount numeric(16, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  vat_included boolean not null default false,
  payment_status public.income_payment_status not null default 'PLANNED',
  expected_payment_at date,
  paid_at date,
  comment text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id),
  foreign key (trip_leg_id, organization_id) references public.trip_legs(id, organization_id),
  check (deleted_at is null or deleted_reason is not null),
  check (paid_at is null or payment_status in ('PAID', 'PARTIAL'))
);

create table public.odometer_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  driver_id uuid,
  trip_id uuid,
  value_km numeric(12, 1) not null check (value_km >= 0),
  recorded_at timestamptz not null,
  source public.expense_source not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id)
);

create table public.vehicle_status_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  driver_id uuid,
  trip_id uuid,
  trip_leg_id uuid,
  load_state public.trip_leg_load_state not null,
  status_code text not null check (status_code in ('AT_LOADING', 'LOADED', 'IN_TRANSIT', 'AT_UNLOADING', 'UNLOADED', 'IDLE', 'DELAY')),
  location_text text,
  recorded_at timestamptz not null,
  source public.expense_source not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id),
  foreign key (trip_leg_id, organization_id) references public.trip_legs(id, organization_id)
);

create table public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  vat_payer boolean not null default false,
  vat_rate numeric(7, 4) not null default 0 check (vat_rate between 0 and 1),
  estimated_income_tax_rate numeric(7, 4) not null default 0 check (estimated_income_tax_rate between 0 and 1),
  is_default boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (valid_to is null or valid_to >= valid_from)
);

create unique index tax_profiles_one_default_per_org
  on public.tax_profiles (organization_id) where is_default and valid_to is null;

create table public.driver_compensation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null,
  name text not null,
  rule_type public.compensation_rule_type not null,
  config jsonb not null default '{}'::jsonb,
  valid_from date not null,
  valid_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  check (jsonb_typeof(config) = 'object'),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.driver_compensation_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null,
  trip_id uuid,
  rule_id uuid,
  amount numeric(16, 2) not null check (amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  calculation_status text not null default 'PRELIMINARY' check (calculation_status in ('PRELIMINARY', 'APPROVED', 'VOIDED')),
  breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (trip_id, organization_id) references public.trips(id, organization_id),
  foreign key (rule_id, organization_id) references public.driver_compensation_rules(id, organization_id),
  check (jsonb_typeof(breakdown) = 'object'),
  check (approved_at is null or approved_by is not null)
);

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  maintenance_type text not null,
  occurred_at timestamptz not null,
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  amount numeric(16, 2) check (amount is null or amount >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  next_due_odometer_km numeric(12, 1) check (next_due_odometer_km is null or next_due_odometer_km >= 0),
  next_due_at date,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid,
  storage_bucket text not null default 'expense-receipts',
  storage_path text not null,
  original_filename text,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (storage_bucket, storage_path),
  foreign key (expense_id, organization_id) references public.expenses(id, organization_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  source text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index trips_org_status_idx on public.trips (organization_id, status, started_at desc);
create index trip_legs_trip_idx on public.trip_legs (trip_id, sequence_no);
create index expenses_org_date_idx on public.expenses (organization_id, occurred_at desc) where deleted_at is null;
create index expenses_trip_idx on public.expenses (trip_id, occurred_at desc) where deleted_at is null;
create index incomes_trip_idx on public.incomes (trip_id, expected_payment_at) where deleted_at is null;
create index odometer_vehicle_idx on public.odometer_records (vehicle_id, recorded_at desc);
create index vehicle_status_trip_idx on public.vehicle_status_records (trip_id, recorded_at desc);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_active_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles public.organization_role[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function public.is_owner_or_manager(target_organization_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_org_role(target_organization_id, array['OWNER', 'MANAGER']::public.organization_role[]);
$$;

create or replace function public.is_current_driver(target_organization_id uuid, target_driver_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.drivers driver
    where driver.organization_id = target_organization_id
      and driver.id = target_driver_id
      and driver.profile_id = auth.uid()
      and driver.status = 'ACTIVE'
      and driver.deleted_at is null
  );
$$;

create or replace function public.can_access_trip(target_organization_id uuid, target_trip_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_owner_or_manager(target_organization_id)
  or exists (
    select 1
    from public.trips trip
    join public.drivers driver on driver.id = trip.driver_id
    where trip.organization_id = target_organization_id
      and trip.id = target_trip_id
      and driver.profile_id = auth.uid()
      and trip.deleted_at is null
  );
$$;

create or replace function public.create_organization_with_owner(
  input_name text,
  input_slug text,
  input_currency char(3) default 'KZT',
  input_timezone text default 'Asia/Qostanay'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;

  insert into public.organizations (name, slug, base_currency, timezone)
  values (input_name, input_slug, input_currency, input_timezone)
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (new_organization_id, auth.uid(), 'OWNER', 'ACTIVE');

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (new_organization_id, 'organization', new_organization_id, 'CREATED', auth.uid(), 'WEB', jsonb_build_object('name', input_name));

  return new_organization_id;
end;
$$;

create or replace function public.validate_expense_relations()
returns trigger
language plpgsql
as $$
declare
  trip_vehicle_id uuid;
  leg_trip_id uuid;
begin
  if new.trip_id is not null then
    select vehicle_id into trip_vehicle_id
    from public.trips
    where id = new.trip_id and organization_id = new.organization_id;

    if trip_vehicle_id is null or trip_vehicle_id <> new.vehicle_id then
      raise exception 'Expense vehicle must match the trip vehicle';
    end if;
  end if;

  if new.trip_leg_id is not null then
    select trip_id into leg_trip_id
    from public.trip_legs
    where id = new.trip_leg_id and organization_id = new.organization_id;

    if leg_trip_id is null or new.trip_id is null or leg_trip_id <> new.trip_id then
      raise exception 'Expense trip_leg must belong to the expense trip';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_income_relations()
returns trigger
language plpgsql
as $$
declare
  leg_trip_id uuid;
begin
  if new.trip_leg_id is not null then
    select trip_id into leg_trip_id
    from public.trip_legs
    where id = new.trip_leg_id and organization_id = new.organization_id;

    if leg_trip_id is null or leg_trip_id <> new.trip_id then
      raise exception 'Income trip_leg must belong to the income trip';
    end if;
  end if;

  return new;
end;
$$;

create or replace view public.trip_financial_summary
with (security_invoker = true)
as
with leg_totals as (
  select
    trip_id,
    organization_id,
    coalesce(sum(distance_km), 0) as total_km,
    coalesce(sum(distance_km) filter (where load_state = 'LOADED'), 0) as loaded_km,
    coalesce(sum(distance_km) filter (where load_state = 'EMPTY'), 0) as empty_km
  from public.trip_legs
  where deleted_at is null
  group by trip_id, organization_id
), income_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as revenue
  from public.incomes
  where deleted_at is null and payment_status <> 'VOIDED'
  group by trip_id, organization_id
), expense_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as expenses
  from public.expenses
  where deleted_at is null and status <> 'VOIDED'
  group by trip_id, organization_id
), compensation_totals as (
  select trip_id, organization_id, coalesce(sum(amount), 0) as driver_compensation
  from public.driver_compensation_calculations
  where calculation_status <> 'VOIDED'
  group by trip_id, organization_id
), default_tax as (
  select organization_id, estimated_income_tax_rate
  from public.tax_profiles
  where is_default and valid_to is null
)
select
  trip.id as trip_id,
  trip.organization_id,
  coalesce(income.revenue, 0) as revenue,
  coalesce(expense.expenses, 0) as expenses,
  coalesce(compensation.driver_compensation, 0) as driver_compensation,
  coalesce(leg.total_km, 0) as total_km,
  coalesce(leg.loaded_km, 0) as loaded_km,
  coalesce(leg.empty_km, 0) as empty_km,
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

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.trailers enable row level security;
alter table public.trips enable row level security;
alter table public.trip_legs enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.odometer_records enable row level security;
alter table public.vehicle_status_records enable row level security;
alter table public.tax_profiles enable row level security;
alter table public.driver_compensation_rules enable row level security;
alter table public.driver_compensation_calculations enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own_or_shared_org on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_memberships own_membership
    join public.organization_memberships shared_membership on shared_membership.organization_id = own_membership.organization_id
    where own_membership.user_id = auth.uid()
      and own_membership.status = 'ACTIVE'
      and shared_membership.user_id = profiles.id
  )
);
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_member on public.organizations for select using (public.is_active_member(id));
create policy organizations_update_owner on public.organizations for update using (public.has_org_role(id, array['OWNER']::public.organization_role[])) with check (public.has_org_role(id, array['OWNER']::public.organization_role[]));

create policy memberships_select_member on public.organization_memberships for select using (public.is_active_member(organization_id));
create policy memberships_manage_owner on public.organization_memberships for all using (public.has_org_role(organization_id, array['OWNER']::public.organization_role[])) with check (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]));

create policy drivers_select_operator_or_self on public.drivers for select using (public.is_owner_or_manager(organization_id) or public.is_current_driver(organization_id, id));
create policy drivers_manage_operator on public.drivers for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy vehicles_select_operator_or_assigned_driver on public.vehicles for select using (
  public.is_owner_or_manager(organization_id)
  or exists (
    select 1 from public.trips trip
    where trip.vehicle_id = vehicles.id
      and public.can_access_trip(vehicles.organization_id, trip.id)
  )
);
create policy vehicles_manage_operator on public.vehicles for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy trailers_select_operator_or_assigned_driver on public.trailers for select using (
  public.is_owner_or_manager(organization_id)
  or exists (
    select 1 from public.trips trip
    where trip.trailer_id = trailers.id
      and public.can_access_trip(trailers.organization_id, trip.id)
  )
);
create policy trailers_manage_operator on public.trailers for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy trips_select_operator_or_assigned_driver on public.trips for select using (public.can_access_trip(organization_id, id));
create policy trips_manage_operator on public.trips for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy trip_legs_select_operator_or_assigned_driver on public.trip_legs for select using (public.can_access_trip(organization_id, trip_id));
create policy trip_legs_manage_operator on public.trip_legs for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy expense_categories_select_member on public.expense_categories for select using (public.is_active_member(organization_id));
create policy expense_categories_manage_operator on public.expense_categories for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy expenses_select_operator_or_own_driver on public.expenses for select using (public.is_owner_or_manager(organization_id) or public.is_current_driver(organization_id, driver_id));
create policy expenses_manage_operator on public.expenses for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy incomes_select_operator_or_assigned_driver on public.incomes for select using (public.can_access_trip(organization_id, trip_id));
create policy incomes_manage_operator on public.incomes for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy odometer_select_operator_or_own_driver on public.odometer_records for select using (public.is_owner_or_manager(organization_id) or public.is_current_driver(organization_id, driver_id));
create policy odometer_manage_operator on public.odometer_records for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy vehicle_status_select_operator_or_own_driver on public.vehicle_status_records for select using (public.is_owner_or_manager(organization_id) or public.is_current_driver(organization_id, driver_id));
create policy vehicle_status_manage_operator on public.vehicle_status_records for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy tax_profiles_manage_operator on public.tax_profiles for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));
create policy compensation_rules_manage_operator on public.driver_compensation_rules for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));
create policy compensation_calculations_select_operator_or_own_driver on public.driver_compensation_calculations for select using (public.is_owner_or_manager(organization_id) or public.is_current_driver(organization_id, driver_id));
create policy compensation_calculations_manage_operator on public.driver_compensation_calculations for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));
create policy maintenance_manage_operator on public.maintenance_records for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));

create policy attachments_select_operator_or_own_expense on public.attachments for select using (
  public.is_owner_or_manager(organization_id)
  or exists (
    select 1 from public.expenses expense
    where expense.id = attachments.expense_id
      and public.is_current_driver(attachments.organization_id, expense.driver_id)
  )
);
create policy attachments_manage_operator on public.attachments for all using (public.is_owner_or_manager(organization_id)) with check (public.is_owner_or_manager(organization_id));
create policy audit_events_operator_select on public.audit_events for select using (public.is_owner_or_manager(organization_id));

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations for each row execute procedure public.set_updated_at();
create trigger memberships_set_updated_at before update on public.organization_memberships for each row execute procedure public.set_updated_at();
create trigger drivers_set_updated_at before update on public.drivers for each row execute procedure public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute procedure public.set_updated_at();
create trigger trailers_set_updated_at before update on public.trailers for each row execute procedure public.set_updated_at();
create trigger trips_set_updated_at before update on public.trips for each row execute procedure public.set_updated_at();
create trigger trip_legs_set_updated_at before update on public.trip_legs for each row execute procedure public.set_updated_at();
create trigger expense_categories_set_updated_at before update on public.expense_categories for each row execute procedure public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute procedure public.set_updated_at();
create trigger incomes_set_updated_at before update on public.incomes for each row execute procedure public.set_updated_at();
create trigger tax_profiles_set_updated_at before update on public.tax_profiles for each row execute procedure public.set_updated_at();
create trigger compensation_rules_set_updated_at before update on public.driver_compensation_rules for each row execute procedure public.set_updated_at();
create trigger compensation_calculations_set_updated_at before update on public.driver_compensation_calculations for each row execute procedure public.set_updated_at();
create trigger maintenance_set_updated_at before update on public.maintenance_records for each row execute procedure public.set_updated_at();
create trigger expenses_validate_relations before insert or update on public.expenses for each row execute procedure public.validate_expense_relations();
create trigger incomes_validate_relations before insert or update on public.incomes for each row execute procedure public.validate_income_relations();

revoke all on function public.create_organization_with_owner(text, text, char(3), text) from public;
grant execute on function public.create_organization_with_owner(text, text, char(3), text) to authenticated;
