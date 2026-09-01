import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { telegramBotUsername, telegramStartLink } from "@/server/telegram";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { organizationId?: string };
  const organizationId = body.organizationId?.trim() ?? "";
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, telegram_user_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (membershipError || !membership || membership.role !== "OWNER") {
    return Response.json({ error: "Подключить кабинет может только владелец." }, { status: 403 });
  }
  if (profileError || !profile) return Response.json({ error: "Профиль владельца не найден." }, { status: 404 });
  if (profile.telegram_user_id !== null) {
    return Response.json({ error: "Telegram владельца уже подключён." }, { status: 409 });
  }

  const token = `owner_${randomBytes(24).toString("base64url")}`;
  const codeHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

  const { error: deleteError } = await supabase
    .from("telegram_profile_invites")
    .delete()
    .eq("profile_id", userId)
    .is("used_at", null);
  if (deleteError) return Response.json({ error: "Не удалось обновить подключение." }, { status: 500 });

  const { error: insertError } = await supabase.from("telegram_profile_invites").insert({
    organization_id: organizationId,
    profile_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt,
    created_by: userId,
  });
  if (insertError) return Response.json({ error: "Не удалось подготовить подключение." }, { status: 500 });

  const username = await telegramBotUsername();
  return Response.json({
    ownerName: profile.display_name,
    expiresAt,
    link: telegramStartLink(username, token),
  });
}
