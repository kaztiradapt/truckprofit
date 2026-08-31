import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";

type TelegramIdentity = { ok?: boolean; result?: { username?: string } };

async function telegramBotUsername(): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as TelegramIdentity;
  return payload.ok && payload.result?.username ? payload.result.username : null;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id, organization_id, display_name, telegram_user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (driverError || !driver) return Response.json({ error: "Водитель не найден." }, { status: 404 });
  if (driver.telegram_user_id !== null) return Response.json({ error: "Telegram этого водителя уже привязан." }, { status: 409 });

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", driver.organization_id)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError || !membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return Response.json({ error: "Недостаточно прав." }, { status: 403 });
  }

  const token = randomBytes(24).toString("base64url");
  const codeHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

  const { error: deleteError } = await supabase
    .from("telegram_driver_invites")
    .delete()
    .eq("driver_id", driver.id)
    .is("used_at", null);
  if (deleteError) return Response.json({ error: "Не удалось обновить приглашение." }, { status: 500 });

  const { error: insertError } = await supabase.from("telegram_driver_invites").insert({
    organization_id: driver.organization_id,
    driver_id: driver.id,
    code_hash: codeHash,
    expires_at: expiresAt,
    created_by: userId,
  });
  if (insertError) return Response.json({ error: "Не удалось создать приглашение." }, { status: 500 });

  const username = await telegramBotUsername();
  return Response.json({
    driverName: driver.display_name,
    expiresAt,
    token,
    link: username ? `https://t.me/${username}?start=${token}` : null,
  });
}
