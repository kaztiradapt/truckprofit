import { describe, expect, it } from "vitest";

import { calculateDriverCompensation } from "./driver-compensation";

describe("calculateDriverCompensation", () => {
  it("composes per-km, daily and profit percentage rules", () => {
    const result = calculateDriverCompensation(
      [
        { id: "km", type: "PER_KM", label: "km", rateMinorPerKm: 6_000n, mileageBasis: "TOTAL" },
        { id: "day", type: "DAILY", label: "day", rateMinorPerDay: 700_000n },
        { id: "pct", type: "PROFIT_PERCENT", label: "profit", basisPoints: 2_500, basis: "REVENUE_MINUS_DIRECT_EXPENSES", clampNegativeBasisToZero: true },
      ],
      { totalKm: 1_000, loadedKm: 800, emptyKm: 200, revenueMinor: 100_000_000n, directExpensesMinor: 60_000_000n, calendarDays: 2 },
    );
    expect(result.totalMinor).toBe(17_400_000n);
    expect(result.lines.map((line) => line.amountMinor)).toEqual([6_000_000n, 1_400_000n, 10_000_000n]);
  });
});
