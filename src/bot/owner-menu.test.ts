import { describe, expect, it } from "vitest";

import { formatDriverTrip, formatOwnerExpenses, formatOwnerSummary, formatOwnerTrips, normalizeLocationPoint } from "./driver-bot";

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

  it("validates Telegram location coordinates and accuracy", () => {
    expect(normalizeLocationPoint({ latitude: 53.2144, longitude: 63.6246, horizontalAccuracyM: 18.7 })).toEqual({
      latitude: 53.2144,
      longitude: 63.6246,
      horizontalAccuracyM: 18.7,
    });
    expect(normalizeLocationPoint({ latitude: 91, longitude: 63.6246 })).toBeNull();
    expect(normalizeLocationPoint({ latitude: 53.2144, longitude: 181 })).toBeNull();
    expect(normalizeLocationPoint({ latitude: 53.2144, longitude: 63.6246, horizontalAccuracyM: 1501 })).toBeNull();
  });

  it("shows route addresses and the latest driver status inside My Trip", () => {
    const message = formatDriverTrip({
      id: "trip-1",
      organizationId: "org-1",
      driverId: "driver-1",
      vehicleId: "vehicle-1",
      title: "Алматы → Москва",
      currency: "KZT",
      originCity: "Алматы",
      destinationCity: "Москва",
      originAddress: "ул. Райымбека, склад 12",
      destinationAddress: "МКАД, терминал 4",
      originLatitude: 43.238949,
      originLongitude: 76.889709,
      destinationLatitude: 55.755826,
      destinationLongitude: 37.6173,
      latestStatusCode: "WAITING_UNLOADING",
    });

    expect(message).toContain("Погрузка: ул. Райымбека");
    expect(message).toContain("Выгрузка: МКАД");
    expect(message).toContain("Ожидаю выгрузку");
  });
});
