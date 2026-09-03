import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { normalizeBetaContact } from "@/domain/beta-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/server/beta-access";
import { telegramBotUsername, telegramStartLink } from "@/server/telegram";

const inputSchema = z.object({
  type: z.enum(["EMAIL", "TELEGRAM"]),
  contact: z.string().trim().min(3).max(254),
  displayName: z.string().trim().max(160).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Проверьте контакт и срок приглашения." }, { status: 400 });
  const context = await requirePlatformAdmin();
  if (!context) return Response.json({ error: "Доступно только администратору TruckProfit." }, { status: 403 });

  const contact = normalizeBetaContact(parsed.data.type, parsed.data.contact);
  if (!contact) return Response.json({ error: parsed.data.type === "EMAIL" ? "Введите корректный email." : "Telegram-тег должен выглядеть как @username." }, { status: 400 });
  const botUsername = parsed.data.type === "TELEGRAM" ? await telegramBotUsername() : null;
  if (parsed.data.type === "TELEGRAM" && !botUsername) {
    return Response.json({ error: "Telegram-бот временно недоступен. Проверьте его токен и повторите попытку." }, { status: 503 });
  }

  const code = `beta_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString();
  const { data: invitation, error: invitationError } = await context.supabase
    .from("beta_access_invites")
    .insert({
      code_hash: createHash("sha256").update(code).digest("hex"),
      invite_type: parsed.data.type,
      email: parsed.data.type === "EMAIL" ? contact : null,
      telegram_username: parsed.data.type === "TELEGRAM" ? contact : null,
      display_name: parsed.data.displayName || null,
      expires_at: expiresAt,
      note: parsed.data.note || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (invitationError || !invitation) return Response.json({ error: "Не удалось создать приглашение." }, { status: 409 });

  const origin = new URL(request.url).origin;
  let emailSent = false;
  let telegramLink: string | null = null;
  if (parsed.data.type === "EMAIL") {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(contact, {
      data: { full_name: parsed.data.displayName || "Владелец", beta_invite_token: code },
      redirectTo: `${origin}/auth/confirm?next=/update-password`,
    });
    if (error || !data.user) {
      await context.supabase.from("beta_access_invites").update({ status: "REVOKED" }).eq("id", invitation.id);
      return Response.json({ error: "Приглашение сохранено как отозванное: письмо не отправлено. Возможно, аккаунт с таким email уже существует." }, { status: 502 });
    }
    const { error: reserveError } = await context.supabase.from("beta_access_invites").update({
      status: "RESERVED",
      reserved_user_id: data.user.id,
      reserved_at: new Date().toISOString(),
    }).eq("id", invitation.id);
    if (reserveError) return Response.json({ error: "Письмо отправлено, но доступ не удалось зарезервировать. Отзовите приглашение и повторите." }, { status: 500 });
    emailSent = true;
  } else {
    telegramLink = telegramStartLink(botUsername, code);
  }

  return Response.json({
    id: invitation.id,
    expiresAt,
    emailSent,
    telegramLink,
    registrationLink: `${origin}/register?invite=${encodeURIComponent(code)}`,
  });
}
