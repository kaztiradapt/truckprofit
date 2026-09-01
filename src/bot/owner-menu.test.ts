import { describe, expect, it } from "vitest";

import { formatOwnerExpenses, formatOwnerSummary, formatOwnerTrips } from "./driver-bot";

describe("owner Telegram menu formatting", () => {
  it("renders an operational and financial summary", () => {
    const message = formatOwnerSummary({
      vehicleCount: 3,
      driverCount: 4,
      activeTripCount: 2,
      pendingExpenseCount: 1,
      pendingExpenseMinor: 125_000_00,
      overdueIncomeCount: 1,
      revenueMinor: 900_000_00,
      expensesMinor: 350_000_00,
      profitMinor: 550_000_00,
    }, "KZT");

    expect(message).toContain("Активных рейсов: 2");
    expect(message).toContain("Расходов на проверке: 1");
    expect(message).toContain("Результат:");
  });

  it("renders useful empty states", () => {
    expect(formatOwnerTrips([])).toContain("нет");
    expect(formatOwnerExpenses([])).toContain("нет");
  });

  it("includes assigned vehicle and driver in an active trip", () => {
    const message = formatOwnerTrips([{
      id: "trip-1",
      title: "Костанай → Алматы",
      vehicleName: "DAF 001 · 123 ABC 10",
      driverName: "Марат",
      startedAt: "2026-09-01T10:00:00.000Z",
    }]);

    expect(message).toContain("Костанай → Алматы");
    expect(message).toContain("DAF 001");
    expect(message).toContain("Марат");
  });
});
