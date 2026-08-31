import { multiplyRate } from "./money";

export type MileageBasis = "TOTAL" | "LOADED" | "EMPTY";
export type ProfitBasis = "REVENUE_MINUS_DIRECT_EXPENSES";

export type CompensationRule =
  | { readonly id: string; readonly type: "PER_KM"; readonly label: string; readonly rateMinorPerKm: bigint; readonly mileageBasis: MileageBasis }
  | { readonly id: string; readonly type: "DAILY"; readonly label: string; readonly rateMinorPerDay: bigint }
  | { readonly id: string; readonly type: "PROFIT_PERCENT"; readonly label: string; readonly basisPoints: number; readonly basis: ProfitBasis; readonly clampNegativeBasisToZero: boolean };

export interface CompensationContext {
  readonly totalKm: number;
  readonly loadedKm: number;
  readonly emptyKm: number;
  readonly revenueMinor: bigint;
  readonly directExpensesMinor: bigint;
  readonly calendarDays: number;
}

export interface CompensationLine {
  readonly ruleId: string;
  readonly ruleType: CompensationRule["type"];
  readonly label: string;
  readonly amountMinor: bigint;
}

function mileageForBasis(context: CompensationContext, basis: MileageBasis): number {
  if (basis === "LOADED") return context.loadedKm;
  if (basis === "EMPTY") return context.emptyKm;
  return context.totalKm;
}

export function calculateDriverCompensation(rules: readonly CompensationRule[], context: CompensationContext): { totalMinor: bigint; lines: readonly CompensationLine[] } {
  const lines = rules.map((rule): CompensationLine => {
    if (rule.type === "PER_KM") {
      return { ruleId: rule.id, ruleType: rule.type, label: rule.label, amountMinor: BigInt(mileageForBasis(context, rule.mileageBasis)) * rule.rateMinorPerKm };
    }
    if (rule.type === "DAILY") {
      if (!Number.isInteger(context.calendarDays) || context.calendarDays < 0) throw new Error("INVALID_COMPENSATION_DAYS");
      return { ruleId: rule.id, ruleType: rule.type, label: rule.label, amountMinor: BigInt(context.calendarDays) * rule.rateMinorPerDay };
    }

    let basisMinor = context.revenueMinor - context.directExpensesMinor;
    if (rule.clampNegativeBasisToZero && basisMinor < 0n) basisMinor = 0n;
    return { ruleId: rule.id, ruleType: rule.type, label: rule.label, amountMinor: multiplyRate(basisMinor, rule.basisPoints) };
  });

  return { totalMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0n), lines };
}
