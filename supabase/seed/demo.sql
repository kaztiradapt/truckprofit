-- Development/demo data only. No real names, phones, bank details or production trips.

insert into public.organizations (id, name, slug, base_currency, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Demo Transport', 'demo-transport', 'KZT', 'Asia/Qostanay')
on conflict (id) do nothing;

insert into public.vehicles (id, organization_id, plate_number, display_name, make_model, fuel_norm_l_per_100km)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '001DEM01', 'DAF 001', 'DAF XF', 30.5),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', '002DEM02', 'DAF 002', 'DAF XF', 31.0),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', '003DEM03', 'Volvo 003', 'Volvo FH', 30.0)
on conflict (organization_id, plate_number) do nothing;

insert into public.drivers (id, organization_id, display_name, status)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Водитель 001', 'ACTIVE'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Водитель 002', 'ACTIVE'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Водитель 003', 'ACTIVE')
on conflict do nothing;

insert into public.expense_categories (id, organization_id, code, display_name, is_system)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'FUEL', 'Топливо', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'TOLL', 'Платная дорога', true),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', 'REPAIR', 'Ремонт', true),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', 'PARKING', 'Стоянка', true),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001', 'DAILY_ALLOWANCE', 'Суточные', true),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001', 'OTHER', 'Прочее', true)
on conflict (organization_id, code) do nothing;

insert into public.tax_profiles (id, organization_id, name, estimated_income_tax_rate, is_default, valid_from)
values ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'Demo management tax', 0.20, true, '2026-01-01')
on conflict do nothing;

insert into public.trips (id, organization_id, external_reference, vehicle_id, driver_id, title, status, started_at)
values ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'DEMO-TRIP-001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', 'Алматы → Москва → Костанай', 'COMPLETED', '2026-01-10T03:00:00Z')
on conflict do nothing;

insert into public.trip_legs (id, organization_id, trip_id, sequence_no, origin_city, destination_city, load_state, start_at, end_at, start_odometer_km, end_odometer_km, distance_km)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000501', 1, 'Алматы', 'Москва', 'LOADED', '2026-01-10T03:00:00Z', '2026-01-15T12:00:00Z', 500000, 503800, 3800),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000501', 2, 'Москва', 'Костанай', 'EMPTY', '2026-01-16T03:00:00Z', '2026-01-18T12:00:00Z', 503800, 506300, 2500)
on conflict do nothing;
insert into public.incomes (id, organization_id, trip_id, trip_leg_id, customer_name, amount, currency, payment_status, expected_payment_at)
values ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000601', 'Demo Customer', 1000000, 'KZT', 'INVOICED', '2026-02-15')
on conflict do nothing;

insert into public.expenses (id, organization_id, vehicle_id, driver_id, trip_id, category_id, amount, currency, occurred_at, odometer_km, quantity, unit, price_per_unit, source)
values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000301', 381000, 'KZT', '2026-01-11T09:00:00Z', 501200, 1200, 'L', 317.5, 'IMPORT'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000302', 74000, 'KZT', '2026-01-13T09:00:00Z', 502800, null, null, null, 'IMPORT'),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000304', 20000, 'KZT', '2026-01-14T09:00:00Z', 503300, null, null, null, 'IMPORT')
on conflict do nothing;

insert into public.driver_compensation_rules (id, organization_id, driver_id, name, rule_type, config, valid_from)
values ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '65 KZT за км', 'PER_KM', '{"rate_per_km":65}', '2026-01-01')
on conflict do nothing;

insert into public.driver_compensation_calculations (id, organization_id, driver_id, trip_id, rule_id, amount, currency, calculation_status, breakdown)
values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000901', 409500, 'KZT', 'PRELIMINARY', '{"km":6300,"rate_per_km":65}')
on conflict do nothing;
