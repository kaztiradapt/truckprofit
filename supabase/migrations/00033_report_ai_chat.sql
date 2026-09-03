-- Private, auditable conversation history for the in-product financial assistant.
-- Messages are visible only to the requesting user and never contain receipts,
-- contacts, Telegram identifiers or location history unless a user types them.

create table public.report_ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null check (char_length(content) between 1 and 3000),
  scope_status text not null check (scope_status in ('ANSWER', 'OUT_OF_SCOPE', 'INSUFFICIENT_DATA', 'ERROR')),
  filters jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create index report_ai_chat_messages_user_created_idx
  on public.report_ai_chat_messages (organization_id, requested_by, created_at desc);

alter table public.report_ai_chat_messages enable row level security;

create policy report_ai_chat_messages_select_own on public.report_ai_chat_messages
  for select using (
    requested_by = auth.uid()
    and public.has_org_permission(organization_id, 'VIEW_FINANCE')
  );

create policy report_ai_chat_messages_delete_own on public.report_ai_chat_messages
  for delete using (
    requested_by = auth.uid()
    and public.has_org_permission(organization_id, 'VIEW_FINANCE')
  );

grant select, delete on public.report_ai_chat_messages to authenticated;
