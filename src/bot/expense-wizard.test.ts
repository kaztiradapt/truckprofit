import { describe, expect, it } from "vitest";
import { advanceExpenseWizard, beginExpenseWizard } from "./expense-wizard";

describe("expense wizard", () => {
  it("collects a fuel expense without making a database write", () => {
    let result = beginExpenseWizard("trip-1");
    result = advanceExpenseWizard(result.state, "FUEL");
    result = advanceExpenseWizard(result.state, "167400");
    result = advanceExpenseWizard(result.state, "540");
    result = advanceExpenseWizard(result.state, "523840");

    expect(result.kind).toBe("CONFIRM");
    expect(result.state.draft).toEqual({
      tripId: "trip-1",
      categoryCode: "FUEL",
      amountMinor: 16_740_000,
      currency: "KZT",
      fuelLitres: 540,
      odometerKm: 523840,
    });
  });
});

