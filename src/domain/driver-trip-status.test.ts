import { describe, expect, it } from "vitest";

import { getDriverTripStatus } from "./driver-trip-status";

describe("getDriverTripStatus", () => {
  it("uses the same Russian labels as the Telegram driver menu", () => {
    expect(getDriverTripStatus("WAITING_LOADING")).toEqual({ label: "Ожидаю погрузку", tone: "waiting" });
    expect(getDriverTripStatus("AT_LOADING")).toEqual({ label: "Погрузка", tone: "active" });
    expect(getDriverTripStatus("IN_TRANSIT")).toEqual({ label: "В пути", tone: "active" });
    expect(getDriverTripStatus("WAITING_UNLOADING")).toEqual({ label: "Ожидаю выгрузку", tone: "waiting" });
    expect(getDriverTripStatus("AT_UNLOADING")).toEqual({ label: "Выгрузка", tone: "active" });
  });

  it("shows a readable fallback before the driver sends a status", () => {
    expect(getDriverTripStatus(null)).toEqual({ label: "Статус не передан", tone: "neutral" });
  });
});
