create type public.telegram_update_status as enum ('RECEIVED', 'PROCESSED', 'FAILED');

create table public.telegram_driver_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null,
  code_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  check (expires_at > created_at),
  check ((used_at is null and used_by_telegram_user_id is null) or (used_at is not null and used_by_telegram_user_id is not null))
);

create unique index telegram_driver_invites_one_open_per_driver
  on public.telegram_driver_invites (driver_id) where used_at is null;

create table public.telegram_update_logs (
  telegram_update_id bigint primary key,
  status public.telegram_update_status not null default 'RECEIVED',
  error_summary text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  check ((status = 'PROCESSED' and processed_at is not null) or status <> 'PROCESSED')
);

create table public.telegram_conversations (
  conversation_key text primary key,
  state jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state) = 'object')
);

create index telegram_conversations_expiry_idx on public.telegram_conversations (expires_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_driver_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint
)
returns table (organization_id uuid, driver_id uuid, driver_name text, base_currency char(3))
language plpgsql
security definer set search_path = public
as $$
declare
  invite public.telegram_driver_invites%rowtype;
  linked_driver public.drivers%rowtype;
begin
  if p_telegram_user_id <= 0 or length(trim(p_invitation_code)) < 32 then
    raise exception 'Invalid invitation';
  end if;

  select * into invite
  from public.telegram_driver_invites
  where code_hash = encode(digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if invite.used_at is not null and invite.used_by_telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation is already used';
  end if;
  if invite.used_at is null and invite.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;

  select * into linked_driver
  from public.drivers
  where id = invite.driver_id and organization_id = invite.organization_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Driver not found';
  end if;
  if linked_driver.telegram_user_id is not null and linked_driver.telegram_user_id <> p_telegram_user_id then
    raise exception 'Driver is already linked to another Telegram account';
  end if;

  update public.drivers
  set telegram_user_id = p_telegram_user_id, status = 'ACTIVE', updated_at = now()
  where id = linked_driver.id;

  update public.telegram_driver_invites
  set used_at = coalesce(used_at, now()), used_by_telegram_user_id = p_telegram_user_id
  where id = invite.id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (
    invite.organization_id,
    'driver',
    linked_driver.id,
    'TELEGRAM_LINKED',
    'TELEGRAM',
    jsonb_build_object('telegram_user_id', p_telegram_user_id)
  );

  return query
  select organization.id, linked_driver.id, linked_driver.display_name, organization.base_currency
  from public.organizations organization
  where organization.id = invite.organization_id;
end;
$$;

create or replace function public.reserve_telegram_update(p_telegram_update_id bigint)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if p_telegram_update_id <= 0 then
    raise exception 'Invalid Telegram update id';
  end if;

  insert into public.telegram_update_logs (telegram_update_id)
  values (p_telegram_update_id)
  on conflict (telegram_update_id) do update
    set status = 'RECEIVED', error_summary = null, received_at = now(), processed_at = null
    where public.telegram_update_logs.status = 'FAILED'
  returning telegram_update_id into p_telegram_update_id;

  return found;
end;
$$;

create or replace function public.finish_telegram_update(
  p_telegram_update_id bigint,
  p_status public.telegram_update_status,
  p_error_summary text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_status = 'RECEIVED' then
    raise exception 'Final Telegram update status must be PROCESSED or FAILED';
  end if;

  update public.telegram_update_logs
  set status = p_status,
      error_summary = case when p_status = 'FAILED' then left(coalesce(p_error_summary, 'Unhandled error'), 500) else null end,
      processed_at = now()
  where telegram_update_id = p_telegram_update_id;
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
  if p_amount <= 0 then
    raise exception 'Expense amount must be positive';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency';
  end if;

  select trip.vehicle_id into assigned_vehicle_id
  from public.trips trip
  where trip.id = p_trip_id
    and trip.organization_id = p_organization_id
    and trip.driver_id = p_driver_id
    and trip.status = 'ACTIVE'
    and trip.deleted_at is null;
  if not found then
    raise exception 'No active trip is assigned to this driver';
  end if;

  select category.id into category_id
  from public.expense_categories category
  where category.organization_id = p_organization_id
    and category.code = upper(trim(p_category_code))
    and category.is_active;
  if not found then
    raise exception 'Expense category is not available';
  end if;

  if upper(trim(p_category_code)) = 'FUEL' and (p_quantity is null or p_unit <> 'L' or p_price_per_unit is null) then
    raise exception 'Fuel must include litres and price per litre';
  end if;

  if p_odometer_km is not null then
    select max(record.value_km) into last_odometer_km
    from public.odometer_records record
    where record.organization_id = p_organization_id
      and record.vehicle_id = assigned_vehicle_id
      and record.recorded_at <= p_occurred_at;
    if last_odometer_km is not null and p_odometer_km < last_odometer_km then
      raise exception 'Odometer cannot be lower than the latest record';
    end if;
  end if;

  insert into public.expenses (
    organization_id, vehicle_id, driver_id, trip_id, category_id, amount, currency,
    occurred_at, odometer_km, quantity, unit, price_per_unit, location_text, comment, source
  ) values (
    p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, category_id, round(p_amount, 2), p_currency,
    p_occurred_at, p_odometer_km, p_quantity, p_unit, p_price_per_unit, p_location_text, p_comment, 'TELEGRAM'
  ) returning id into expense_id;

  if p_odometer_km is not null then
    insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
    values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_odometer_km, p_occurred_at, 'TELEGRAM');
  end if;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'expense', expense_id, 'CREATED', 'TELEGRAM', jsonb_build_object('amount', round(p_amount, 2), 'currency', p_currency));

  return expense_id;
