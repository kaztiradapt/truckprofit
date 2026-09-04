-- The production preflight for migration 00036 found no legacy references
-- outside the enforced tenant prefixes, so the constraints can be trusted for
-- every existing and future row.

alter table public.attachments
  validate constraint attachments_expense_receipt_storage_scope;

alter table public.support_tickets
  validate constraint support_ticket_attachment_storage_scope;
