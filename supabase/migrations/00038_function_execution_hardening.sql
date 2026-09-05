-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. SECURITY
-- DEFINER functions must instead be callable only by the application roles
-- that need them. Existing explicit authenticated/service_role grants remain.

do $$
declare
  privileged_function record;
begin
  for privileged_function in
    select namespace.nspname, proc.proname, pg_get_function_identity_arguments(proc.oid) as arguments
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.prosecdef
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon',
      privileged_function.nspname,
      privileged_function.proname,
      privileged_function.arguments
    );
  end loop;
end;
$$;

-- Helpers referenced by RLS and user-facing RPCs need an explicit authenticated
-- grant after the blanket PUBLIC revocation.
grant execute on function public.can_access_trip(uuid, uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.is_current_driver(uuid, uuid) to authenticated;
grant execute on function public.is_owner_or_manager(uuid) to authenticated;
grant execute on function public.create_trip_with_first_leg(
  uuid, uuid, uuid, text, text, text, text, timestamptz,
  text, text, double precision, double precision, double precision, double precision, numeric
) to authenticated;
grant execute on function public.update_driver_record(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.update_trip_record(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz,
  text, text, double precision, double precision, double precision, double precision, numeric
) to authenticated;

-- Trigger functions never resolve application objects through a mutable caller
-- search path.
alter function public.set_updated_at() set search_path = '';
alter function public.validate_expense_relations() set search_path = '';
alter function public.validate_income_relations() set search_path = '';
