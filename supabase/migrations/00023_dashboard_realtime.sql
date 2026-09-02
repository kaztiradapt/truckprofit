-- Stream operational changes into the owner/manager dashboard.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vehicle_status_records',
    'trip_location_points',
    'expenses',
    'attachments',
    'incomes',
    'trips',
    'trip_legs',
    'pnl_snapshots'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
