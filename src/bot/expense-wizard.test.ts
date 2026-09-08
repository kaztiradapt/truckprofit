import { describe, expect, it } from "vitest";
import { advanceExpenseWizard, beginExpenseWizard, backExpenseWizard, editExpenseWizard } from "./expense-wizard";

describe("expense wizard", () => {
  it.each(["KZT", "RUB", "USD", "CNY", "UZS"])("asks for and records the same company currency: %s", (currency) => {
    const result = advanceExpenseWizard(beginExpenseWizard("trip-1", currency).state, "FUEL");
    expect(result.prompt).toContain(`Валюта учёта компании: ${currency}`);
    expect(result.state.draft.currency).toBe(currency);
    expect(result.prompt).not.toContain("в тенге");
  });
  it("collects a fuel expense without making a database write", () => {
    let result = beginExpenseWizard("trip-1");
    result = advanceExpenseWizard(result.state, "FUEL");
    result = advanceExpenseWizard(result.state, "KZT");
    result = advanceExpenseWizard(result.state, "167400");
    result = advanceExpenseWizard(result.state, "540");
    result = advanceExpenseWizard(result.state, "523840");

    expect(result.kind).toBe("CONFIRM");
    expect(result.state.draft).toEqual({
      tripId: "trip-1",
      categoryCode: "FUEL",
      amountMinor: 16_740_000,
      currency: "KZT",
      originalCurrency: "KZT",
      exchangeRate: 1,
      fuelLitres: 540,
      odometerKm: 523840,
    });
  });

  it("converts to RUB, supports back and corrections without technical confirmation text", () => {
    let result = beginExpenseWizard("trip-1", "RUB");
    for (const input of ["OTHER", "USD", "10", "90", "1000"]) result = advanceExpenseWizard(result.state, input);
    expect(result.state.step).toBe("CONFIRM");
    expect(result.prompt).toContain("900 RUB");
    expect(result.prompt).not.toContain("CONFIRM");
    expect(backExpenseWizard(result.state).state.step).toBe("ODOMETER");
    result = editExpenseWizard(result.state, "CURRENCY");
    result = advanceExpenseWizard(result.state, "RUB");
    expect(result.state.draft.exchangeRate).toBe(1);
    result = advanceExpenseWizard(result.state, "123");
    expect(result.state.step).toBe("ODOMETER");
  });

  it("does not let a correction alter odometer/category; rejects invalid amounts", () => {
    let state = beginExpenseWizard("trip-1").state;
    state = { ...state, step: "CONFIRM", editing: true };
    expect(editExpenseWizard(state, "ODOMETER").state.step).toBe("CONFIRM");
    expect(editExpenseWizard(state, "CATEGORY").state.step).toBe("CONFIRM");
    for (const input of ["NaN", "Infinity", "-1", "0", "1e8", "1.234", "99999999999"])
      expect(advanceExpenseWizard({ ...state, step: "AMOUNT" }, input).kind).toBe("ERROR");
  });
});
