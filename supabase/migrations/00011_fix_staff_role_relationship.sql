-- Keep one unambiguous organization-scoped relationship for PostgREST embeds.
alter table public.organization_staff
  drop constraint if exists organization_staff_access_role_id_fkey;

-- The backend bot and owner-only team endpoints use the service role. RLS is
-- still bypassed only by that trusted role; authenticated users remain bound
-- to the policies installed in migration 00010.
grant select, insert, update, delete
  on public.organization_access_roles, public.organization_staff, public.telegram_staff_invites
  to service_role;
