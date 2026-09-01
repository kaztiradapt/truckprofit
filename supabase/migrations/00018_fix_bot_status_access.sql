-- The Telegram service reads the last driver status when rendering "My trip".
-- RLS is bypassed by service_role, but PostgREST still requires a table grant.

grant select on table public.vehicle_status_records to service_role;
