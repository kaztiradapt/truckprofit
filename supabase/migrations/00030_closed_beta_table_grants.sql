-- RLS decides which rows a signed-in user may see or mutate; table privileges
-- are still required before PostgreSQL can evaluate those policies.
grant select on table public.platform_admins to authenticated;
grant select, insert, update on table public.beta_access_invites to authenticated;
