-- Production-safe tenant isolation smoke test.
--
-- The test creates two temporary organizations and users, impersonates each
-- authenticated user, verifies that the other tenant cannot be selected or
-- updated, and rolls every test row back before returning PASS.

begin;

create temp table _tenant_security_ids (
  user_a uuid not null,
  user_b uuid not null,
  org_a uuid not null,
  org_b uuid not null,
  vehicle_a uuid not null,
  vehicle_b uuid not null
) on commit drop;

insert into _tenant_security_ids
select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();

grant select on _tenant_security_ids to authenticated;

insert into auth.users (id)
select user_a from _tenant_security_ids
union all
select user_b from _tenant_security_ids;

insert into public.organizations (id, name, slug)
select org_a, 'Security tenant A', 'security-a-' || replace(org_a::text, '-', '') from _tenant_security_ids
union all
select org_b, 'Security tenant B', 'security-b-' || replace(org_b::text, '-', '') from _tenant_security_ids;

insert into public.organization_memberships (organization_id, user_id, role, status)
select org_a, user_a, 'OWNER'::public.organization_role, 'ACTIVE'::public.member_status from _tenant_security_ids
union all
select org_b, user_b, 'OWNER'::public.organization_role, 'ACTIVE'::public.member_status from _tenant_security_ids;

insert into public.vehicles (id, organization_id, plate_number, display_name)
select vehicle_a, org_a, 'SEC-A', 'Security vehicle A' from _tenant_security_ids
union all
select vehicle_b, org_b, 'SEC-B', 'Security vehicle B' from _tenant_security_ids;

select set_config('request.jwt.claim.sub', (select user_a::text from _tenant_security_ids), true);
set local role authenticated;

-- Division by zero deliberately aborts the transaction if an assertion fails.
select 1 / case when count(*) = 1 then 1 else 0 end
from public.organizations
where id in (select org_a from _tenant_security_ids union all select org_b from _tenant_security_ids);

select 1 / case when count(*) = 1 then 1 else 0 end
from public.profiles
where id in (select user_a from _tenant_security_ids union all select user_b from _tenant_security_ids);

select 1 / case when count(*) = 0 then 1 else 0 end
from public.vehicles
where id = (select vehicle_b from _tenant_security_ids);

with changed as (
  update public.vehicles
  set display_name = 'forbidden cross-tenant update'
  where id = (select vehicle_b from _tenant_security_ids)
  returning 1
)
select 1 / case when count(*) = 0 then 1 else 0 end from changed;

with changed as (
  update public.vehicles
  set display_name = 'allowed own-tenant update'
  where id = (select vehicle_a from _tenant_security_ids)
  returning 1
)
select 1 / case when count(*) = 1 then 1 else 0 end from changed;

reset role;
select set_config('request.jwt.claim.sub', (select user_b::text from _tenant_security_ids), true);
set local role authenticated;

select 1 / case when count(*) = 1 then 1 else 0 end
from public.organizations
where id in (select org_a from _tenant_security_ids union all select org_b from _tenant_security_ids);

select 1 / case when count(*) = 0 then 1 else 0 end
from public.vehicles
where id = (select vehicle_a from _tenant_security_ids);

reset role;
rollback;

select 'PASS: tenants cannot read or update each other' as tenant_isolation_result;
