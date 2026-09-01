-- Office team roles, granular permissions and Telegram username invitations.
-- A Telegram username is only a discoverable label. Authorization is bound to
-- the immutable Telegram user id after the invite is claimed.

alter table public.profiles
  add column if not exists telegram_username text;

alter table public.profiles
  drop constraint if exists profiles_telegram_username_format;
alter table public.profiles
  add constraint profiles_telegram_username_format check (
    telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$'
  );

create table public.organization_access_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  permissions text[] not null default array[]::text[],
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (
    permissions <@ array[
      'VIEW_DASHBOARD',
      'VIEW_FINANCE',
      'MANAGE_VEHICLES',
      'MANAGE_DRIVERS',
      'MANAGE_TRIPS',
      'MANAGE_FINANCE',
      'REVIEW_EXPENSES',
      'MANAGE_TEAM',
      'DELETE_RECORDS'
    ]::text[]
  )
);

create unique index organization_access_roles_name_key
  on public.organization_access_roles (organization_id, lower(name));

alter table public.organization_memberships
  add column if not exists access_role_id uuid;

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
      array['VIEW_DASHBOARD', 'VIEW_FINANCE', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS', 'MANAGE_FINANCE', 'REVIEW_EXPENSES']::text[],
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

drop trigger if exists organizations_seed_access_roles on public.organizations;
create trigger organizations_seed_access_roles
  after insert on public.organizations
  for each row execute procedure public.seed_organization_access_roles();

insert into public.organization_access_roles (organization_id, name, permissions, is_system)
select
  organization.id,
  preset.name,
  preset.permissions,
  true
from public.organizations organization
cross join lateral (
  values
    ('Управляющий', array['VIEW_DASHBOARD', 'VIEW_FINANCE', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS', 'MANAGE_FINANCE', 'REVIEW_EXPENSES']::text[]),
    ('Диспетчер', array['VIEW_DASHBOARD', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS']::text[]),
    ('Наблюдатель', array['VIEW_DASHBOARD']::text[])
) as preset(name, permissions)
on conflict do nothing;

update public.organization_memberships membership
set access_role_id = role.id
from public.organization_access_roles role
where membership.organization_id = role.organization_id
  and membership.role = 'MANAGER'
  and membership.access_role_id is null
  and role.name = 'Управляющий';

alter table public.organization_memberships
  add constraint organization_memberships_access_role_fk
  foreign key (access_role_id, organization_id)
  references public.organization_access_roles(id, organization_id);

create table public.organization_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  access_role_id uuid references public.organization_access_roles(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  email text,
  telegram_user_id bigint,
  telegram_username text,
  status public.member_status not null default 'INVITED',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, profile_id),
  check (email is null or email = lower(trim(email))),
  check (telegram_user_id is null or telegram_user_id > 0),
  check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$'),
  foreign key (access_role_id, organization_id)
    references public.organization_access_roles(id, organization_id)
);

create unique index organization_staff_email_key
  on public.organization_staff (organization_id, lower(email))
  where email is not null;
create unique index organization_staff_telegram_id_key
  on public.organization_staff (organization_id, telegram_user_id)
  where telegram_user_id is not null;
create unique index organization_staff_telegram_username_key
  on public.organization_staff (organization_id, lower(telegram_username))
  where telegram_username is not null;

insert into public.organization_staff (
  organization_id,
  profile_id,
  access_role_id,
  display_name,
  status
)
select
  membership.organization_id,
  membership.user_id,
  membership.access_role_id,
  coalesce(nullif(trim(profile.display_name), ''), 'Сотрудник'),
  membership.status
from public.organization_memberships membership
join public.profiles profile on profile.id = membership.user_id
where membership.role in ('OWNER', 'MANAGER')
on conflict (organization_id, profile_id) do nothing;

create table public.telegram_staff_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null,
  code_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (staff_id, organization_id)
    references public.organization_staff(id, organization_id) on delete cascade,
  check (expires_at > created_at),
  check (
    (used_at is null and used_by_telegram_user_id is null)
    or (used_at is not null and used_by_telegram_user_id is not null)
  )
);

create unique index telegram_staff_invites_one_open_per_staff
  on public.telegram_staff_invites (staff_id)
  where used_at is null;

create or replace function public.has_org_permission(
  target_organization_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    left join public.organization_access_roles access_role
      on access_role.id = membership.access_role_id
      and access_role.organization_id = membership.organization_id
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and (
        membership.role = 'OWNER'
        or required_permission = any(coalesce(access_role.permissions, array[]::text[]))
      )
  );
$$;

create or replace function public.is_owner_or_manager(target_organization_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.has_org_permission(target_organization_id, 'VIEW_DASHBOARD');
$$;

-- Protect direct Data API writes too. VIEW_DASHBOARD alone never grants edits,
-- and DELETE_RECORDS is an explicit separate capability.
drop policy if exists drivers_manage_operator on public.drivers;
create policy drivers_insert_by_permission on public.drivers for insert with check (public.has_org_permission(organization_id, 'MANAGE_DRIVERS'));
create policy drivers_update_by_permission on public.drivers for update using (public.has_org_permission(organization_id, 'MANAGE_DRIVERS')) with check (public.has_org_permission(organization_id, 'MANAGE_DRIVERS'));
create policy drivers_delete_by_permission on public.drivers for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists vehicles_manage_operator on public.vehicles;
create policy vehicles_insert_by_permission on public.vehicles for insert with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy vehicles_update_by_permission on public.vehicles for update using (public.has_org_permission(organization_id, 'MANAGE_VEHICLES')) with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy vehicles_delete_by_permission on public.vehicles for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists trailers_manage_operator on public.trailers;
create policy trailers_insert_by_permission on public.trailers for insert with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy trailers_update_by_permission on public.trailers for update using (public.has_org_permission(organization_id, 'MANAGE_VEHICLES')) with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy trailers_delete_by_permission on public.trailers for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists trips_manage_operator on public.trips;
create policy trips_insert_by_permission on public.trips for insert with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy trips_update_by_permission on public.trips for update using (public.has_org_permission(organization_id, 'MANAGE_TRIPS')) with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy trips_delete_by_permission on public.trips for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists trip_legs_manage_operator on public.trip_legs;
create policy trip_legs_insert_by_permission on public.trip_legs for insert with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy trip_legs_update_by_permission on public.trip_legs for update using (public.has_org_permission(organization_id, 'MANAGE_TRIPS')) with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy trip_legs_delete_by_permission on public.trip_legs for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists expense_categories_manage_operator on public.expense_categories;
create policy expense_categories_insert_by_permission on public.expense_categories for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy expense_categories_update_by_permission on public.expense_categories for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy expense_categories_delete_by_permission on public.expense_categories for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists expenses_manage_operator on public.expenses;
drop policy if exists expenses_select_operator_or_own_driver on public.expenses;
create policy expenses_select_by_permission_or_driver on public.expenses for select using (
  public.has_org_permission(organization_id, 'VIEW_FINANCE')
  or public.has_org_permission(organization_id, 'REVIEW_EXPENSES')
  or public.is_current_driver(organization_id, driver_id)
);
create policy expenses_insert_by_permission on public.expenses for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy expenses_update_by_permission on public.expenses for update using (
  public.has_org_permission(organization_id, 'MANAGE_FINANCE')
  or public.has_org_permission(organization_id, 'REVIEW_EXPENSES')
) with check (
  public.has_org_permission(organization_id, 'MANAGE_FINANCE')
  or public.has_org_permission(organization_id, 'REVIEW_EXPENSES')
);
create policy expenses_delete_by_permission on public.expenses for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists incomes_manage_operator on public.incomes;
drop policy if exists incomes_select_operator_or_assigned_driver on public.incomes;
create policy incomes_select_by_permission_or_driver on public.incomes for select using (
  public.has_org_permission(organization_id, 'VIEW_FINANCE')
  or exists (
    select 1 from public.trips trip
    where trip.id = incomes.trip_id
      and public.is_current_driver(incomes.organization_id, trip.driver_id)
  )
);
create policy incomes_insert_by_permission on public.incomes for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy incomes_update_by_permission on public.incomes for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy incomes_delete_by_permission on public.incomes for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists odometer_manage_operator on public.odometer_records;
create policy odometer_insert_by_permission on public.odometer_records for insert with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy odometer_update_by_permission on public.odometer_records for update using (public.has_org_permission(organization_id, 'MANAGE_TRIPS')) with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy odometer_delete_by_permission on public.odometer_records for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists vehicle_status_manage_operator on public.vehicle_status_records;
create policy vehicle_status_insert_by_permission on public.vehicle_status_records for insert with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy vehicle_status_update_by_permission on public.vehicle_status_records for update using (public.has_org_permission(organization_id, 'MANAGE_TRIPS')) with check (public.has_org_permission(organization_id, 'MANAGE_TRIPS'));
create policy vehicle_status_delete_by_permission on public.vehicle_status_records for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists tax_profiles_manage_operator on public.tax_profiles;
create policy tax_profiles_select_finance on public.tax_profiles for select using (public.has_org_permission(organization_id, 'VIEW_FINANCE'));
create policy tax_profiles_insert_by_permission on public.tax_profiles for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy tax_profiles_update_by_permission on public.tax_profiles for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy tax_profiles_delete_by_permission on public.tax_profiles for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists compensation_rules_manage_operator on public.driver_compensation_rules;
create policy compensation_rules_select_finance on public.driver_compensation_rules for select using (public.has_org_permission(organization_id, 'VIEW_FINANCE'));
create policy compensation_rules_insert_by_permission on public.driver_compensation_rules for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy compensation_rules_update_by_permission on public.driver_compensation_rules for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy compensation_rules_delete_by_permission on public.driver_compensation_rules for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists compensation_calculations_select_operator_or_own_driver on public.driver_compensation_calculations;
drop policy if exists compensation_calculations_manage_operator on public.driver_compensation_calculations;
create policy compensation_calculations_select_by_permission_or_driver on public.driver_compensation_calculations for select using (
  public.has_org_permission(organization_id, 'VIEW_FINANCE')
  or public.is_current_driver(organization_id, driver_id)
);
create policy compensation_calculations_insert_by_permission on public.driver_compensation_calculations for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy compensation_calculations_update_by_permission on public.driver_compensation_calculations for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy compensation_calculations_delete_by_permission on public.driver_compensation_calculations for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists maintenance_manage_operator on public.maintenance_records;
create policy maintenance_select_dashboard on public.maintenance_records for select using (public.has_org_permission(organization_id, 'VIEW_DASHBOARD'));
create policy maintenance_insert_by_permission on public.maintenance_records for insert with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy maintenance_update_by_permission on public.maintenance_records for update using (public.has_org_permission(organization_id, 'MANAGE_VEHICLES')) with check (public.has_org_permission(organization_id, 'MANAGE_VEHICLES'));
create policy maintenance_delete_by_permission on public.maintenance_records for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists attachments_select_operator_or_own_expense on public.attachments;
drop policy if exists attachments_manage_operator on public.attachments;
create policy attachments_select_by_permission_or_driver on public.attachments for select using (
  public.has_org_permission(organization_id, 'VIEW_FINANCE')
  or public.has_org_permission(organization_id, 'REVIEW_EXPENSES')
  or exists (
    select 1 from public.expenses expense
    where expense.id = attachments.expense_id
      and public.is_current_driver(attachments.organization_id, expense.driver_id)
  )
);
create policy attachments_insert_by_permission on public.attachments for insert with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy attachments_update_by_permission on public.attachments for update using (public.has_org_permission(organization_id, 'MANAGE_FINANCE')) with check (public.has_org_permission(organization_id, 'MANAGE_FINANCE'));
create policy attachments_delete_by_permission on public.attachments for delete using (public.has_org_permission(organization_id, 'DELETE_RECORDS'));

drop policy if exists telegram_driver_invites_manage_operator on public.telegram_driver_invites;
create policy telegram_driver_invites_manage_by_permission on public.telegram_driver_invites for all
  using (public.has_org_permission(organization_id, 'MANAGE_DRIVERS'))
  with check (public.has_org_permission(organization_id, 'MANAGE_DRIVERS'));

drop policy if exists pnl_snapshots_select_member on public.pnl_snapshots;
drop policy if exists pnl_lines_select_member on public.pnl_lines;
create policy pnl_snapshots_select_finance on public.pnl_snapshots for select using (public.has_org_permission(organization_id, 'VIEW_FINANCE'));
create policy pnl_lines_select_finance on public.pnl_lines for select using (public.has_org_permission(organization_id, 'VIEW_FINANCE'));

alter table public.organization_access_roles enable row level security;
alter table public.organization_staff enable row level security;
alter table public.telegram_staff_invites enable row level security;

create policy access_roles_select_member on public.organization_access_roles for select using (public.is_active_member(organization_id));
create policy access_roles_manage_owner on public.organization_access_roles for all
  using (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]))
  with check (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]));

