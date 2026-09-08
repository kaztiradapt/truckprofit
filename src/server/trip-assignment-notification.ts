export type TripAssignmentNotificationStatus = "SENT" | "NOT_LINKED" | "NOT_CONFIGURED" | "FAILED";

export type TripAssignmentNotification = {
  telegramUserId: number | string | null;
  driverName: string;
  tripTitle: string;
  vehicleName: string;
  originCity: string;
  destinationCity: string;
  originAddress: string;
  destinationAddress: string;
  startedAt: string;
};

type TelegramResponse = { ok?: boolean };

function dateLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export function formatTripAssignmentNotification(input: TripAssignmentNotification): string {
  return [
    `🔔 ${input.driverName}, вам назначен рейс`,
    "",
    `🚛 ${input.tripTitle}`,
    `Маршрут: ${input.originCity} → ${input.destinationCity}`,
    `Автомобиль: ${input.vehicleName}`,
    `Дата старта: ${dateLabel(input.startedAt)}`,
    "",
    `📦 Погрузка: ${input.originAddress}`,
    `🏁 Выгрузка: ${input.destinationAddress}`,
    "",
    "Откройте «Мой рейс» и нажмите «Принять рейс» либо укажите причину отказа. Принятие назначения не означает начало движения.",
  ].join("\n");
}

export async function sendTripAssignmentNotification(input: TripAssignmentNotification): Promise<TripAssignmentNotificationStatus> {
  if (input.telegramUserId === null) return "NOT_LINKED";
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "NOT_CONFIGURED";
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(input.telegramUserId),
        text: formatTripAssignmentNotification(input),
        reply_markup: {
          inline_keyboard: [[{ text: "🚛 Открыть «Мой рейс»", callback_data: "menu:trip" }]],
        },
      }),
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

export function tripAssignmentStatusMessage(status: TripAssignmentNotificationStatus): string {
  if (status === "SENT") return "Водитель получил уведомление в Telegram.";
  if (status === "NOT_LINKED") return "Telegram водителя не подключён — уведомление не отправлено.";
  if (status === "NOT_CONFIGURED") return "Рейс назначен, но Telegram-бот сейчас не настроен.";
  return "Рейс назначен, но Telegram не принял уведомление.";
}
