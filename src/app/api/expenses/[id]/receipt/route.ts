import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { isExpenseReceiptStorageReference } from "@/server/private-storage-reference";
import { authenticatedTeamRequest, type TeamRequestContext } from "@/server/team-access";

type MembershipRow = {
  role: string;
  organization_access_roles: { permissions: string[] } | { permissions: string[] }[] | null;
};

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function canViewOrganizationFinance(context: TeamRequestContext, organizationId: string): Promise<boolean> {
  const { data, error } = await context.supabase
    .from("organization_memberships")
    .select("role, organization_access_roles(permissions)")
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) return false;
  const membership = data as unknown as MembershipRow;
  if (membership.role === "OWNER") return true;
  return asOne(membership.organization_access_roles)?.permissions?.includes("VIEW_FINANCE") ?? false;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Чек не найден." }, { status: 404 });

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const { data: attachment, error: attachmentError } = await auth.supabase
    .from("attachments")
    .select("organization_id, storage_bucket, storage_path")
    .eq("expense_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attachmentError || !attachment) return Response.json({ error: "К этому расходу чек не приложен." }, { status: 404 });

  if (!await canViewOrganizationFinance(auth, attachment.organization_id)) {
    return Response.json({ error: "Нет доступа к финансовым документам." }, { status: 403 });
  }
  if (!isExpenseReceiptStorageReference({
    organizationId: attachment.organization_id,
    expenseId: id,
    bucket: attachment.storage_bucket,
    path: attachment.storage_path,
  })) {
    return Response.json({ error: "Ссылка на чек не прошла проверку безопасности." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 5 * 60);
  if (signedError || !signed?.signedUrl) return Response.json({ error: "Не удалось открыть чек." }, { status: 503 });

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "private, no-store",
    },
  });
}
