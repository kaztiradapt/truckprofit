-- Create the core expense taxonomy together with a new isolated organization.
-- The function is atomic: a usable company never exists without the categories
-- required by the driver Telegram workflow.
create or replace function public.bootstrap_organization_with_owner(
  input_name text,
  input_slug text,
  input_currency char(3) default 'KZT',
  input_timezone text default 'Asia/Qostanay'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_organization_id uuid;
begin
  new_organization_id := public.create_organization_with_owner(
    input_name,
    input_slug,
    input_currency,
    input_timezone
  );

  -- Auth metadata is supplied by the registration form. Keep a person's name
  -- in the application profile without overwriting a name they later changed.
  update public.profiles
  set display_name = coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), display_name)
  where id = auth.uid() and display_name = '';

  insert into public.expense_categories (organization_id, code, display_name, is_system)
  values
    (new_organization_id, 'FUEL', 'Топливо', true),
    (new_organization_id, 'TOLL', 'Платные дороги', true),
    (new_organization_id, 'REPAIR', 'Ремонт и сервис', true),
    (new_organization_id, 'PARKING', 'Стоянка', true),
    (new_organization_id, 'DAILY_ALLOWANCE', 'Суточные', true),
    (new_organization_id, 'OTHER', 'Прочее', true);

  return new_organization_id;
end;
$$;

revoke all on function public.bootstrap_organization_with_owner(text, text, char(3), text) from public;
grant execute on function public.bootstrap_organization_with_owner(text, text, char(3), text) to authenticated;
