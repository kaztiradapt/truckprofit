import { afterEach, describe, expect, it, vi } from "vitest";

import { formatTripAssignmentNotification, sendTripAssignmentNotification } from "./trip-assignment-notification";

const notification = {
  telegramUserId: 123456,
  driverName: "Максим",
  tripTitle: "Караганда → Ушарал",
  vehicleName: "Volvo FH · 001ABC",
  originCity: "Караганда",
  destinationCity: "Ушарал",
  originAddress: "Склад 1",
  destinationAddress: "Склад 2",
  startedAt: "2026-09-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("trip assignment notifications", () => {
  it("includes the route, vehicle, date and both addresses", () => {
    const text = formatTripAssignmentNotification(notification);
    expect(text).toContain("Караганда → Ушарал");
    expect(text).toContain("Volvo FH · 001ABC");
    expect(text).toContain("01.09.2026");
    expect(text).toContain("Погрузка: Склад 1");
    expect(text).toContain("Выгрузка: Склад 2");
  });

  it("sends a My trip callback button through Telegram", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTripAssignmentNotification(notification)).resolves.toBe("SENT");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      chat_id: "123456",
      reply_markup: { inline_keyboard: [[{ callback_data: "menu:trip" }]] },
    });
  });

  it("does not call Telegram before the driver has linked it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTripAssignmentNotification({ ...notification, telegramUserId: null })).resolves.toBe("NOT_LINKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
