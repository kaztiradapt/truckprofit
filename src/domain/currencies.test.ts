import { describe, expect, it } from "vitest";

import { currencyLabels, isSupportedCurrency, supportedCurrencies } from "./currencies";

describe("supported currencies", () => {
  it("contains every currency offered by TruckProfit", () => {
    expect(supportedCurrencies).toEqual(["KZT", "USD", "RUB", "CNY", "UZS"]);
  });

  it("has a user-facing label for every currency", () => {
    expect(supportedCurrencies.every((currency) => currencyLabels[currency].startsWith(currency))).toBe(true);
  });

  it("rejects currencies outside the supported set", () => {
    expect(isSupportedCurrency("UZS")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
  });
});