create policy organization_staff_select_team on public.organization_staff for select using (
  public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
  or public.has_org_permission(organization_id, 'MANAGE_TEAM')
  or profile_id = auth.uid()
);
create policy organization_staff_manage_owner on public.organization_staff for all
  using (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]))
  with check (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]));

create policy telegram_staff_invites_select_owner on public.telegram_staff_invites for select using (
  public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
);
create policy telegram_staff_invites_manage_owner on public.telegram_staff_invites for all
  using (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]))
  with check (public.has_org_role(organization_id, array['OWNER']::public.organization_role[]));

create trigger access_roles_set_updated_at before update on public.organization_access_roles for each row execute procedure public.set_updated_at();
create trigger organization_staff_set_updated_at before update on public.organization_staff for each row execute procedure public.set_updated_at();

create or replace function public.claim_staff_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint,
  p_telegram_username text default null
)
returns table (
  organization_id uuid,
  staff_id uuid,
  staff_name text,
  organization_name text,
  role_name text
)
language plpgsql
security definer set search_path = ''
as $$
declare
  invite public.telegram_staff_invites%rowtype;
  staff public.organization_staff%rowtype;
  normalized_username text;
begin
  normalized_username := nullif(regexp_replace(trim(coalesce(p_telegram_username, '')), '^@', ''), '');
  if p_telegram_user_id <= 0
    or left(trim(p_invitation_code), 6) <> 'staff_'
    or length(trim(p_invitation_code)) < 38
    or (normalized_username is not null and normalized_username !~ '^[A-Za-z0-9_]{5,32}$') then
    raise exception 'Invalid staff invitation';
  end if;

  select candidate.* into invite
  from public.telegram_staff_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invite.used_at is not null and invite.used_by_telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation is already used';
  end if;
  if invite.used_at is null and invite.expires_at <= now() then raise exception 'Invitation expired'; end if;

  select candidate.* into staff
  from public.organization_staff candidate
  where candidate.id = invite.staff_id
    and candidate.organization_id = invite.organization_id
    and candidate.status <> 'SUSPENDED'
  for update;
  if not found then raise exception 'Staff member not found'; end if;
  if staff.telegram_user_id is not null and staff.telegram_user_id <> p_telegram_user_id then
    raise exception 'Staff member is already linked';
  end if;
  if staff.telegram_username is not null
    and lower(staff.telegram_username) <> lower(coalesce(normalized_username, '')) then
    raise exception 'Telegram username does not match the invitation';
  end if;
  if exists (
    select 1 from public.organization_staff candidate
    where candidate.organization_id = staff.organization_id
      and candidate.telegram_user_id = p_telegram_user_id
      and candidate.id <> staff.id
  ) then
    raise exception 'Telegram account is already linked in this organization';
  end if;

  if staff.profile_id is not null then
    if exists (
      select 1 from public.profiles candidate
      where candidate.telegram_user_id = p_telegram_user_id
        and candidate.id <> staff.profile_id
    ) then
      raise exception 'Telegram account is linked to another profile';
    end if;
    update public.profiles
    set telegram_user_id = p_telegram_user_id,
        telegram_username = normalized_username,
        updated_at = now()
    where id = staff.profile_id
      and (telegram_user_id is null or telegram_user_id = p_telegram_user_id);
    if not found then raise exception 'Profile is linked to another Telegram account'; end if;
  end if;

  update public.organization_staff
  set telegram_user_id = p_telegram_user_id,
      telegram_username = normalized_username,
      status = 'ACTIVE',
      updated_at = now()
  where id = staff.id;

  update public.telegram_staff_invites
  set used_at = coalesce(used_at, now()),
      used_by_telegram_user_id = p_telegram_user_id
  where id = invite.id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (
    staff.organization_id,
    'organization_staff',
    staff.id,
    'TELEGRAM_LINKED',
    staff.profile_id,
    'TELEGRAM',
    jsonb_build_object('telegram_user_id', p_telegram_user_id)
  );

  return query
  select staff.organization_id, staff.id, staff.display_name, organization.name, coalesce(access_role.name, 'Сотрудник')
  from public.organizations organization
  left join public.organization_access_roles access_role on access_role.id = staff.access_role_id
  where organization.id = staff.organization_id;
