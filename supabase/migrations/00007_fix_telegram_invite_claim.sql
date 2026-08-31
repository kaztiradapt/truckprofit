-- Supabase installs pgcrypto functions in the extensions schema. The original
-- function pinned search_path to public, so an unqualified digest() call could
-- not be resolved while claiming an otherwise valid invitation.
create or replace function public.claim_driver_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint
)
returns table (organization_id uuid, driver_id uuid, driver_name text, base_currency char(3))
language plpgsql
security definer set search_path = ''
as $$
declare
  invite public.telegram_driver_invites%rowtype;
  linked_driver public.drivers%rowtype;
begin
  if p_telegram_user_id <= 0 or length(trim(p_invitation_code)) < 32 then
    raise exception 'Invalid invitation';
  end if;

  select candidate.* into invite
  from public.telegram_driver_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if invite.used_at is not null and invite.used_by_telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation is already used';
  end if;
  if invite.used_at is null and invite.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;

  select candidate.* into linked_driver
  from public.drivers candidate
  where candidate.id = invite.driver_id
    and candidate.organization_id = invite.organization_id
    and candidate.deleted_at is null
  for update;

  if not found then
    raise exception 'Driver not found';
  end if;
  if linked_driver.telegram_user_id is not null and linked_driver.telegram_user_id <> p_telegram_user_id then
    raise exception 'Driver is already linked to another Telegram account';
  end if;

  update public.drivers
  set telegram_user_id = p_telegram_user_id,
      status = 'ACTIVE',
      updated_at = now()
  where id = linked_driver.id;

  update public.telegram_driver_invites
  set used_at = coalesce(used_at, now()),
      used_by_telegram_user_id = p_telegram_user_id
  where id = invite.id;

  insert into public.audit_events (organization_id, entity_type, entity_id, action, source, after_data)
  values (
    invite.organization_id,
    'driver',
    linked_driver.id,
    'TELEGRAM_LINKED',
    'TELEGRAM',
    jsonb_build_object('telegram_user_id', p_telegram_user_id)
  );

  return query
  select organization.id, linked_driver.id, linked_driver.display_name, organization.base_currency
  from public.organizations organization
  where organization.id = invite.organization_id;
end;
$$;

revoke all on function public.claim_driver_telegram_invite(text, bigint) from public;
grant execute on function public.claim_driver_telegram_invite(text, bigint) to service_role;
