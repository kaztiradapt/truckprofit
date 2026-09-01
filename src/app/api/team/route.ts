import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatedTeamRequest, isOrganizationOwner, normalizeTelegramUsername } from "@/server/team-access";
import { telegramBotUsername, telegramStartLink } from "@/server/telegram";

const inputSchema = z.object({
  organizationId: z.uuid(),
  accessRoleId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  email: z.union([z.email().trim().toLowerCase(), z.literal("")]).optional(),
  telegramUsername: z.string().trim().max(33).optional(),
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  throw new Error("User directory is too large to scan safely");
}

async function ensureWebAccount(input: {
  email: string;
  displayName: string;
  origin: string;
}): Promise<{ userId: string; invited: boolean }> {
  const admin = createAdminClient();
  const existingUserId = await findUserIdByEmail(input.email);
  if (existingUserId) return { userId: existingUserId, invited: false };

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.displayName },
    redirectTo: `${input.origin}/auth/confirm?next=/dashboard`,
  });
  if (error || !data.user) throw error ?? new Error("Invitation user was not created");
  return { userId: data.user.id, invited: true };
}

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Проверьте имя, роль и контакты сотрудника." }, { status: 400 });

  const telegramUsername = normalizeTelegramUsername(parsed.data.telegramUsername);
  if (telegramUsername && !/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) {
    return Response.json({ error: "Telegram-тег должен выглядеть как @username." }, { status: 400 });
  }
  const email = parsed.data.email || null;
  if (!email && !telegramUsername) {
    return Response.json({ error: "Укажите email, Telegram @тег или оба контакта." }, { status: 400 });
  }

  const context = await authenticatedTeamRequest();
  if (!context) return Response.json({ error: "Требуется вход." }, { status: 401 });
  if (!await isOrganizationOwner(context, parsed.data.organizationId)) {
    return Response.json({ error: "Добавлять сотрудников может только владелец." }, { status: 403 });
  }

  const { data: accessRole, error: roleError } = await context.supabase
    .from("organization_access_roles")
    .select("id, name")
    .eq("id", parsed.data.accessRoleId)
    .eq("organization_id", parsed.data.organizationId)
    .maybeSingle();
  if (roleError || !accessRole) return Response.json({ error: "Выбранная роль недоступна." }, { status: 400 });

  const admin = createAdminClient();
  let profileId: string | null = null;
  let emailInvited = false;
  if (email) {
    try {
      const account = await ensureWebAccount({ email, displayName: parsed.data.displayName, origin: new URL(request.url).origin });
      profileId = account.userId;
      emailInvited = account.invited;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: profileId,
        display_name: parsed.data.displayName,
      }, { onConflict: "id" });
      if (profileError) throw profileError;
      const { error: membershipError } = await admin.from("organization_memberships").upsert({
        organization_id: parsed.data.organizationId,
        user_id: profileId,
        role: "MANAGER",
        access_role_id: accessRole.id,
        status: "ACTIVE",
      }, { onConflict: "organization_id,user_id" });
      if (membershipError) throw membershipError;
    } catch {
      return Response.json({ error: "Не удалось подготовить вход по email. Проверьте адрес и настройки почты Supabase." }, { status: 502 });
    }
  }

  let staff: { id: string } | null = null;
  if (profileId) {
    const { data } = await admin.from("organization_staff")
      .select("id")
      .eq("organization_id", parsed.data.organizationId)
      .eq("profile_id", profileId)
      .maybeSingle();
    staff = data;
  }

  const staffValues = {
    organization_id: parsed.data.organizationId,
    profile_id: profileId,
    access_role_id: accessRole.id,
    display_name: parsed.data.displayName,
    email,
    telegram_username: telegramUsername,
    status: profileId ? "ACTIVE" : "INVITED",
    created_by: context.userId,
  };
  const staffResult = staff
    ? await admin.from("organization_staff").update(staffValues).eq("id", staff.id).select("id").single()
    : await admin.from("organization_staff").insert(staffValues).select("id").single();
  if (staffResult.error || !staffResult.data) {
    return Response.json({ error: "Сотрудник с таким email или Telegram-тегом уже есть в команде." }, { status: 409 });
  }

  let telegramLink: string | null = null;
  let expiresAt: string | null = null;
  if (telegramUsername) {
    const code = `staff_${randomBytes(24).toString("base64url")}`;
    const codeHash = createHash("sha256").update(code).digest("hex");
    expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    await admin.from("telegram_staff_invites").delete().eq("staff_id", staffResult.data.id).is("used_at", null);
    const { error: inviteError } = await admin.from("telegram_staff_invites").insert({
      organization_id: parsed.data.organizationId,
      staff_id: staffResult.data.id,
      code_hash: codeHash,
      expires_at: expiresAt,
      created_by: context.userId,
    });
    if (inviteError) return Response.json({ error: "Сотрудник добавлен, но Telegram-ссылка не создалась." }, { status: 500 });
    telegramLink = telegramStartLink(await telegramBotUsername(), code);
  }

  await admin.from("audit_events").insert({
    organization_id: parsed.data.organizationId,
    entity_type: "organization_staff",
    entity_id: staffResult.data.id,
    action: "INVITED",
    actor_user_id: context.userId,
    source: "WEB",
    after_data: { access_role_id: accessRole.id, email_invited: emailInvited, telegram_invited: Boolean(telegramUsername) },
  });

  return Response.json({
    staffId: staffResult.data.id,
    roleName: accessRole.name,
    emailInvited,
    telegramLink,
    expiresAt,
  });
}
