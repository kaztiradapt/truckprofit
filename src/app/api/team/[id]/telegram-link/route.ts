import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { authenticatedTeamRequest, canDelegatePermissions, getOrganizationTeamAccess } from "@/server/team-access";
import { telegramBotUsername, telegramStartLink } from "@/server/telegram";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { organizationId?: string };
  const organizationId = String(body.organizationId ?? "");
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(organizationId).success) return Response.json({ error: "Некорректный сотрудник." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const teamAccess = await getOrganizationTeamAccess(auth, organizationId);
  if (!teamAccess.canManageTeam) return Response.json({ error: "Недостаточно прав для управления командой." }, { status: 403 });

  const { data: staff, error: staffError } = await auth.supabase.from("organization_staff")
    .select("id, telegram_username, telegram_user_id, organization_access_roles(permissions, system_code)")
    .eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (staffError || !staff) return Response.json({ error: "Сотрудник не найден." }, { status: 404 });
  const nestedRole = staff.organization_access_roles;
  const staffRole = Array.isArray(nestedRole) ? nestedRole[0] : nestedRole;
  if (!canDelegatePermissions(teamAccess, staffRole?.permissions)) {
    return Response.json({ error: "Нельзя управлять приглашением сотрудника с более широкими правами." }, { status: 403 });
  }
  if (staffRole?.system_code === "CO_OWNER" && !teamAccess.isPrimaryOwner) {
    return Response.json({ error: "Создавать ссылку совладельца может только основной владелец." }, { status: 403 });
  }
  if (!staff.telegram_username) return Response.json({ error: "Сначала укажите Telegram @тег." }, { status: 400 });
  if (staff.telegram_user_id) return Response.json({ error: "Telegram сотрудника уже привязан по ID." }, { status: 409 });

  const code = `staff_${randomBytes(24).toString("base64url")}`;
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { error: deleteError } = await auth.supabase.from("telegram_staff_invites").delete().eq("staff_id", id).is("used_at", null);
  if (deleteError) return Response.json({ error: "Не удалось обновить приглашение." }, { status: 500 });
  const { error: insertError } = await auth.supabase.from("telegram_staff_invites").insert({
    organization_id: organizationId,
    staff_id: id,
    code_hash: codeHash,
    expires_at: expiresAt,
    created_by: auth.userId,
  });
  if (insertError) return Response.json({ error: "Не удалось создать приглашение." }, { status: 500 });
  return Response.json({ link: telegramStartLink(await telegramBotUsername(), code), expiresAt });
}
