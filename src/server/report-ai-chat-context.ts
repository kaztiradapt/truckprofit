import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateManagementReport, type ExpenseBehavior, type ManagementReportExpense, type ManagementReportTrip, type ReportExpenseGroup } from "@/domain/reports/management-report";

type AiChatFilters = {
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  vehicleId?: string;
  tripStatus?: string;
};

type RelatedName = { display_name: string; plate_number?: string };
type TripRow = {
  id: string;
  title: string;
  status: string;
  vehicle_id: string;
  driver_id: string | null;
  started_at: string | null;
  vehicles: RelatedName | RelatedName[] | null;
  drivers: RelatedName | RelatedName[] | null;
};
type PnlRow = { trip_id: string; driver_compensation_minor: number | string; total_km: number | string; loaded_km: number | string; empty_km: number | string };
type LegRow = { trip_id: string; distance_km: number | string | null; load_state: string };
type IncomeRow = { trip_id: string; reporting_amount_minor: number | string };
type ExpenseRow = {
  trip_id: string | null;
  reporting_amount_minor: number | string;
  quantity: number | string | null;
  unit: string | null;
  cost_behavior: ExpenseBehavior;
  include_in_normalized_cost: boolean;
  expense_categories: { display_name: string; economic_group: ReportExpenseGroup } | Array<{ display_name: string; economic_group: ReportExpenseGroup }> | null;
};
type TripFact = ManagementReportTrip & { row: TripRow };

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function amount(minor: number): number {
  return Math.round(minor) / 100;
}

