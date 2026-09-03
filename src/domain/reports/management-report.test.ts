import { describe, expect, it } from "vitest";

import { aggregateManagementReport } from "./management-report";

describe("aggregateManagementReport", () => {
  it("keeps one-off costs in actual profit but excludes them from normalized profit", () => {
    const totals = aggregateManagementReport([{
      id: "trip-1", revenueMinor: 1_000_000, driverCompensationMinor: 100_000,
      totalKm: 1_000, loadedKm: 800, emptyKm: 200,
    }], [{
      tripId: "trip-1", reportingAmountMinor: 300_000, economicGroup: "OTHER",
      costBehavior: "ONE_OFF", includeInNormalizedCost: false, quantity: null, unit: null,
    }, {
      tripId: "trip-1", reportingAmountMinor: 200_000, economicGroup: "FUEL",
      costBehavior: "VARIABLE", includeInNormalizedCost: true, quantity: 400, unit: "л",
    }]);

    expect(totals.actualExpensesMinor).toBe(600_000);
    expect(totals.normalizedExpensesMinor).toBe(300_000);
    expect(totals.actualProfitMinor).toBe(400_000);
    expect(totals.normalizedProfitMinor).toBe(700_000);
    expect(totals.excludedExpensesMinor).toBe(300_000);
    expect(totals.fuelLiters).toBe(400);
  });

  it("does not include expenses from trips outside the filtered selection", () => {
    const totals = aggregateManagementReport([{
      id: "trip-1", revenueMinor: 500_000, driverCompensationMinor: 0,
      totalKm: 500, loadedKm: 500, emptyKm: 0,
    }], [{
      tripId: "trip-2", reportingAmountMinor: 250_000, economicGroup: "REPAIR",
      costBehavior: "VARIABLE", includeInNormalizedCost: true, quantity: null, unit: null,
    }]);

    expect(totals.directExpensesMinor).toBe(0);
    expect(totals.actualProfitMinor).toBe(500_000);
  });
});

