import { describe, expect, it } from "vitest";
import { calculatePerKmCompensation, calculateTripMetrics } from "./fleet-metrics";

describe("calculateTripMetrics", () => {
  it("calculates P&L, empty mileage and fuel indicators from source facts", () => {
    const metrics = calculateTripMetrics({
      legs: [
        { distanceKm: 3800, loadState: "LOADED" },
        { distanceKm: 2500, loadState: "EMPTY" },
      ],
      incomes: [{ amount: { amountMinor: 100_000_000, currency: "KZT" } }],
      expenses: [
        { categoryCode: "FUEL", amount: { amountMinor: 38_100_000, currency: "KZT" }, quantity: 1200, unit: "L" },
        { categoryCode: "TOLL", amount: { amountMinor: 7_400_000, currency: "KZT" } },
        { categoryCode: "OTHER", amount: { amountMinor: 2_000_000, currency: "KZT" } },
      ],
      driverCompensation: { amountMinor: 40_950_000, currency: "KZT" },
      estimatedIncomeTaxRate: 0.2,
    });

    expect(metrics.totalKm).toBe(6300);
    expect(metrics.loadedKm).toBe(3800);
    expect(metrics.emptyKm).toBe(2500);
    expect(metrics.emptyMileagePct).toBe(39.68);
    expect(metrics.expenses.amountMinor).toBe(47_500_000);
    expect(metrics.profitBeforeEstimatedTax.amountMinor).toBe(11_550_000);
    expect(metrics.estimatedTax.amountMinor).toBe(2_310_000);
    expect(metrics.operatingProfit.amountMinor).toBe(9_240_000);
    expect(metrics.fuelLitresPer100Km).toBe(19.05);
  });

  it("does not conceal mixed currencies", () => {
    expect(() => calculateTripMetrics({
      legs: [],
      incomes: [{ amount: { amountMinor: 100, currency: "KZT" } }],
      expenses: [{ categoryCode: "FUEL", amount: { amountMinor: 100, currency: "USD" } }],
      driverCompensation: { amountMinor: 0, currency: "KZT" },
      estimatedIncomeTaxRate: 0,
    })).toThrow(/multiple currencies/i);
  });

  it("calculates configurable per-kilometre driver compensation", () => {
    expect(calculatePerKmCompensation(6300, 6500, "KZT")).toEqual({
      amountMinor: 40_950_000,
      currency: "KZT",
    });
  });
});

