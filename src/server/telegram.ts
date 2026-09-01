type TelegramIdentity = { ok?: boolean; result?: { username?: string } };

export const MINI_APP_URL = "https://fleet-economics.vercel.app/dashboard";

export async function telegramBotUsername(): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as TelegramIdentity;
  return payload.ok && payload.result?.username ? payload.result.username : null;
}

export function telegramStartLink(username: string | null, code: string): string | null {
  return username ? `https://t.me/${username}?start=${code}` : null;
}
