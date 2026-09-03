-- Closed beta access for new owner organizations. Existing memberships are not
-- changed. Raw invitation codes never reach the database; only SHA-256 hashes do.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

insert into public.platform_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'kaztiradapt@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins admin
    where admin.user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create policy platform_admins_select_self on public.platform_admins
  for select using (user_id = auth.uid());

create table public.beta_access_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash char(64) not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  invite_type text not null check (invite_type in ('EMAIL', 'TELEGRAM')),
  email text,
  telegram_username text,
  telegram_user_id bigint,
  telegram_username_last text,
  display_name text,
  status text not null default 'PENDING' check (status in ('PENDING', 'CLAIMED', 'RESERVED', 'USED', 'REVOKED')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  reserved_at timestamptz,
  reserved_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_organization_id uuid references public.organizations(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (invite_type = 'EMAIL' and email is not null and telegram_username is null)
    or (invite_type = 'TELEGRAM' and telegram_username is not null and email is null)
  )
);

create index beta_access_invites_status_idx
  on public.beta_access_invites (status, expires_at desc);

alter table public.beta_access_invites enable row level security;

create policy beta_access_invites_select_admin on public.beta_access_invites
  for select using (public.is_platform_admin());
create policy beta_access_invites_insert_admin on public.beta_access_invites
  for insert with check (public.is_platform_admin() and created_by = auth.uid());
create policy beta_access_invites_update_admin on public.beta_access_invites
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());

create trigger beta_access_invites_set_updated_at
  before update on public.beta_access_invites
  for each row execute procedure public.set_updated_at();

create or replace function public.claim_beta_telegram_invite(
  p_invitation_code text,
  p_telegram_user_id bigint,
  p_telegram_username text
)
returns table (invite_id uuid, display_name text, expires_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
declare
  invitation public.beta_access_invites%rowtype;
  normalized_username text;
begin
  if p_telegram_user_id <= 0 then
    raise exception 'Invalid Telegram identity';
  end if;
  normalized_username := lower(nullif(trim(both '@' from coalesce(p_telegram_username, '')), ''));

  select candidate.* into invitation
  from public.beta_access_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found or invitation.invite_type <> 'TELEGRAM' or invitation.expires_at <= now()
    or invitation.status in ('RESERVED', 'USED', 'REVOKED') then
    raise exception 'Invitation is unavailable';
  end if;
  if invitation.status = 'CLAIMED' and invitation.telegram_user_id <> p_telegram_user_id then
    raise exception 'Invitation belongs to another Telegram account';
  end if;
  if invitation.status = 'PENDING' and (normalized_username is null or lower(invitation.telegram_username) <> normalized_username) then
    raise exception 'Telegram username does not match invitation';
  end if;

  update public.beta_access_invites
  set status = 'CLAIMED',
      telegram_user_id = p_telegram_user_id,
      telegram_username_last = normalized_username,
      claimed_at = coalesce(claimed_at, now())
  where id = invitation.id;

  return query select invitation.id, invitation.display_name, invitation.expires_at;
end;
$$;

revoke all on function public.claim_beta_telegram_invite(text, bigint, text) from public;
grant execute on function public.claim_beta_telegram_invite(text, bigint, text) to service_role;

create or replace function public.bootstrap_beta_organization_with_owner(
  p_invitation_code text,
  input_name text,
  input_slug text,
  input_currency char(3),
  input_timezone text,
  input_create_owner_driver boolean
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  invitation public.beta_access_invites%rowtype;
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select candidate.* into invitation
  from public.beta_access_invites candidate
  where candidate.code_hash = encode(extensions.digest(trim(p_invitation_code), 'sha256'), 'hex')
  for update;

  if not found or invitation.status <> 'RESERVED' or invitation.expires_at <= now()
    or invitation.reserved_user_id <> auth.uid() then
    raise exception 'Active beta invitation required';
  end if;

  new_organization_id := public.bootstrap_organization_with_owner(
    input_name,
    input_slug,
    input_currency,
    input_timezone,
    input_create_owner_driver
  );

  if invitation.invite_type = 'TELEGRAM' and invitation.telegram_user_id is not null then
    update public.profiles
    set telegram_user_id = invitation.telegram_user_id,
        telegram_username = invitation.telegram_username_last,
        updated_at = now()
    where id = auth.uid();
  end if;

  update public.beta_access_invites
  set status = 'USED',
      used_at = now(),
      used_by = auth.uid(),
      used_organization_id = new_organization_id
  where id = invitation.id;

  return new_organization_id;
end;
$$;

-- Close every direct organization-creation path. The beta wrapper above is the
-- only organization bootstrap function exposed to authenticated users.
revoke execute on function public.create_organization_with_owner(text, text, char(3), text) from authenticated;
revoke execute on function public.bootstrap_organization_with_owner(text, text, char(3), text) from authenticated;
revoke execute on function public.bootstrap_organization_with_owner(text, text, char(3), text, boolean) from authenticated;
revoke all on function public.bootstrap_beta_organization_with_owner(text, text, text, char(3), text, boolean) from public;
grant execute on function public.bootstrap_beta_organization_with_owner(text, text, text, char(3), text, boolean) to authenticated;
