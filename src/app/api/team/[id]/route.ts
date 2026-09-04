import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { prepareTeamWebAccount } from "@/server/team-accounts";
import { authenticatedTeamRequest, canDelegatePermissions, getOrganizationTeamAccess, normalizeTelegramUsername } from "@/server/team-access";

const inputSchema = z.object({
  organizationId: z.uuid(),
  accessRoleId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  email: z.union([z.email().trim().toLowerCase(), z.literal("")]).optional(),
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
  const teamAccess = await getOrganizationTeamAccess(auth, parsed.data.organizationId);
  if (!teamAccess.canManageTeam) return Response.json({ error: "Недостаточно прав для управления командой." }, { status: 403 });

  const { data: role } = await auth.supabase.from("organization_access_roles").select("id, permissions, system_code")
    .eq("id", parsed.data.accessRoleId).eq("organization_id", parsed.data.organizationId).maybeSingle();
  if (!role) return Response.json({ error: "Роль не найдена." }, { status: 400 });
  if (!canDelegatePermissions(teamAccess, role.permissions)) {
    return Response.json({ error: "Нельзя назначить сотруднику больше прав, чем есть у вас." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: currentStaff, error: staffLookupError } = await admin.from("organization_staff")
    .select("id, profile_id, email, access_role_id, organization_access_roles(permissions, system_code)")
    .eq("id", id).eq("organization_id", parsed.data.organizationId).is("deleted_at", null).maybeSingle();
  if (staffLookupError || !currentStaff) return Response.json({ error: "Участник не найден." }, { status: 404 });
  const nestedCurrentRole = currentStaff.organization_access_roles;
  const currentRole = Array.isArray(nestedCurrentRole) ? nestedCurrentRole[0] : nestedCurrentRole;
  if (!canDelegatePermissions(teamAccess, currentRole?.permissions)) {
    return Response.json({ error: "Нельзя изменять сотрудника с более широкими правами." }, { status: 403 });
  }
  if (currentStaff.profile_id) {
    const { data: membership } = await admin.from("organization_memberships").select("role")
      .eq("organization_id", parsed.data.organizationId).eq("user_id", currentStaff.profile_id).maybeSingle();
    if (membership?.role === "OWNER") return Response.json({ error: "Основного владельца изменить нельзя." }, { status: 403 });
  }
  if (!teamAccess.isPrimaryOwner && (currentRole?.system_code === "CO_OWNER" || role.system_code === "CO_OWNER")) {
    return Response.json({ error: "Изменять совладельцев может только основной владелец." }, { status: 403 });
  }

  const email = parsed.data.email || currentStaff.email || null;
  if (role.system_code === "CO_OWNER" && !email) {
    return Response.json({ error: "Для входа совладельца в личный кабинет укажите email." }, { status: 400 });
  }

  let profileId = currentStaff.profile_id;
  if (profileId && email && email !== currentStaff.email) {
    const { data: userResult, error: userLookupError } = await admin.auth.admin.getUserById(profileId);
    if (userLookupError || userResult.user.email?.toLowerCase() !== email) {
      return Response.json({ error: "У этого профиля другой email. Добавьте участника заново с нужным адресом." }, { status: 409 });
    }
  }
  if (!profileId && email) {
    try {
      const account = await prepareTeamWebAccount({
        email,
        displayName: parsed.data.displayName,
        organizationId: parsed.data.organizationId,
        origin: new URL(request.url).origin,
      });
      if (!account.ok) return Response.json({ error: account.error }, { status: account.status });
      profileId = account.userId;
    } catch {
      return Response.json({ error: "Не удалось подготовить вход по email. Проверьте адрес и настройки почты Supabase." }, { status: 502 });
    }
  }

  if (profileId) {
    const { error: membershipError } = await admin.from("organization_memberships").upsert({
      organization_id: parsed.data.organizationId,
      user_id: profileId,
      role: "MANAGER",
      access_role_id: role.id,
      status: parsed.data.status,
    }, { onConflict: "organization_id,user_id" });
    if (membershipError) return Response.json({ error: "Не удалось обновить доступ к личному кабинету." }, { status: 500 });
  }

  const { data: staff, error } = await admin.from("organization_staff").update({
    profile_id: profileId,
    display_name: parsed.data.displayName,
    email,
    telegram_username: telegramUsername,
    access_role_id: role.id,
    status: parsed.data.status,
  }).eq("id", id).eq("organization_id", parsed.data.organizationId).is("deleted_at", null).select("id, profile_id").single();
  if (error || !staff) return Response.json({ error: "Не удалось обновить сотрудника. Возможно, @тег уже используется." }, { status: 409 });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = z.object({ organizationId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте сотрудника." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const teamAccess = await getOrganizationTeamAccess(auth, parsed.data.organizationId);
  if (!teamAccess.canManageTeam) return Response.json({ error: "Недостаточно прав для управления командой." }, { status: 403 });
  const { data: target } = await auth.supabase.from("organization_staff")
    .select("access_role_id, organization_access_roles(permissions, system_code)")
    .eq("id", id).eq("organization_id", parsed.data.organizationId).is("deleted_at", null).maybeSingle();
  if (!target) return Response.json({ error: "Участник не найден." }, { status: 404 });
  const nestedRole = target.organization_access_roles;
  const targetRole = Array.isArray(nestedRole) ? nestedRole[0] : nestedRole;
  if (!target.access_role_id) return Response.json({ error: "Основного владельца удалить нельзя." }, { status: 403 });
  if (!canDelegatePermissions(teamAccess, targetRole?.permissions)) {
    return Response.json({ error: "Нельзя удалить сотрудника с более широкими правами." }, { status: 403 });
  }
  if (targetRole?.system_code === "CO_OWNER" && !teamAccess.isPrimaryOwner) {
    return Response.json({ error: "Удалять совладельцев может только основной владелец." }, { status: 403 });
  }
  const { error } = await auth.supabase.rpc("archive_organization_staff", {
    p_organization_id: parsed.data.organizationId,
    p_staff_id: id,
  });
  if (error) {
    const message = error.message.toLowerCase().includes("owner") ? "Основного владельца или совладельца удалить нельзя." : "Не удалось удалить участника. Проверьте право удаления.";
    return Response.json({ error: message }, { status: 409 });
  }
  return Response.json({ ok: true });
}