end;
$$;

create or replace function public.sync_telegram_username(
  p_telegram_user_id bigint,
  p_telegram_username text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_username text;
begin
  if p_telegram_user_id <= 0 then raise exception 'Invalid Telegram user id'; end if;
  normalized_username := nullif(regexp_replace(trim(coalesce(p_telegram_username, '')), '^@', ''), '');
  if normalized_username is not null and normalized_username !~ '^[A-Za-z0-9_]{5,32}$' then
    raise exception 'Invalid Telegram username';
  end if;
  update public.profiles
  set telegram_username = normalized_username, updated_at = now()
  where telegram_user_id = p_telegram_user_id
    and telegram_username is distinct from normalized_username;
  update public.organization_staff
  set telegram_username = normalized_username, updated_at = now()
  where telegram_user_id = p_telegram_user_id
    and telegram_username is distinct from normalized_username;
end;
$$;

-- Server-side RPC authorization follows the same permission matrix.
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
declare trip_id uuid;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then raise exception 'Trip management permission required'; end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_origin_city)) < 2 or char_length(trim(p_destination_city)) < 2 then raise exception 'Trip title and cities are required'; end if;
  if p_load_state not in ('LOADED', 'EMPTY', 'UNKNOWN') then raise exception 'Invalid load state'; end if;
  if not exists (select 1 from public.vehicles vehicle where vehicle.id = p_vehicle_id and vehicle.organization_id = p_organization_id and vehicle.deleted_at is null and vehicle.status = 'ACTIVE') then raise exception 'Vehicle is unavailable'; end if;
  if p_driver_id is not null and not exists (select 1 from public.drivers driver where driver.id = p_driver_id and driver.organization_id = p_organization_id and driver.deleted_at is null and driver.status = 'ACTIVE') then raise exception 'Driver is unavailable'; end if;
  insert into public.trips (organization_id, vehicle_id, driver_id, title, status, started_at, created_by, updated_by)
  values (p_organization_id, p_vehicle_id, p_driver_id, trim(p_title), 'ACTIVE', p_started_at, auth.uid(), auth.uid()) returning id into trip_id;
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
declare income_id uuid;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_FINANCE') then raise exception 'Finance management permission required'; end if;
  if p_amount <= 0 or p_currency !~ '^[A-Z]{3}$' then raise exception 'Income amount and currency are invalid'; end if;
  if not exists (select 1 from public.trips trip where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.deleted_at is null) then raise exception 'Trip is unavailable'; end if;
  insert into public.incomes (organization_id, trip_id, customer_name, amount, currency, payment_status, expected_payment_at, comment, created_by, updated_by)
  values (p_organization_id, p_trip_id, nullif(trim(p_customer_name), ''), round(p_amount, 2), p_currency, 'PLANNED', p_expected_payment_at, nullif(trim(p_comment), ''), auth.uid(), auth.uid()) returning id into income_id;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (p_organization_id, 'income', income_id, 'CREATED', auth.uid(), 'WEB', jsonb_build_object('amount', round(p_amount, 2), 'currency', p_currency));
  return income_id;
