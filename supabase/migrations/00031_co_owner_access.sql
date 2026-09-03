-- A co-owner belongs to an existing organization. The primary owner keeps the
-- OWNER membership; co-owners use a protected system access role so they can
-- operate the business without being able to replace the primary owner.

alter table public.organization_access_roles
  add column if not exists system_code text;

update public.organization_access_roles
set system_code = case name
  when 'Управляющий' then 'MANAGER'
  when 'Диспетчер' then 'DISPATCHER'
  when 'Наблюдатель' then 'VIEWER'
  else system_code
end
where is_system and system_code is null;

alter table public.organization_access_roles
  drop constraint if exists organization_access_roles_system_code_check;
alter table public.organization_access_roles
  add constraint organization_access_roles_system_code_check check (
    system_code is null or (
      is_system
      and system_code in ('CO_OWNER', 'MANAGER', 'DISPATCHER', 'VIEWER')
    )
  );

create unique index if not exists organization_access_roles_system_code_key
  on public.organization_access_roles (organization_id, system_code)
  where system_code is not null;

insert into public.organization_access_roles (
  organization_id,
  name,
  permissions,
  is_system,
  system_code
)
select
  organization.id,
  'Совладелец',
  array[
    'VIEW_DASHBOARD',
    'VIEW_FINANCE',
    'MANAGE_VEHICLES',
    'MANAGE_DRIVERS',
    'MANAGE_TRIPS',
    'MANAGE_FINANCE',
    'REVIEW_EXPENSES',
    'MANAGE_TEAM',
    'DELETE_RECORDS'
  ]::text[],
  true,
  'CO_OWNER'
from public.organizations organization
on conflict do nothing;

-- If a company had already created a custom role with the reserved name,
-- turn that row into the protected preset instead of leaving the company
-- without a real co-owner role.
update public.organization_access_roles
set
  permissions = array[
    'VIEW_DASHBOARD',
    'VIEW_FINANCE',
    'MANAGE_VEHICLES',
    'MANAGE_DRIVERS',
    'MANAGE_TRIPS',
    'MANAGE_FINANCE',
    'REVIEW_EXPENSES',
    'MANAGE_TEAM',
    'DELETE_RECORDS'
  ]::text[],
  is_system = true,
  system_code = 'CO_OWNER'
where lower(name) = lower('Совладелец')
  and system_code is null;

create or replace function public.seed_organization_access_roles()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.organization_access_roles (organization_id, name, permissions, is_system, system_code)
  values
    (
      new.id,
      'Совладелец',
      array['VIEW_DASHBOARD', 'VIEW_FINANCE', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS', 'MANAGE_FINANCE', 'REVIEW_EXPENSES', 'MANAGE_TEAM', 'DELETE_RECORDS']::text[],
      true,
      'CO_OWNER'
    ),
    (
      new.id,
      'Управляющий',
      array['VIEW_DASHBOARD', 'VIEW_FINANCE', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS', 'MANAGE_FINANCE', 'REVIEW_EXPENSES']::text[],
      true,
      'MANAGER'
    ),
    (
      new.id,
      'Диспетчер',
      array['VIEW_DASHBOARD', 'MANAGE_VEHICLES', 'MANAGE_DRIVERS', 'MANAGE_TRIPS']::text[],
      true,
      'DISPATCHER'
    ),
    (
      new.id,
      'Наблюдатель',
      array['VIEW_DASHBOARD']::text[],
      true,
      'VIEWER'
    )
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.is_primary_organization_owner(
  target_organization_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = target_user_id
      and membership.role = 'OWNER'
      and membership.status = 'ACTIVE'
  );
$$;

create or replace function public.is_co_owner_access_role(
  target_organization_id uuid,
  target_access_role_id uuid
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_access_roles access_role
    where access_role.organization_id = target_organization_id
      and access_role.id = target_access_role_id
      and access_role.system_code = 'CO_OWNER'
  );
$$;

create or replace function public.is_co_owner_staff(
  target_organization_id uuid,
  target_staff_id uuid
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_staff staff
    join public.organization_access_roles access_role
      on access_role.id = staff.access_role_id
      and access_role.organization_id = staff.organization_id
    where staff.organization_id = target_organization_id
      and staff.id = target_staff_id
      and access_role.system_code = 'CO_OWNER'
  );
$$;

revoke all on function public.is_primary_organization_owner(uuid, uuid) from public;
revoke all on function public.is_co_owner_access_role(uuid, uuid) from public;
revoke all on function public.is_co_owner_staff(uuid, uuid) from public;
grant execute on function public.is_primary_organization_owner(uuid, uuid) to authenticated;
grant execute on function public.is_co_owner_access_role(uuid, uuid) to authenticated;
grant execute on function public.is_co_owner_staff(uuid, uuid) to authenticated;

drop policy if exists access_roles_manage_owner on public.organization_access_roles;
create policy access_roles_insert_by_team on public.organization_access_roles
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and not is_system
    and system_code is null
  );
create policy access_roles_update_by_team on public.organization_access_roles
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM') and not is_system
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and not is_system
    and system_code is null
  );
