-- Let the authenticated server client persist only the caller's own private
-- assistant history. This avoids using the service role for user messages.

create policy report_ai_chat_messages_insert_own on public.report_ai_chat_messages
  for insert with check (
    requested_by = auth.uid()
    and public.has_org_permission(organization_id, 'VIEW_FINANCE')
  );

grant insert on public.report_ai_chat_messages to authenticated;
