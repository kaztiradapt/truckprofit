export type SupportNotificationStatus = "SENT" | "NOT_CONFIGURED" | "FAILED";

export type SupportNotification = {
  ticketReference: string;
  organizationName: string;
  reporterName: string;
  reporterEmail: string | null;
  categoryLabel: string;
  priorityLabel: string;
  subject: string;
  description: string;
  contact: string | null;
  pageUrl: string | null;
};

type TelegramResponse = { ok?: boolean };

export function formatSupportNotification(input: SupportNotification): string {
  return [
    `🆘 Новое обращение ${input.ticketReference}`,
    `Компания: ${input.organizationName}`,
    `Автор: ${input.reporterName}${input.reporterEmail ? ` · ${input.reporterEmail}` : ""}`,
    `Тип: ${input.categoryLabel}`,
    `Важность: ${input.priorityLabel}`,
    "",
    input.subject,
    input.description.slice(0, 1200),
    input.contact ? `\nКонтакт: ${input.contact}` : "",
    input.pageUrl ? `Страница: ${input.pageUrl}` : "",
  ].filter(Boolean).join("\n");
}

export async function sendSupportNotification(input: SupportNotification): Promise<SupportNotificationStatus> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.SUPPORT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return "NOT_CONFIGURED";

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatSupportNotification(input) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "FAILED";
    const payload = await response.json() as TelegramResponse;
    return payload.ok ? "SENT" : "FAILED";
  } catch {
    return "FAILED";
  }
}
