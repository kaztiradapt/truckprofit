import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSupportNotification, sendSupportNotification } from "./support-notification";

const notification = {
  ticketReference: "TP-000042",
  organizationName: "ТОО Тест",
  reporterName: "Алексей",
  reporterEmail: "alexey@example.com",
  categoryLabel: "Telegram-бот",
  priorityLabel: "Работа остановлена",
  subject: "Не открывается мой рейс",
  description: "После нажатия кнопки ничего не происходит.",
  contact: "@alexey",
  pageUrl: "https://fleet-economics.vercel.app/dashboard/trips",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.SUPPORT_TELEGRAM_CHAT_ID;
});

describe("support notifications", () => {
  it("includes the ticket, company, problem and contact", () => {
    const text = formatSupportNotification(notification);
    expect(text).toContain("TP-000042");
    expect(text).toContain("ТОО Тест");
    expect(text).toContain("Не открывается мой рейс");
    expect(text).toContain("@alexey");
  });

  it("does not call Telegram until a support chat is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendSupportNotification(notification)).resolves.toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the notification to the configured support chat", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.SUPPORT_TELEGRAM_CHAT_ID = "-100123456789";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendSupportNotification(notification)).resolves.toBe("SENT");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ chat_id: "-100123456789" });
  });
});
