export const expenseBehaviors = ["VARIABLE", "FIXED", "RESERVE", "ONE_OFF", "CAPITAL"] as const;
export type ExpenseBehavior = typeof expenseBehaviors[number];

export const expenseGroups = ["FUEL", "TOLLS", "REPAIR", "MAINTENANCE", "OTHER"] as const;
export type ReportExpenseGroup = typeof expenseGroups[number];

export type ManagementReportTrip = {
  id: string;
  revenueMinor: number;
  driverCompensationMinor: number;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
};

export type ManagementReportExpense = {
  tripId: string | null;
  reportingAmountMinor: number;
  economicGroup: ReportExpenseGroup;
  costBehavior: ExpenseBehavior;
  includeInNormalizedCost: boolean;
  quantity: number | null;
  unit: string | null;
};

export type ManagementReportTotals = {
  trips: number;
  revenueMinor: number;
  directExpensesMinor: number;
  driverCompensationMinor: number;
  actualExpensesMinor: number;
  normalizedExpensesMinor: number;
  excludedExpensesMinor: number;
  actualProfitMinor: number;
  normalizedProfitMinor: number;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  fuelLiters: number;
  expensesByGroupMinor: Record<ReportExpenseGroup, number>;
  expensesByBehaviorMinor: Record<ExpenseBehavior, number>;
};

function isLiterUnit(unit: string | null): boolean {
  if (!unit) return false;
  const normalized = unit.trim().toLocaleLowerCase("ru-RU").replaceAll(".", "");
  return ["l", "л", "литр", "литра", "литров"].includes(normalized);
}

export function aggregateManagementReport(
  trips: readonly ManagementReportTrip[],
  expenses: readonly ManagementReportExpense[],
): ManagementReportTotals {
  const tripIds = new Set(trips.map((trip) => trip.id));
  const relevantExpenses = expenses.filter((expense) => expense.tripId && tripIds.has(expense.tripId));
  const expensesByGroupMinor = Object.fromEntries(expenseGroups.map((group) => [group, 0])) as Record<ReportExpenseGroup, number>;
  const expensesByBehaviorMinor = Object.fromEntries(expenseBehaviors.map((behavior) => [behavior, 0])) as Record<ExpenseBehavior, number>;

  let directExpensesMinor = 0;
  let normalizedDirectExpensesMinor = 0;
  let fuelLiters = 0;
  for (const expense of relevantExpenses) {
    directExpensesMinor += expense.reportingAmountMinor;
    expensesByGroupMinor[expense.economicGroup] += expense.reportingAmountMinor;
    expensesByBehaviorMinor[expense.costBehavior] += expense.reportingAmountMinor;
    if (expense.includeInNormalizedCost) normalizedDirectExpensesMinor += expense.reportingAmountMinor;
    if (expense.economicGroup === "FUEL" && expense.quantity && isLiterUnit(expense.unit)) fuelLiters += expense.quantity;
  }

  const revenueMinor = trips.reduce((sum, trip) => sum + trip.revenueMinor, 0);
  const driverCompensationMinor = trips.reduce((sum, trip) => sum + trip.driverCompensationMinor, 0);
  const totalKm = trips.reduce((sum, trip) => sum + trip.totalKm, 0);
  const loadedKm = trips.reduce((sum, trip) => sum + trip.loadedKm, 0);
  const emptyKm = trips.reduce((sum, trip) => sum + trip.emptyKm, 0);
  const actualExpensesMinor = directExpensesMinor + driverCompensationMinor;
  const normalizedExpensesMinor = normalizedDirectExpensesMinor + driverCompensationMinor;

  return {
    trips: trips.length,
    revenueMinor,
    directExpensesMinor,
    driverCompensationMinor,
    actualExpensesMinor,
    normalizedExpensesMinor,
    excludedExpensesMinor: directExpensesMinor - normalizedDirectExpensesMinor,
    actualProfitMinor: revenueMinor - actualExpensesMinor,
    normalizedProfitMinor: revenueMinor - normalizedExpensesMinor,
    totalKm,
    loadedKm,
    emptyKm,
    fuelLiters,
    expensesByGroupMinor,
    expensesByBehaviorMinor,
  };
}

