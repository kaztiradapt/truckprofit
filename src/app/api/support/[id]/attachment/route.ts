import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportAttachmentStorageReference } from "@/server/private-storage-reference";
import { authenticatedTeamRequest } from "@/server/team-access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Обращение не найдено." }, { status: 404 });

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const { data: ticket, error } = await auth.supabase
    .from("support_tickets")
    .select("organization_id, created_by, attachment_bucket, attachment_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !ticket?.attachment_bucket || !ticket.attachment_path) {
    return Response.json({ error: "К обращению не приложен файл." }, { status: 404 });
  }

  if (!isSupportAttachmentStorageReference({
    organizationId: ticket.organization_id,
    creatorId: ticket.created_by,
    ticketId: id,
    bucket: ticket.attachment_bucket,
    path: ticket.attachment_path,
  })) {
    return Response.json({ error: "Ссылка на вложение не прошла проверку безопасности." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(ticket.attachment_bucket)
    .createSignedUrl(ticket.attachment_path, 5 * 60);
  if (signedError || !signed?.signedUrl) return Response.json({ error: "Не удалось открыть вложение." }, { status: 503 });

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, "Cache-Control": "private, no-store" },
  });
}
