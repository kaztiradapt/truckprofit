-- Defense in depth for tenant isolation and private Storage references.
-- Application routes also verify these paths before using the service role to
-- create a signed URL. These checks prevent a writable metadata row from ever
-- pointing at another organization's object.

alter table public.attachments
  drop constraint if exists attachments_expense_receipt_storage_scope;
alter table public.attachments
  add constraint attachments_expense_receipt_storage_scope check (
    expense_id is not null
    and storage_bucket = 'expense-receipts'
    and storage_path ~ (
      '^' || organization_id::text || '/' || expense_id::text
      || '/receipt-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png)$'
    )
  ) not valid;

alter table public.support_tickets
  drop constraint if exists support_ticket_attachment_storage_scope;
alter table public.support_tickets
  add constraint support_ticket_attachment_storage_scope check (
    attachment_path is null
    or (
      attachment_bucket = 'support-attachments'
      and attachment_path ~ (
        '^' || organization_id::text || '/' || created_by::text || '/' || id::text || '[.](jpg|png|webp)$'
      )
    )
  ) not valid;

-- A delegated team administrator may only create roles and assign staff at or
-- below their own permission level. The primary owner remains unrestricted.
create or replace function public.can_delegate_org_permissions(
  target_organization_id uuid,
  requested_permissions text[]
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
        or coalesce(requested_permissions, array[]::text[])
          <@ coalesce(access_role.permissions, array[]::text[])
      )
  );
$$;

create or replace function public.can_assign_org_access_role(
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
      and public.can_delegate_org_permissions(target_organization_id, access_role.permissions)
  );
$$;

create or replace function public.can_manage_org_staff(
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
    where staff.organization_id = target_organization_id
      and staff.id = target_staff_id
      and staff.access_role_id is not null
      and public.can_assign_org_access_role(target_organization_id, staff.access_role_id)
  );
$$;

revoke all on function public.can_delegate_org_permissions(uuid, text[]) from public;
revoke all on function public.can_assign_org_access_role(uuid, uuid) from public;
revoke all on function public.can_manage_org_staff(uuid, uuid) from public;
grant execute on function public.can_delegate_org_permissions(uuid, text[]) to authenticated;
grant execute on function public.can_assign_org_access_role(uuid, uuid) to authenticated;
grant execute on function public.can_manage_org_staff(uuid, uuid) to authenticated;

drop policy if exists access_roles_insert_by_team on public.organization_access_roles;
drop policy if exists access_roles_update_by_team on public.organization_access_roles;
drop policy if exists access_roles_delete_by_team on public.organization_access_roles;
create policy access_roles_insert_by_team on public.organization_access_roles
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_delegate_org_permissions(organization_id, permissions)
    and not is_system
    and system_code is null
  );
create policy access_roles_update_by_team on public.organization_access_roles
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_delegate_org_permissions(organization_id, permissions)
    and not is_system
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_delegate_org_permissions(organization_id, permissions)
    and not is_system
    and system_code is null
  );
create policy access_roles_delete_by_team on public.organization_access_roles
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.has_org_permission(organization_id, 'DELETE_RECORDS')
    and public.can_delegate_org_permissions(organization_id, permissions)
    and not is_system
  );

drop policy if exists organization_staff_insert_by_team on public.organization_staff;
drop policy if exists organization_staff_update_by_team on public.organization_staff;
drop policy if exists organization_staff_delete_by_team on public.organization_staff;
create policy organization_staff_insert_by_team on public.organization_staff
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and access_role_id is not null
    and public.can_assign_org_access_role(organization_id, access_role_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy organization_staff_update_by_team on public.organization_staff
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and public.can_assign_org_access_role(organization_id, access_role_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and access_role_id is not null
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and public.can_assign_org_access_role(organization_id, access_role_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy organization_staff_delete_by_team on public.organization_staff
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.has_org_permission(organization_id, 'DELETE_RECORDS')
    and public.can_assign_org_access_role(organization_id, access_role_id)
    and not public.is_primary_organization_owner(organization_id, profile_id)
    and (
      not public.is_co_owner_access_role(organization_id, access_role_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );

drop policy if exists telegram_staff_invites_select_team on public.telegram_staff_invites;
drop policy if exists telegram_staff_invites_insert_by_team on public.telegram_staff_invites;
drop policy if exists telegram_staff_invites_update_by_team on public.telegram_staff_invites;
drop policy if exists telegram_staff_invites_delete_by_team on public.telegram_staff_invites;
create policy telegram_staff_invites_select_team on public.telegram_staff_invites
  for select using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_manage_org_staff(organization_id, staff_id)
  );
create policy telegram_staff_invites_insert_by_team on public.telegram_staff_invites
  for insert with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_manage_org_staff(organization_id, staff_id)
    and (
      not public.is_co_owner_staff(organization_id, staff_id)
      or public.has_org_role(organization_id, array['OWNER']::public.organization_role[])
    )
  );
create policy telegram_staff_invites_update_by_team on public.telegram_staff_invites
  for update using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_manage_org_staff(organization_id, staff_id)
  ) with check (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_manage_org_staff(organization_id, staff_id)
  );
create policy telegram_staff_invites_delete_by_team on public.telegram_staff_invites
  for delete using (
    public.has_org_permission(organization_id, 'MANAGE_TEAM')
    and public.can_manage_org_staff(organization_id, staff_id)
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
  if not public.can_manage_org_staff(p_organization_id, p_staff_id) then
    raise exception 'Cannot manage a staff member with broader permissions';
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

-- The landing and registration flow use server routes. Anonymous browser
-- clients never need direct access to business tables or private AI history.
revoke all privileges on table
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
  public.telegram_driver_invites,
  public.telegram_update_logs,
  public.telegram_conversations,
  public.telegram_profile_invites,
  public.organization_access_roles,
  public.organization_staff,
  public.telegram_staff_invites,
  public.trip_location_points,
  public.pnl_snapshots,
  public.pnl_lines,
  public.support_tickets,
  public.platform_admins,
  public.beta_access_invites,
  public.report_ai_analyses,
  public.report_ai_chat_messages
from anon;

-- Update de-duplication and conversation state belong exclusively to the
-- verified Telegram webhook running with the server secret.
revoke all privileges on table
  public.telegram_update_logs,
  public.telegram_conversations
from authenticated;

revoke all privileges on sequence public.support_tickets_ticket_number_seq from anon;
revoke select on public.trip_financial_summary from anon;

create index if not exists report_ai_analyses_request_rate_idx
  on public.report_ai_analyses (organization_id, requested_by, created_at desc);

-- Explicitly keep all customer-data buckets private even if a project setting
-- was changed manually in the dashboard.
update storage.buckets
set public = false
where id in ('expense-receipts', 'support-attachments');