function rounded(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function publicTotals(trips: readonly ManagementReportTrip[], expenses: readonly ManagementReportExpense[]) {
  const totals = aggregateManagementReport(trips, expenses);
  return {
    trips: totals.trips,
    revenue: amount(totals.revenueMinor),
    directExpenses: amount(totals.directExpensesMinor),
    driverCompensation: amount(totals.driverCompensationMinor),
    totalExpenses: amount(totals.actualExpensesMinor),
    managementProfit: amount(totals.actualProfitMinor),
    normalizedExpenses: amount(totals.normalizedExpensesMinor),
    normalizedProfit: amount(totals.normalizedProfitMinor),
    excludedOneOffAndCapitalExpenses: amount(totals.excludedExpensesMinor),
    marginPct: totals.revenueMinor ? rounded((totals.actualProfitMinor / totals.revenueMinor) * 100) : null,
    totalKm: rounded(totals.totalKm),
    loadedKm: rounded(totals.loadedKm),
    emptyKm: rounded(totals.emptyKm),
    emptyMileagePct: totals.totalKm ? rounded((totals.emptyKm / totals.totalKm) * 100) : null,
    fuelLiters: rounded(totals.fuelLiters),
    fuelPer100Km: totals.totalKm && totals.fuelLiters ? rounded((totals.fuelLiters / totals.totalKm) * 100) : null,
    costPerKm: totals.totalKm ? rounded(amount(totals.actualExpensesMinor) / totals.totalKm, 2) : null,
    profitPerKm: totals.totalKm ? rounded(amount(totals.actualProfitMinor) / totals.totalKm, 2) : null,
  };
}

export async function buildReportAiChatContext(
  supabase: SupabaseClient,
  organizationId: string,
  filters: AiChatFilters,
) {
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("name, base_currency")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) throw new Error("ORGANIZATION_UNAVAILABLE");

  let tripsQuery = supabase
    .from("trips")
    .select("id, title, status, vehicle_id, driver_id, started_at, vehicles(display_name, plate_number), drivers(display_name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(500);
  if (filters.dateFrom) tripsQuery = tripsQuery.gte("started_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) tripsQuery = tripsQuery.lte("started_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.driverId) tripsQuery = tripsQuery.eq("driver_id", filters.driverId);
  if (filters.vehicleId) tripsQuery = tripsQuery.eq("vehicle_id", filters.vehicleId);
  if (filters.tripStatus) tripsQuery = tripsQuery.eq("status", filters.tripStatus);

  const { data: tripData, error: tripsError } = await tripsQuery;
  if (tripsError) throw new Error("TRIPS_UNAVAILABLE");
  const trips = (tripData ?? []) as unknown as TripRow[];
  const tripIds = trips.map((trip) => trip.id);

  let pnlRows: PnlRow[] = [];
  let legRows: LegRow[] = [];
  let incomeRows: IncomeRow[] = [];
  let expenseRows: ExpenseRow[] = [];
  if (tripIds.length) {
    const [pnlResult, legsResult, incomesResult, expensesResult] = await Promise.all([
      supabase.from("pnl_snapshots")
        .select("trip_id, driver_compensation_minor, total_km, loaded_km, empty_km")
        .in("trip_id", tripIds)
        .eq("is_current", true),
      supabase.from("trip_legs")
        .select("trip_id, distance_km, load_state")
        .in("trip_id", tripIds)
        .is("deleted_at", null),
      supabase.from("incomes")
        .select("trip_id, reporting_amount_minor")
        .in("trip_id", tripIds)
        .neq("payment_status", "VOIDED")
        .is("deleted_at", null),
      supabase.from("expenses")
        .select("trip_id, reporting_amount_minor, quantity, unit, cost_behavior, include_in_normalized_cost, expense_categories(display_name, economic_group)")
        .in("trip_id", tripIds)
        .neq("review_status", "REJECTED")
        .eq("status", "RECORDED")
        .is("deleted_at", null),
    ]);
    if (pnlResult.error || legsResult.error || incomesResult.error || expensesResult.error) throw new Error("FINANCE_UNAVAILABLE");
    pnlRows = (pnlResult.data ?? []) as PnlRow[];
    legRows = (legsResult.data ?? []) as LegRow[];
    incomeRows = (incomesResult.data ?? []) as IncomeRow[];
    expenseRows = (expensesResult.data ?? []) as unknown as ExpenseRow[];
  }

  const pnlByTrip = new Map(pnlRows.map((row) => [row.trip_id, row]));
  const legsByTrip = new Map<string, LegRow[]>();
  for (const leg of legRows) legsByTrip.set(leg.trip_id, [...(legsByTrip.get(leg.trip_id) ?? []), leg]);
  const revenueByTrip = new Map<string, number>();
  for (const income of incomeRows) revenueByTrip.set(income.trip_id, (revenueByTrip.get(income.trip_id) ?? 0) + Number(income.reporting_amount_minor));

  const tripFacts: TripFact[] = trips.map((row) => {
    const pnl = pnlByTrip.get(row.id);
    const legs = legsByTrip.get(row.id) ?? [];
    return {
      id: row.id,
      row,
      revenueMinor: revenueByTrip.get(row.id) ?? 0,
      driverCompensationMinor: Number(pnl?.driver_compensation_minor ?? 0),
      totalKm: Number(pnl?.total_km ?? legs.reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0)),
      loadedKm: Number(pnl?.loaded_km ?? legs.filter((leg) => leg.load_state === "LOADED").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0)),
      emptyKm: Number(pnl?.empty_km ?? legs.filter((leg) => leg.load_state === "EMPTY").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0)),
    };
  });
  const expenseFacts: Array<ManagementReportExpense & { categoryName: string }> = expenseRows.flatMap((expense) => {
    const category = asOne(expense.expense_categories);
    return category && expense.trip_id ? [{
      tripId: expense.trip_id,
      reportingAmountMinor: Number(expense.reporting_amount_minor),
      economicGroup: category.economic_group,
      costBehavior: expense.cost_behavior,
      includeInNormalizedCost: expense.include_in_normalized_cost,
      quantity: expense.quantity === null ? null : Number(expense.quantity),
      unit: expense.unit,
      categoryName: category.display_name,
    }] : [];
  });

  const expensesFor = (selectedTrips: readonly TripFact[]) => {
    const ids = new Set(selectedTrips.map((trip) => trip.id));
    return expenseFacts.filter((expense) => expense.tripId && ids.has(expense.tripId));
  };
  const summarize = (selectedTrips: readonly TripFact[]) => publicTotals(selectedTrips, expensesFor(selectedTrips));

  const byDriver = new Map<string, { name: string; trips: TripFact[] }>();
  const byVehicle = new Map<string, { name: string; trips: TripFact[] }>();
  const byMonth = new Map<string, TripFact[]>();
  for (const fact of tripFacts) {
    const trip = fact.row;
    const driverName = asOne(trip.drivers)?.display_name ?? "Водитель не назначен";
    const vehicle = asOne(trip.vehicles);
    const vehicleName = vehicle ? `${vehicle.display_name}${vehicle.plate_number ? ` · ${vehicle.plate_number}` : ""}` : "Автомобиль не найден";
    const driverBucket = byDriver.get(trip.driver_id ?? "unassigned") ?? { name: driverName, trips: [] };
    const vehicleBucket = byVehicle.get(trip.vehicle_id) ?? { name: vehicleName, trips: [] };
    driverBucket.trips.push(fact);
    vehicleBucket.trips.push(fact);
    byDriver.set(trip.driver_id ?? "unassigned", driverBucket);
    byVehicle.set(trip.vehicle_id, vehicleBucket);
    const month = trip.started_at?.slice(0, 7) ?? "Дата не указана";
    byMonth.set(month, [...(byMonth.get(month) ?? []), fact]);
  }

  const expenseGroups = new Map<string, { category: string; economicGroup: string; amountMinor: number; fuelLiters: number }>();
  for (const expense of expenseFacts) {
    const key = `${expense.economicGroup}:${expense.categoryName}`;
    const bucket = expenseGroups.get(key) ?? { category: expense.categoryName, economicGroup: expense.economicGroup, amountMinor: 0, fuelLiters: 0 };
    bucket.amountMinor += expense.reportingAmountMinor;
    if (["l", "л", "литр", "литра", "литров"].includes(expense.unit?.trim().toLocaleLowerCase("ru-RU").replaceAll(".", "") ?? "")) {
      bucket.fuelLiters += Number(expense.quantity ?? 0);
    }
    expenseGroups.set(key, bucket);
  }

  const ranked = (source: typeof byDriver) => [...source.values()]
    .map((item) => ({ name: item.name, ...summarize(item.trips) }))
    .sort((left, right) => right.managementProfit - left.managementProfit || right.revenue - left.revenue);

  return {
    company: { name: organization.name, reportingCurrency: organization.base_currency },
    productGuide: {
      trips: "Рейс создаётся в разделе «Создание рейса»; там выбираются водитель, автомобиль, точки маршрута, километраж и доход.",
      vehicles: "Автомобили добавляются и редактируются в разделе «Автомобили».",
      drivers: "Водители добавляются, редактируются, приглашаются в Telegram и закрепляются за автомобилем в разделе «Водители».",
      expenses: "Расходы водителя поступают из Telegram и отображаются в разделе «Расходы» и в карточке рейса; чек открывается внутри кабинета.",
      reports: "Фильтры раздела «Отчёты» ограничивают выборку по периоду, водителю, автомобилю и статусу рейса.",
      team: "Сотрудники и их права настраиваются в разделе «Сотрудники»; финансовые данные доступны только ролям с правом просмотра финансов.",
      support: "Ошибку можно отправить в разделе «Поддержка» со скриншотом и описанием.",
    },
    selection: {
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      driverIdApplied: Boolean(filters.driverId),
      vehicleIdApplied: Boolean(filters.vehicleId),
      tripStatus: filters.tripStatus || null,
      maximumTripsLoaded: 500,
      truncated: trips.length === 500,
    },
    totals: summarize(tripFacts),
    monthly: [...byMonth.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-18)
      .map(([month, monthTrips]) => ({ month, ...summarize(monthTrips) })),
    drivers: ranked(byDriver).slice(0, 30),
    vehicles: ranked(byVehicle).slice(0, 30),
    expenseGroups: [...expenseGroups.values()]
      .map((item) => ({ category: item.category, economicGroup: item.economicGroup, amount: amount(item.amountMinor), fuelLiters: rounded(item.fuelLiters) }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 30),
    recentTrips: tripFacts.slice(0, 80).map((fact) => {
      const trip = fact.row;
      const vehicle = asOne(trip.vehicles);
      return {
        title: trip.title,
        startedAt: trip.started_at,
        status: trip.status,
        driver: asOne(trip.drivers)?.display_name ?? null,
        vehicle: vehicle ? `${vehicle.display_name}${vehicle.plate_number ? ` · ${vehicle.plate_number}` : ""}` : null,
        ...summarize([fact]),
      };
    }),
    dataQuality: {
      tripsWithoutPublishedPnl: trips.filter((trip) => !pnlByTrip.has(trip.id)).length,
      tripsWithoutRevenue: tripFacts.filter((trip) => trip.revenueMinor === 0).length,
      tripsWithoutMileage: tripFacts.filter((trip) => trip.totalKm === 0).length,
      note: "Факт рассчитан из рейсов, доходов и записанных расходов по тем же правилам, что управленческий дэшборд. Без опубликованного P&L оплата водителя может быть равна нулю. Адреса, геопозиции, чеки, комментарии, контакты и Telegram-данные исключены.",
    },
  };
}

export type ReportAiChatContext = Awaited<ReturnType<typeof buildReportAiChatContext>>;
