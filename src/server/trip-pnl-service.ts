import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CompensationRule } from "@/domain/pnl/driver-compensation";
import type { ExpenseGroup } from "@/domain/pnl/trip-pnl";
import { calculateTripPnl } from "@/domain/pnl/trip-pnl";

type TripRow = {
  id: string;
  organization_id: string;
  driver_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  organizations: { base_currency: string } | { base_currency: string }[] | null;
};

type LegRow = {
  id: string;
  start_odometer_km: number | string | null;
  end_odometer_km: number | string | null;
  end_at: string | null;
  load_state: "LOADED" | "EMPTY" | "UNKNOWN";
};

type ExpenseRow = {
  id: string;
  reporting_amount_minor: number | string;
  review_status: "PENDING" | "APPROVED" | "REJECTED";
  status: string;
  deleted_at: string | null;
  expense_categories: { economic_group: string } | { economic_group: string }[] | null;
};

type IncomeRow = {
  id: string;
  reporting_amount_minor: number | string;
  payment_status: string;
  deleted_at: string | null;
};

type RuleRow = {
  id: string;
  name: string;
  rule_type: string;
  config: unknown;
  valid_from: string;
  valid_to: string | null;
};

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`P&L service is missing ${name}`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function minor(value: number | string): bigint {
  const result = BigInt(String(value));
  if (result < 0n) throw new Error("Negative reporting amount is not valid for P&L");
  return result;
}

function wholeKm(value: number | string | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function expenseGroup(value: string | undefined): ExpenseGroup {
  if (value === "FUEL" || value === "TOLLS" || value === "REPAIR" || value === "MAINTENANCE") return value;
  return "OTHER";
}

function configValue(config: unknown, keys: string[]): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const record = config as Record<string, unknown>;
  return keys.map((key) => record[key]).find((value) => value !== undefined);
}

function positiveMinor(config: unknown, keys: string[]): bigint {
  const value = configValue(config, keys);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error("Compensation rule is missing a minor-unit rate");
}

function basisPoints(config: unknown): number {
  const value = configValue(config, ["basisPoints", "basis_points"]);
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000) return value;
  throw new Error("Compensation percentage must be an integer from 0 to 10000 basis points");
}

function parseRules(rows: readonly RuleRow[]): CompensationRule[] {
  return rows.map((row) => {
    if (row.rule_type === "PER_KM") {
      const mileageBasis = configValue(row.config, ["mileageBasis", "mileage_basis"]);
      if (mileageBasis !== undefined && mileageBasis !== "TOTAL" && mileageBasis !== "LOADED" && mileageBasis !== "EMPTY") {
        throw new Error("Compensation mileage basis is invalid");
      }
      return {
        id: row.id,
        type: "PER_KM" as const,
        label: row.name,
        rateMinorPerKm: positiveMinor(row.config, ["rateMinorPerKm", "rate_minor_per_km"]),
        mileageBasis: mileageBasis ?? "TOTAL",
      };
    }
    if (row.rule_type === "DAILY_ALLOWANCE") {
      return {
        id: row.id,
        type: "DAILY" as const,
        label: row.name,
        rateMinorPerDay: positiveMinor(row.config, ["rateMinorPerDay", "rate_minor_per_day"]),
      };
    }
    if (row.rule_type === "PERCENT_OF_PROFIT") {
      return {
        id: row.id,
        type: "PROFIT_PERCENT" as const,
        label: row.name,
        basisPoints: basisPoints(row.config),
        basis: "REVENUE_MINUS_DIRECT_EXPENSES",
        clampNegativeBasisToZero: true,
      };
    }
    throw new Error(`Unsupported P0 compensation rule: ${row.rule_type}`);
  });
}

function calendarDays(startedAt: string | null, completedAt: string | null): number {
  if (!startedAt || !completedAt) return 0;
  const elapsed = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("Trip dates are invalid");
  return Math.max(1, Math.ceil(elapsed / 86_400_000));
}

function inputRevision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex");
}

export type PublishedTripPnl = {
  snapshotId: string;
  managementProfitMinor: string;
  totalKm: number;
};

