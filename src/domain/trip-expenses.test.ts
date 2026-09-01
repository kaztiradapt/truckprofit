import { describe, expect, it } from "vitest";

import { groupExpensesByCurrency } from "./trip-expenses";

describe("groupExpensesByCurrency", () => {
  it("groups exact money amounts without mixing currencies", () => {
    expect(groupExpensesByCurrency([
      { amount: 100.1, currency: "KZT" },
      { amount: 20.2, currency: "kzt" },
      { amount: 10, currency: "USD" },
    ], "KZT")).toEqual([
      { currency: "KZT", amount: 120.3 },
      { currency: "USD", amount: 10 },
    ]);
  });

  it("puts the company currency first", () => {
    expect(groupExpensesByCurrency([
      { amount: 5, currency: "USD" },
      { amount: 12, currency: "RUB" },
      { amount: 7, currency: "CNY" },
    ], "RUB").map((item) => item.currency)).toEqual(["RUB", "CNY", "USD"]);
  });
});
