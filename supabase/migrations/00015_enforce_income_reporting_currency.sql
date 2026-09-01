-- Derive the reporting currency in the database as well, so direct REST writes
-- cannot mix currencies or bypass the FX conversion used by P&L.

create or replace function public.set_income_reporting_amount_minor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  organization_currency char(3);
begin
  select organization.base_currency into organization_currency
  from public.organizations organization
  where organization.id = new.organization_id;
  if not found then raise exception 'Organization is unavailable'; end if;
  if organization_currency not in ('KZT', 'USD', 'RUB', 'CNY', 'UZS')
    or new.currency not in ('KZT', 'USD', 'RUB', 'CNY', 'UZS') then
    raise exception 'Income currency is unsupported';
  end if;

  new.reporting_currency := organization_currency;
  if new.currency = organization_currency then
    new.fx_rate_to_reporting := 1;
  elsif new.fx_rate_to_reporting is null
    or new.fx_rate_to_reporting <= 0
    or new.fx_rate_to_reporting > 1000000000 then
    raise exception 'A positive FX rate to the reporting currency is required';
  end if;

  new.reporting_amount_minor := round(new.amount * new.fx_rate_to_reporting * 100)::bigint;
  if new.reporting_amount_minor <= 0 then
    raise exception 'Reporting amount must be positive';
  end if;
  return new;
end;
$$;

drop trigger if exists incomes_set_reporting_amount_minor on public.incomes;
create trigger incomes_set_reporting_amount_minor
  before insert or update of organization_id, amount, currency, fx_rate_to_reporting, reporting_currency, reporting_amount_minor
  on public.incomes
  for each row execute procedure public.set_income_reporting_amount_minor();

revoke all on function public.set_income_reporting_amount_minor() from public;