export async function calculateAndPublishTripPnl(input: { organizationId: string; tripId: string }): Promise<PublishedTripPnl> {
  const db = adminClient();
  const { data: rawTrip, error: tripError } = await db
    .from("trips")
    .select("id, organization_id, driver_id, status, started_at, completed_at, organizations(base_currency)")
    .eq("id", input.tripId)
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null)
    .single();
  if (tripError) throw tripError;
  const trip = rawTrip as unknown as TripRow;
  if (trip.status !== "COMPLETED") throw new Error("P&L is available after the trip is completed");
  const organization = one(trip.organizations);
  if (!organization) throw new Error("Trip organization is missing its reporting currency");

  const [legs, expenses, incomes, rules, tax] = await Promise.all([
    db.from("trip_legs").select("id, start_odometer_km, end_odometer_km, end_at, load_state").eq("trip_id", trip.id).eq("organization_id", trip.organization_id).is("deleted_at", null).order("sequence_no"),
    db.from("expenses").select("id, reporting_amount_minor, review_status, status, deleted_at, expense_categories(economic_group)").eq("trip_id", trip.id).eq("organization_id", trip.organization_id).order("occurred_at"),
    db.from("incomes").select("id, reporting_amount_minor, payment_status, deleted_at").eq("trip_id", trip.id).eq("organization_id", trip.organization_id).order("created_at"),
    trip.driver_id
      ? db.from("driver_compensation_rules").select("id, name, rule_type, config, valid_from, valid_to").eq("organization_id", trip.organization_id).eq("driver_id", trip.driver_id).eq("is_active", true).order("valid_from")
      : Promise.resolve({ data: [], error: null }),
    db.from("tax_profiles").select("estimated_income_tax_rate, valid_from, valid_to").eq("organization_id", trip.organization_id).order("valid_from", { ascending: false }),
  ]);
  for (const result of [legs, expenses, incomes, rules, tax]) if (result.error) throw result.error;

  const pendingExpenses = (expenses.data as ExpenseRow[] ?? []).filter((row) => row.review_status === "PENDING" && !row.deleted_at && row.status !== "VOIDED");
  if (pendingExpenses.length) throw new Error(`P&L is blocked: ${pendingExpenses.length} pending expense(s)`);

  const completedDate = trip.completed_at?.slice(0, 10) ?? "";
  const activeRules = (rules.data as RuleRow[] ?? []).filter((row) => row.valid_from <= completedDate && (!row.valid_to || row.valid_to >= completedDate));
  const selectedTax = (tax.data ?? []).find((row) => row.valid_from <= completedDate && (!row.valid_to || row.valid_to >= completedDate));
  const taxBasisPoints = Math.round(Number(selectedTax?.estimated_income_tax_rate ?? 0) * 10_000);

  const calculationInput = {
    currency: organization.base_currency,
    revenueMinor: (incomes.data as IncomeRow[] ?? []).filter((row) => !row.deleted_at && row.payment_status !== "VOIDED").map((row) => minor(row.reporting_amount_minor)),
    legs: (legs.data as LegRow[] ?? []).map((row) => ({
      id: row.id,
      startOdometerKm: wholeKm(row.start_odometer_km),
      endOdometerKm: wholeKm(row.end_odometer_km),
      loadState: row.load_state,
      completed: Boolean(row.end_at),
    })),
    expenses: (expenses.data as ExpenseRow[] ?? []).map((row) => ({
      id: row.id,
      group: expenseGroup(one(row.expense_categories)?.economic_group),
      amountMinor: minor(row.reporting_amount_minor),
      approved: row.review_status === "APPROVED",
      voided: Boolean(row.deleted_at) || row.status === "VOIDED",
    })),
    compensationRules: parseRules(activeRules),
    compensationDays: calendarDays(trip.started_at, trip.completed_at),
    estimatedTaxBasisPoints: taxBasisPoints,
  } as const;
  const result = calculateTripPnl(calculationInput);
  if (result.warnings.length) throw new Error(`P&L is blocked: ${result.warnings.join(", ")}`);

  const revision = inputRevision(calculationInput);
  const lineItems = [
    ["REVENUE", "Выручка", result.revenueMinor],
    ["FUEL", "Топливо", result.expensesByGroupMinor.FUEL],
    ["TOLLS", "Платные дороги", result.expensesByGroupMinor.TOLLS],
    ["REPAIR", "Ремонт", result.expensesByGroupMinor.REPAIR],
    ["MAINTENANCE", "ТО", result.expensesByGroupMinor.MAINTENANCE],
    ["OTHER", "Прочие расходы", result.expensesByGroupMinor.OTHER],
    ["DRIVER_COMPENSATION", "Оплата водителя", result.driverCompensationMinor],
    ["ESTIMATED_TAX", "Оценка налогов", result.estimatedTaxMinor],
  ].map(([code, label, amountMinor], index) => ({ code, label, amountMinor: String(amountMinor), sequenceNo: index + 1 }));

  const { data: snapshotId, error: publishError } = await db.rpc("publish_trip_pnl", {
    p_organization_id: trip.organization_id,
    p_trip_id: trip.id,
    p_formula_version: result.formulaVersion,
    p_input_revision: revision,
    p_currency: organization.base_currency,
    p_totals: {
      revenueMinor: String(result.revenueMinor), directExpensesMinor: String(result.directExpensesMinor),
      driverCompensationMinor: String(result.driverCompensationMinor), estimatedTaxMinor: String(result.estimatedTaxMinor),
      totalExpensesMinor: String(result.totalExpensesMinor), contributionProfitMinor: String(result.contributionProfitMinor),
      managementProfitMinor: String(result.managementProfitMinor), totalKm: result.totalKm, loadedKm: result.loadedKm, emptyKm: result.emptyKm,
    },
    p_line_items: lineItems,
    p_warnings: result.warnings,
  });
  if (publishError) throw publishError;
  return { snapshotId: String(snapshotId), managementProfitMinor: String(result.managementProfitMinor), totalKm: result.totalKm };
}
