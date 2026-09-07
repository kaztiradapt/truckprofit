-- Consecutive USER/ASSISTANT rows can share the same timestamp. An identity
-- column keeps their display and prompt order deterministic.

alter table public.report_ai_chat_messages
  add column if not exists message_order bigint generated always as identity unique;

drop index if exists public.report_ai_chat_messages_user_created_idx;
create index report_ai_chat_messages_user_created_idx
  on public.report_ai_chat_messages (organization_id, requested_by, message_order desc);
