import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatedTeamRequest, isOrganizationOwner, normalizeTelegramUsername } from "@/server/team-access";

const inputSchema = z.object({
  organizationId: z.uuid(),
  accessRoleId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  telegramUsername: z.string().trim().max(33).optional(),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте данные сотрудника." }, { status: 400 });
  const telegramUsername = normalizeTelegramUsername(parsed.data.telegramUsername);
  if (telegramUsername && !/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) {
    return Response.json({ error: "Telegram-тег должен выглядеть как @username." }, { status: 400 });
  }

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  if (!await isOrganizationOwner(auth, parsed.data.organizationId)) return Response.json({ error: "Изменять доступ может только владелец." }, { status: 403 });

  const { data: role } = await auth.supabase.from("organization_access_roles").select("id")
    .eq("id", parsed.data.accessRoleId).eq("organization_id", parsed.data.organizationId).maybeSingle();
  if (!role) return Response.json({ error: "Роль не найдена." }, { status: 400 });

  const admin = createAdminClient();
  const { data: staff, error } = await admin.from("organization_staff").update({
    display_name: parsed.data.displayName,
    telegram_username: telegramUsername,
    access_role_id: role.id,
    status: parsed.data.status,
  }).eq("id", id).eq("organization_id", parsed.data.organizationId).is("deleted_at", null).select("id, profile_id").single();
  if (error || !staff) return Response.json({ error: "Не удалось обновить сотрудника. Возможно, @тег уже используется." }, { status: 409 });

  if (staff.profile_id) {
    const { error: membershipError } = await admin.from("organization_memberships").update({
      access_role_id: role.id,
      status: parsed.data.status,
    }).eq("organization_id", parsed.data.organizationId).eq("user_id", staff.profile_id).neq("role", "OWNER");
    if (membershipError) return Response.json({ error: "Профиль обновлён не полностью. Повторите попытку." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = z.object({ organizationId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте сотрудника." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  if (!await isOrganizationOwner(auth, parsed.data.organizationId)) return Response.json({ error: "Удалять сотрудников может только владелец." }, { status: 403 });
  const { error } = await auth.supabase.rpc("archive_organization_staff", {
    p_organization_id: parsed.data.organizationId,
    p_staff_id: id,
  });
  if (error) {
    const message = error.message.includes("owner") ? "Владельца компании удалить нельзя." : "Не удалось удалить сотрудника.";
    return Response.json({ error: message }, { status: 409 });
  }
  return Response.json({ ok: true });
}
