-- Preserve the income's original currency while normalizing it into the
-- organization's reporting currency for P&L calculations.

alter table public.incomes
  add column reporting_currency char(3),
  add column fx_rate_to_reporting numeric(18, 8);

update public.incomes income
set reporting_currency = organization.base_currency,
    fx_rate_to_reporting = 1
from public.organizations organization
where organization.id = income.organization_id;

alter table public.incomes
  alter column reporting_currency set not null,
  alter column fx_rate_to_reporting set not null,
  add constraint incomes_reporting_currency_format check (reporting_currency ~ '^[A-Z]{3}$'),
  add constraint incomes_fx_rate_positive check (fx_rate_to_reporting > 0 and fx_rate_to_reporting <= 1000000000);

drop trigger if exists incomes_set_reporting_amount_minor on public.incomes;

create or replace function public.set_income_reporting_amount_minor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reporting_amount_minor := round(new.amount * new.fx_rate_to_reporting * 100)::bigint;
  if new.reporting_amount_minor <= 0 then
    raise exception 'Reporting amount must be positive';
  end if;
  return new;
end;
$$;

create trigger incomes_set_reporting_amount_minor
  before insert or update of amount, fx_rate_to_reporting, reporting_amount_minor on public.incomes
  for each row execute procedure public.set_income_reporting_amount_minor();

revoke all on function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text) from public;
drop function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text);

create function public.record_owner_income(
  p_organization_id uuid,
  p_trip_id uuid,
  p_customer_name text,
  p_amount numeric,
  p_currency char(3),
  p_expected_payment_at date default null,
  p_comment text default null,
  p_fx_rate_to_reporting numeric default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  income_id uuid;
  reporting_currency char(3);
  effective_fx_rate numeric(18, 8);
  reporting_minor bigint;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_FINANCE') then
    raise exception 'Finance management permission required';
  end if;
  if p_amount <= 0 or p_amount > 999999999 then
    raise exception 'Income amount is invalid';
  end if;
  if p_currency not in ('KZT', 'USD', 'RUB', 'CNY', 'UZS') then
    raise exception 'Income currency is unsupported';
  end if;

  select organization.base_currency into reporting_currency
  from public.organizations organization
  where organization.id = p_organization_id;
  if not found then raise exception 'Organization is unavailable'; end if;
  if reporting_currency not in ('KZT', 'USD', 'RUB', 'CNY', 'UZS') then
    raise exception 'Organization reporting currency is unsupported';
  end if;

  if p_currency = reporting_currency then
    effective_fx_rate := 1;
  elsif p_fx_rate_to_reporting is null or p_fx_rate_to_reporting <= 0 or p_fx_rate_to_reporting > 1000000000 then
    raise exception 'A positive FX rate to the reporting currency is required';
  else
    effective_fx_rate := round(p_fx_rate_to_reporting, 8);
  end if;

  if not exists (
    select 1 from public.trips trip
    where trip.id = p_trip_id and trip.organization_id = p_organization_id and trip.deleted_at is null
  ) then raise exception 'Trip is unavailable'; end if;

  insert into public.incomes (
    organization_id, trip_id, customer_name, amount, currency, reporting_currency,
    fx_rate_to_reporting, payment_status, expected_payment_at, comment, created_by, updated_by
  ) values (
    p_organization_id, p_trip_id, nullif(trim(p_customer_name), ''), round(p_amount, 2), p_currency,
    reporting_currency, effective_fx_rate, 'PLANNED', p_expected_payment_at,
    nullif(trim(p_comment), ''), auth.uid(), auth.uid()
  ) returning id, reporting_amount_minor into income_id, reporting_minor;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, actor_user_id, source, after_data)
  values (
    p_organization_id, 'income', income_id, 'CREATED', auth.uid(), 'WEB',
    jsonb_build_object(
      'amount', round(p_amount, 2),
      'currency', p_currency,
      'reporting_currency', reporting_currency,
      'fx_rate_to_reporting', effective_fx_rate,
      'reporting_amount_minor', reporting_minor
    )
  );
  return income_id;
end;
$$;

revoke all on function public.set_income_reporting_amount_minor() from public;
revoke all on function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text, numeric) from public;
grant execute on function public.record_owner_income(uuid, uuid, text, numeric, char(3), date, text, numeric) to authenticated;
