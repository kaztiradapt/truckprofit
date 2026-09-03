import { describe, expect, it } from "vitest";

import { buildReportSignals, toReportMetricSnapshot } from "./ai-report-analysis";
import { aggregateManagementReport } from "./management-report";

function totals(input: { km: number; emptyKm?: number; fuelLiters: number; fuelMinor: number; repairMinor?: number; revenueMinor?: number }) {
  return aggregateManagementReport(
    [{ id: "trip", totalKm: input.km, loadedKm: input.km - (input.emptyKm ?? 0), emptyKm: input.emptyKm ?? 0, revenueMinor: input.revenueMinor ?? 10_000_000, driverCompensationMinor: 0 }],
    [
      { tripId: "trip", reportingAmountMinor: input.fuelMinor, economicGroup: "FUEL", costBehavior: "VARIABLE", includeInNormalizedCost: true, quantity: input.fuelLiters, unit: "L" },
      { tripId: "trip", reportingAmountMinor: input.repairMinor ?? 0, economicGroup: "REPAIR", costBehavior: "VARIABLE", includeInNormalizedCost: true, quantity: null, unit: null },
    ],
  );
}

describe("AI report deterministic signals", () => {
  it("detects a material fuel consumption increase without AI arithmetic", () => {
    const previous = toReportMetricSnapshot(totals({ km: 1000, fuelLiters: 300, fuelMinor: 15_000_000 }));
    const current = toReportMetricSnapshot(totals({ km: 1000, fuelLiters: 360, fuelMinor: 18_000_000 }));
    const signal = buildReportSignals(current, previous).find((item) => item.id === "FUEL_CONSUMPTION_CHANGE");
    expect(signal).toMatchObject({ severity: "CRITICAL", currentValue: 36, previousValue: 30, changePct: 20 });
  });

  it("does not invent a fuel comparison when mileage is insufficient", () => {
    const previous = toReportMetricSnapshot(totals({ km: 100, fuelLiters: 30, fuelMinor: 1_500_000 }));
    const current = toReportMetricSnapshot(totals({ km: 120, fuelLiters: 50, fuelMinor: 2_500_000 }));
    const signals = buildReportSignals(current, previous);
    expect(signals.some((item) => item.id === "FUEL_DATA_QUALITY")).toBe(true);
    expect(signals.some((item) => item.id === "FUEL_CONSUMPTION_CHANGE")).toBe(false);
  });

  it("detects a selected vehicle exceeding its configured norm", () => {
    const previous = toReportMetricSnapshot(totals({ km: 1000, fuelLiters: 300, fuelMinor: 15_000_000 }));
    const current = toReportMetricSnapshot(totals({ km: 1000, fuelLiters: 350, fuelMinor: 17_500_000 }));
    expect(buildReportSignals(current, previous, 30).some((item) => item.id === "FUEL_NORM_EXCEEDED")).toBe(true);
  });
});
