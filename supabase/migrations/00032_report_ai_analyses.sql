-- Cached, auditable AI explanations for management reports. Raw trips,
-- receipts, contacts and Telegram identifiers are never stored here.

create table public.report_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  input_hash char(64) not null,
  period_start date not null,
  period_end date not null,
  comparison_start date not null,
  comparison_end date not null,
  filters jsonb not null default '{}'::jsonb,
  metrics jsonb not null,
  signals jsonb not null,
  result jsonb not null,
  model text,
  mode text not null check (mode in ('AI', 'RULES')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, input_hash),
  check (period_end >= period_start),
  check (comparison_end >= comparison_start)
);

create index report_ai_analyses_org_created_idx
  on public.report_ai_analyses (organization_id, created_at desc);

alter table public.report_ai_analyses enable row level security;

create policy report_ai_analyses_select_finance on public.report_ai_analyses
  for select using (public.has_org_permission(organization_id, 'VIEW_FINANCE'));

create trigger report_ai_analyses_set_updated_at
  before update on public.report_ai_analyses
  for each row execute procedure public.set_updated_at();

grant select on public.report_ai_analyses to authenticated;
