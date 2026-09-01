import { createClient } from "@/lib/supabase/server";
import { MINI_APP_URL } from "@/server/telegram";

type TelegramResponse<T> = { ok?: boolean; result?: T; description?: string };
type TelegramMenuButton = { type?: string; text?: string; web_app?: { url?: string } };

async function requireOperator(organizationId: string): Promise<Response | null> {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return Response.json({ error: "Недостаточно прав." }, { status: 403 });
  }
  return null;
}

async function callTelegram<T>(method: string, body: object): Promise<TelegramResponse<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Telegram bot token is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json() as TelegramResponse<T>;
  if (!response.ok || !payload.ok) throw new Error(payload.description ?? "Telegram API request failed");
  return payload;
}

export async function GET(request: Request): Promise<Response> {
  const organizationId = new URL(request.url).searchParams.get("organization_id") ?? "";
  const denied = await requireOperator(organizationId);
  if (denied) return denied;
  try {
    const payload = await callTelegram<TelegramMenuButton>("getChatMenuButton", {});
    const button = payload.result;
    return Response.json({
      configured: button?.type === "web_app" && button.web_app?.url === MINI_APP_URL,
      text: button?.text ?? null,
    });
  } catch {
    return Response.json({ error: "Не удалось проверить кнопку Telegram." }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { organizationId?: string };
  const organizationId = body.organizationId ?? "";
  const denied = await requireOperator(organizationId);
  if (denied) return denied;
  try {
    await callTelegram<boolean>("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Открыть кабинет",
        web_app: { url: MINI_APP_URL },
      },
    });
    return Response.json({ configured: true, text: "Открыть кабинет" });
  } catch {
    return Response.json({ error: "Telegram не принял настройку кнопки." }, { status: 502 });
  }
}
