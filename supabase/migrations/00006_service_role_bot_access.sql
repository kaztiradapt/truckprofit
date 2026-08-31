-- Server-side Telegram and P&L services use the Supabase secret/service role key.
-- RLS is bypassed by that role, but PostgREST still requires explicit table grants
-- because Data API auto-exposure is disabled for this project.

grant usage on schema public to service_role;

grant select on table
  public.organizations,
  public.drivers,
  public.trips,
  public.trip_legs,
  public.expense_categories,
  public.expenses,
  public.incomes,
  public.tax_profiles,
  public.driver_compensation_rules,
  public.driver_compensation_calculations
to service_role;

grant select, insert, update, delete on table
  public.telegram_conversations
to service_role;

grant select, insert on table
  public.attachments
to service_role;

grant insert on table
  public.audit_events
to service_role;
