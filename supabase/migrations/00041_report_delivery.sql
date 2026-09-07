create table public.report_delivery_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null
);
alter table public.report_delivery_limits enable row level security;
revoke all privileges on table public.report_delivery_limits from anon;
revoke all privileges on table public.report_delivery_limits from authenticated;

create function public.reserve_report_delivery(p_organization_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id,'VIEW_DASHBOARD') then raise exception 'Report access required'; end if;
  insert into public.report_delivery_limits(user_id,requested_at) values(auth.uid(),now())
  on conflict(user_id) do update set requested_at=excluded.requested_at
    where public.report_delivery_limits.requested_at <= now()-interval '15 seconds';
  return found;
end;
$$;
revoke all on function public.reserve_report_delivery(uuid) from public, anon;
grant execute on function public.reserve_report_delivery(uuid) to authenticated;