create policy access_roles_delete_by_team on public.organization_access_roles
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM') and not is_system
  );

drop policy if exists organization_staff_manage_owner on public.organization_staff;
create policy organization_staff_insert_by_team on public.organization_staff
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and access_role_id is not null
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy organization_staff_update_by_team on public.organization_staff
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and access_role_id is not null
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy organization_staff_delete_by_team on public.organization_staff
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );

drop policy if exists telegram_staff_invites_select_owner on public.telegram_staff_invites;
drop policy if exists telegram_staff_invites_manage_owner on public.telegram_staff_invites;
create policy telegram_staff_invites_select_team on public.telegram_staff_invites
  for select using (public.has_org_permission(organization_id, 'MANAGE_TEAM'));
create policy telegram_staff_invites_insert_by_team on public.telegram_staff_invites
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and (
      not public.is_co_owner_staff(organization_id, staff_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy telegram_staff_invites_update_by_team on public.telegram_staff_invites
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and (
      not public.is_co_owner_staff(organization_id, staff_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and (
      not public.is_co_owner_staff(organization_id, staff_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy telegram_staff_invites_delete_by_team on public.telegram_staff_invites
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and (
      not public.is_co_owner_staff(organization_id, staff_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );

create or replace function public.archive_organization_staff(p_organization_id uuid, p_staff_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare current_staff public.organization_staff%rowtype;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TEAM')
    or not public.has_org_permission(p_organization_id, 'DELETE_RECORDS') then
    raise exception 'Staff deletion permission required';
  end if;
  select staff.* into current_staff from public.organization_staff staff
  where staff.id = p_staff_id and staff.organization_id = p_organization_id and staff.deleted_at is null
  for update;
  if not found then raise exception 'Staff member not found'; end if;
  if current_staff.access_role_id is null or public.is_primary_organization_owner(p_organization_id, current_staff.profile_id) then
    raise exception 'Primary organization owner cannot be deleted';
  end if;
  if public.is_co_owner_access_role(p_organization_id, current_staff.access_role_id)
    and not public.has_org_role(p_organization_id, array['OWNER']::public.organization_role[]) then
    raise exception 'Only the primary owner can remove a co-owner';
  end if;
  update public.organization_staff set status = 'SUSPENDED', deleted_at = now(), updated_at = now()
  where id = p_staff_id and organization_id = p_organization_id;
  if current_staff.profile_id is not null then
    update public.organization_memberships set status = 'SUSPENDED', updated_at = now()
    where organization_id = p_organization_id and user_id = current_staff.profile_id and role <> 'OWNER';
  end if;
  delete from public.telegram_staff_invites where organization_id = p_organization_id and staff_id = p_staff_id and used_at is null;
  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, reason)
  values (p_organization_id, 'organization_staff', p_staff_id, 'ARCHIVED', auth.uid(), 'WEB', 'Access removed from dashboard');
  return p_staff_id;
end;
$$;

revoke all on function public.archive_organization_staff(uuid, uuid) from public;
grant execute on function public.archive_organization_staff(uuid, uuid) to authenticated;