end;
$$;

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
declare resulting_status public.expense_review_status;
begin
  if not public.has_org_permission(p_organization_id, 'REVIEW_EXPENSES') then raise exception 'Expense review permission required'; end if;
  if upper(trim(p_decision)) not in ('APPROVED', 'REJECTED') then raise exception 'Expense decision must be APPROVED or REJECTED'; end if;
  resulting_status := upper(trim(p_decision))::public.expense_review_status;
  update public.expenses
  set review_status = resulting_status, reviewed_at = now(), reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), updated_at = now()
  where id = p_expense_id and organization_id = p_organization_id and deleted_at is null and status <> 'VOIDED' and review_status = 'PENDING';
  if not found then raise exception 'Pending expense is unavailable'; end if;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (p_organization_id, 'expense', p_expense_id, case when resulting_status = 'APPROVED' then 'APPROVED' else 'REJECTED' end, auth.uid(), 'WEB', jsonb_build_object('review_status', resulting_status, 'note', nullif(trim(p_note), '')));
  return p_expense_id;
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
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then raise exception 'Trip management permission required'; end if;
  if not exists (select 1 from public.trips where id = p_trip_id and organization_id = p_organization_id and status = 'ACTIVE' and deleted_at is null) then raise exception 'Active trip is unavailable'; end if;
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

grant select on public.organization_access_roles, public.organization_staff, public.telegram_staff_invites to authenticated;
grant insert, update, delete on public.organization_access_roles, public.organization_staff, public.telegram_staff_invites to authenticated;

revoke all on function public.has_org_permission(uuid, text) from public;
revoke all on function public.claim_staff_telegram_invite(text, bigint, text) from public;
revoke all on function public.sync_telegram_username(bigint, text) from public;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.claim_staff_telegram_invite(text, bigint, text) to service_role;
grant execute on function public.sync_telegram_username(bigint, text) to service_role;
