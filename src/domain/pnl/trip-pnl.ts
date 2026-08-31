import { calculateDriverCompensation, type CompensationRule } from "./driver-compensation";
import { calculateMileage, type MileageLeg } from "./mileage";
import { divideMinorByKm, multiplyRate } from "./money";

export type ExpenseGroup = "FUEL" | "TOLLS" | "REPAIR" | "MAINTENANCE" | "OTHER";

export interface TripExpenseInput {
  readonly id: string;
  readonly group: ExpenseGroup;
  readonly amountMinor: bigint;
  readonly approved: boolean;
  readonly voided?: boolean;
}

export interface TripPnlInput {
  readonly currency: string;
  readonly revenueMinor: readonly bigint[];
  readonly expenses: readonly TripExpenseInput[];
  readonly legs: readonly MileageLeg[];
  readonly compensationRules: readonly CompensationRule[];
  readonly compensationDays: number;
  readonly estimatedTaxBasisPoints: number;
}

export interface TripPnlResult {
  readonly formulaVersion: "trip-pnl-v1";
  readonly currency: string;
  readonly revenueMinor: bigint;
  readonly directExpensesMinor: bigint;
  readonly expensesByGroupMinor: Readonly<Record<ExpenseGroup, bigint>>;
  readonly driverCompensationMinor: bigint;
  readonly estimatedTaxMinor: bigint;
  readonly totalExpensesMinor: bigint;
  readonly contributionProfitMinor: bigint;
  readonly managementProfitMinor: bigint;
  readonly marginBasisPoints: number | null;
  readonly totalKm: number;
  readonly loadedKm: number;
  readonly emptyKm: number;
  readonly emptyPercentage: number | null;
  readonly revenuePerKmMinor: bigint | null;
  readonly costPerKmMinor: bigint | null;
  readonly profitPerKmMinor: bigint | null;
  readonly warnings: readonly string[];
  readonly compensationLines: ReturnType<typeof calculateDriverCompensation>["lines"];
}

const emptyGroups = (): Record<ExpenseGroup, bigint> => ({ FUEL: 0n, TOLLS: 0n, REPAIR: 0n, MAINTENANCE: 0n, OTHER: 0n });

export function calculateTripPnl(input: TripPnlInput): TripPnlResult {
  const mileage = calculateMileage(input.legs);
  const revenueMinor = input.revenueMinor.reduce((sum, value) => sum + value, 0n);
  const expensesByGroupMinor = emptyGroups();
  for (const expense of input.expenses) if (expense.approved && !expense.voided) expensesByGroupMinor[expense.group] += expense.amountMinor;

  const directExpensesMinor = Object.values(expensesByGroupMinor).reduce((sum, value) => sum + value, 0n);
  const compensation = calculateDriverCompensation(input.compensationRules, {
    totalKm: mileage.totalKm,
    loadedKm: mileage.loadedKm,
    emptyKm: mileage.emptyKm,
    revenueMinor,
    directExpensesMinor,
    calendarDays: input.compensationDays,
  });
  const contributionProfitMinor = revenueMinor - directExpensesMinor - compensation.totalMinor;
  const estimatedTaxMinor = multiplyRate(contributionProfitMinor > 0n ? contributionProfitMinor : 0n, input.estimatedTaxBasisPoints);
  const managementProfitMinor = contributionProfitMinor - estimatedTaxMinor;
  const totalExpensesMinor = directExpensesMinor + compensation.totalMinor + estimatedTaxMinor;

  return {
    formulaVersion: "trip-pnl-v1",
    currency: input.currency,
    revenueMinor,
    directExpensesMinor,
    expensesByGroupMinor,
    driverCompensationMinor: compensation.totalMinor,
    estimatedTaxMinor,
    totalExpensesMinor,
    contributionProfitMinor,
    managementProfitMinor,
    marginBasisPoints: revenueMinor === 0n ? null : Number((managementProfitMinor * 10_000n) / revenueMinor),
    totalKm: mileage.totalKm,
    loadedKm: mileage.loadedKm,
    emptyKm: mileage.emptyKm,
    emptyPercentage: mileage.emptyPercentage,
    revenuePerKmMinor: divideMinorByKm(revenueMinor, mileage.totalKm),
    costPerKmMinor: divideMinorByKm(totalExpensesMinor, mileage.totalKm),
    profitPerKmMinor: divideMinorByKm(managementProfitMinor, mileage.totalKm),
    warnings: mileage.warnings,
    compensationLines: compensation.lines,
  };
}