end;
$$;

create or replace function public.record_telegram_odometer(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_value_km numeric,
  p_recorded_at timestamptz
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_vehicle_id uuid;
  last_odometer_km numeric;
  odometer_id uuid;
begin
  if p_value_km < 0 then
    raise exception 'Odometer must not be negative';
  end if;
  select trip.vehicle_id into assigned_vehicle_id
  from public.trips trip
  where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.driver_id = p_driver_id and trip.status = 'ACTIVE' and trip.deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  select max(record.value_km) into last_odometer_km
  from public.odometer_records record
  where record.organization_id = p_organization_id and record.vehicle_id = assigned_vehicle_id and record.recorded_at <= p_recorded_at;
  if last_odometer_km is not null and p_value_km < last_odometer_km then raise exception 'Odometer cannot be lower than the latest record'; end if;

  insert into public.odometer_records (organization_id, vehicle_id, driver_id, trip_id, value_km, recorded_at, source)
  values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_value_km, p_recorded_at, 'TELEGRAM')
  returning id into odometer_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'odometer_record', odometer_id, 'CREATED', 'TELEGRAM', jsonb_build_object('value_km', p_value_km));
  return odometer_id;
end;
$$;

create or replace function public.record_telegram_vehicle_status(
  p_organization_id uuid,
  p_driver_id uuid,
  p_trip_id uuid,
  p_status_code text,
  p_load_state text,
  p_location_text text,
  p_recorded_at timestamptz
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_vehicle_id uuid;
  status_id uuid;
begin
  if p_status_code not in ('AT_LOADING', 'LOADED', 'IN_TRANSIT', 'AT_UNLOADING', 'UNLOADED', 'IDLE', 'DELAY') then
    raise exception 'Invalid vehicle status';
  end if;
  if p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') then
    raise exception 'Invalid load state';
  end if;

  select trip.vehicle_id into assigned_vehicle_id
  from public.trips trip
  where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.driver_id = p_driver_id and trip.status = 'ACTIVE' and trip.deleted_at is null;
  if not found then raise exception 'No active trip is assigned to this driver'; end if;

  insert into public.vehicle_status_records (organization_id, vehicle_id, driver_id, trip_id, status_code, load_state, location_text, recorded_at, source)
  values (p_organization_id, assigned_vehicle_id, p_driver_id, p_trip_id, p_status_code, p_load_state::public.trip_leg_load_state, nullif(trim(p_location_text), ''), p_recorded_at, 'TELEGRAM')
  returning id into status_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (p_organization_id, 'vehicle_status_record', status_id, 'CREATED', 'TELEGRAM', jsonb_build_object('status_code', p_status_code, 'load_state', p_load_state));
  return status_id;
end;
$$;

alter table public.telegram_driver_invites enable row level security;
alter table public.telegram_update_logs enable row level security;
alter table public.telegram_conversations enable row level security;

create policy telegram_driver_invites_manage_operator on public.telegram_driver_invites for all
  using (public.is_owner_or_manager(organization_id))
  with check (public.is_owner_or_manager(organization_id));

create trigger telegram_conversations_set_updated_at before update on public.telegram_conversations for each row execute procedure public.set_updated_at();

revoke all on function public.claim_driver_telegram_invite(text, bigint) from public;
revoke all on function public.reserve_telegram_update(bigint) from public;
revoke all on function public.finish_telegram_update(bigint, public.telegram_update_status, text) from public;
revoke all on function public.record_telegram_expense(uuid, uuid, uuid, text, numeric, char(3), timestamptz, numeric, numeric, text, numeric, text, text) from public;
revoke all on function public.record_telegram_odometer(uuid, uuid, uuid, numeric, timestamptz) from public;
revoke all on function public.record_telegram_vehicle_status(uuid, uuid, uuid, text, text, text, timestamptz) from public;

grant execute on function public.claim_driver_telegram_invite(text, bigint) to service_role;
grant execute on function public.reserve_telegram_update(bigint) to service_role;
grant execute on function public.finish_telegram_update(bigint, public.telegram_update_status, text) to service_role;
grant execute on function public.record_telegram_expense(uuid, uuid, uuid, text, numeric, char(3), timestamptz, numeric, numeric, text, numeric, text, text) to service_role;
grant execute on function public.record_telegram_odometer(uuid, uuid, uuid, numeric, timestamptz) to service_role;
grant execute on function public.record_telegram_vehicle_status(uuid, uuid, uuid, text, text, text, timestamptz) to service_role;
