export type Money = {
  amountMinor: number;
  currency: string;
};

export type Leg = {
  distanceKm: number;
  loadState: "LOADED" | "EMPTY" | "UNKNOWN";
};

export type Expense = {
  amount: Money;
  categoryCode: string;
  quantity?: number;
  unit?: string;
};

export type Income = {
  amount: Money;
};

export type TripMetricsInput = {
  legs: Leg[];
  incomes: Income[];
  expenses: Expense[];
  driverCompensation: Money;
  estimatedIncomeTaxRate: number;
};

export type TripMetrics = {
  currency: string;
  revenue: Money;
  expenses: Money;
  driverCompensation: Money;
  profitBeforeEstimatedTax: Money;
  estimatedTax: Money;
  operatingProfit: Money;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  emptyMileagePct: number | null;
  costPerKm: Money | null;
  profitPerKm: Money | null;
  fuelLitres: number;
  fuelLitresPer100Km: number | null;
  fuelCostPerKm: Money | null;
};

function assertMoney(value: Money, expectedCurrency?: string): string {
  if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0) {
    throw new Error("Money must be a non-negative safe integer in minor units");
  }
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    throw new Error("Currency must be an ISO-4217-like 3-letter uppercase code");
  }
  if (expectedCurrency && value.currency !== expectedCurrency) {
    throw new Error("MVP metrics cannot combine multiple currencies without an FX rate");
  }
  return value.currency;
}

function money(amountMinor: number, currency: string): Money {
  return { amountMinor: Math.round(amountMinor), currency };
}

function divideMoney(amount: Money, divisor: number): Money | null {
  if (divisor <= 0) return null;
  return money(amount.amountMinor / divisor, amount.currency);
}

function sumMoney(values: Money[], currency: string): Money {
  return money(
    values.reduce((total, value) => total + value.amountMinor, 0),
    currency,
  );
}

export function calculateTripMetrics(input: TripMetricsInput): TripMetrics {
  if (!Number.isFinite(input.estimatedIncomeTaxRate) || input.estimatedIncomeTaxRate < 0 || input.estimatedIncomeTaxRate > 1) {
    throw new Error("Estimated income tax rate must be between 0 and 1");
  }

  const currencies = [
    ...input.incomes.map((item) => item.amount),
    ...input.expenses.map((item) => item.amount),
    input.driverCompensation,
  ].map((item) => assertMoney(item));
  const currency = currencies[0] ?? input.driverCompensation.currency;
  input.incomes.forEach((item) => assertMoney(item.amount, currency));
  input.expenses.forEach((item) => assertMoney(item.amount, currency));
  assertMoney(input.driverCompensation, currency);

  const totalKm = input.legs.reduce((sum, leg) => {
    if (!Number.isFinite(leg.distanceKm) || leg.distanceKm < 0) {
      throw new Error("Leg distance must be a non-negative number");
    }
    return sum + leg.distanceKm;
  }, 0);
  const loadedKm = input.legs
    .filter((leg) => leg.loadState === "LOADED")
    .reduce((sum, leg) => sum + leg.distanceKm, 0);
  const emptyKm = input.legs
    .filter((leg) => leg.loadState === "EMPTY")
    .reduce((sum, leg) => sum + leg.distanceKm, 0);

  const revenue = sumMoney(input.incomes.map((item) => item.amount), currency);
  const expenses = sumMoney(input.expenses.map((item) => item.amount), currency);
  const profitBeforeEstimatedTax = money(
    revenue.amountMinor - expenses.amountMinor - input.driverCompensation.amountMinor,
    currency,
  );
  const estimatedTax = money(
    Math.max(profitBeforeEstimatedTax.amountMinor, 0) * input.estimatedIncomeTaxRate,
    currency,
  );
  const operatingProfit = money(
    profitBeforeEstimatedTax.amountMinor - estimatedTax.amountMinor,
    currency,
  );

  const fuelExpenses = input.expenses.filter((expense) => expense.categoryCode === "FUEL");
  const fuelLitres = fuelExpenses.reduce((total, expense) => {
    if (expense.quantity === undefined) return total;
    if (!Number.isFinite(expense.quantity) || expense.quantity < 0) {
      throw new Error("Fuel quantity must be a non-negative number");
    }
    return total + expense.quantity;
  }, 0);
  const fuelCost = sumMoney(fuelExpenses.map((expense) => expense.amount), currency);

  return {
    currency,
    revenue,
    expenses,
    driverCompensation: input.driverCompensation,
    profitBeforeEstimatedTax,
    estimatedTax,
    operatingProfit,
    totalKm,
    loadedKm,
    emptyKm,
    emptyMileagePct: totalKm > 0 ? Number(((emptyKm / totalKm) * 100).toFixed(2)) : null,
    costPerKm: divideMoney(money(expenses.amountMinor + input.driverCompensation.amountMinor, currency), totalKm),
    profitPerKm: divideMoney(operatingProfit, totalKm),
    fuelLitres,
    fuelLitresPer100Km: totalKm > 0 ? Number(((fuelLitres / totalKm) * 100).toFixed(2)) : null,
    fuelCostPerKm: divideMoney(fuelCost, totalKm),
  };
}

export function calculatePerKmCompensation(totalKm: number, rateMinorPerKm: number, currency: string): Money {
  if (!Number.isFinite(totalKm) || totalKm < 0 || !Number.isSafeInteger(rateMinorPerKm) || rateMinorPerKm < 0) {
    throw new Error("Compensation inputs must be non-negative");
  }
  assertMoney(money(0, currency));
  return money(totalKm * rateMinorPerKm, currency);
}

