import { describe, expect, it } from "vitest";

import { calculateTripPnl } from "./trip-pnl";

describe("calculateTripPnl", () => {
  it("keeps P&L deterministic to a minor unit", () => {
    const result = calculateTripPnl({
      currency: "KZT",
      revenueMinor: [100_000_000n],
      legs: [
        { id: "loaded", startOdometerKm: 10, endOdometerKm: 3_420, loadState: "LOADED", completed: true },
        { id: "empty", startOdometerKm: 3_420, endOdometerKm: 4_120, loadState: "EMPTY", completed: true },
      ],
      expenses: [
        { id: "fuel", group: "FUEL", amountMinor: 38_100_000n, approved: true },
        { id: "tolls", group: "TOLLS", amountMinor: 7_400_000n, approved: true },
        { id: "pending", group: "OTHER", amountMinor: 9_000_000n, approved: false },
      ],
      compensationRules: [{ id: "km", type: "PER_KM", label: "За км", rateMinorPerKm: 6_000n, mileageBasis: "TOTAL" }],
      compensationDays: 0,
      estimatedTaxBasisPoints: 1_000,
    });
    expect(result.directExpensesMinor).toBe(45_500_000n);
    expect(result.totalKm).toBe(4_110);
    expect(result.loadedKm).toBe(3_410);
    expect(result.emptyKm).toBe(700);
    expect(result.driverCompensationMinor).toBe(24_660_000n);
    expect(result.managementProfitMinor).toBe(26_856_000n);
    expect(result.warnings).toEqual([]);
  });

  it("does not calculate per-km metrics when valid mileage is absent", () => {
    const result = calculateTripPnl({ currency: "KZT", revenueMinor: [10_000n], legs: [], expenses: [], compensationRules: [], compensationDays: 0, estimatedTaxBasisPoints: 0 });
    expect(result.revenuePerKmMinor).toBeNull();
    expect(result.costPerKmMinor).toBeNull();
    expect(result.profitPerKmMinor).toBeNull();
  });
});
