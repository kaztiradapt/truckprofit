import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatedTeamRequest, isOrganizationOwner } from "@/server/team-access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Обращение не найдено." }, { status: 404 });

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .select("organization_id, created_by, attachment_bucket, attachment_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !ticket?.attachment_bucket || !ticket.attachment_path) {
    return Response.json({ error: "К обращению не приложен файл." }, { status: 404 });
  }

  const canView = ticket.created_by === auth.userId || await isOrganizationOwner(auth, ticket.organization_id);
  if (!canView) return Response.json({ error: "Нет доступа к этому обращению." }, { status: 403 });

  const { data: signed, error: signedError } = await admin.storage
    .from(ticket.attachment_bucket)
    .createSignedUrl(ticket.attachment_path, 5 * 60);
  if (signedError || !signed?.signedUrl) return Response.json({ error: "Не удалось открыть вложение." }, { status: 503 });

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, "Cache-Control": "private, no-store" },
  });
}
