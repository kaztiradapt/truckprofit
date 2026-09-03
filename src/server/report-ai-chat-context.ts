import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
type PnlRow = {
  trip_id: string;
  revenue_minor: number | string;
  direct_expenses_minor: number | string;
  driver_compensation_minor: number | string;
  estimated_tax_minor: number | string;
  total_expenses_minor: number | string;
  management_profit_minor: number | string;
  total_km: number | string;
  loaded_km: number | string;
  empty_km: number | string;
};
type ExpenseRow = {
  reporting_amount_minor: number | string;
  quantity: number | string | null;
  unit: string | null;
  expense_categories: { display_name: string; economic_group: string } | Array<{ display_name: string; economic_group: string }> | null;
};

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

function emptyTotals() {
  return {
    trips: 0,
    revenueMinor: 0,
    directExpensesMinor: 0,
    driverCompensationMinor: 0,
    estimatedTaxMinor: 0,
    totalExpensesMinor: 0,
    profitMinor: 0,
    totalKm: 0,
    loadedKm: 0,
    emptyKm: 0,
  };
}

function addPnl(target: ReturnType<typeof emptyTotals>, pnl: PnlRow | undefined) {
  target.trips += 1;
  if (!pnl) return;
  target.revenueMinor += Number(pnl.revenue_minor);
  target.directExpensesMinor += Number(pnl.direct_expenses_minor);
  target.driverCompensationMinor += Number(pnl.driver_compensation_minor);
  target.estimatedTaxMinor += Number(pnl.estimated_tax_minor);
  target.totalExpensesMinor += Number(pnl.total_expenses_minor);
  target.profitMinor += Number(pnl.management_profit_minor);
  target.totalKm += Number(pnl.total_km);
  target.loadedKm += Number(pnl.loaded_km);
  target.emptyKm += Number(pnl.empty_km);
}

function publicTotals(totals: ReturnType<typeof emptyTotals>) {
  return {
    trips: totals.trips,
    revenue: amount(totals.revenueMinor),
    directExpenses: amount(totals.directExpensesMinor),
    driverCompensation: amount(totals.driverCompensationMinor),
    estimatedTax: amount(totals.estimatedTaxMinor),
    totalExpenses: amount(totals.totalExpensesMinor),
    managementProfit: amount(totals.profitMinor),
    marginPct: totals.revenueMinor ? rounded((totals.profitMinor / totals.revenueMinor) * 100) : null,
    totalKm: rounded(totals.totalKm),
    loadedKm: rounded(totals.loadedKm),
    emptyKm: rounded(totals.emptyKm),
    emptyMileagePct: totals.totalKm ? rounded((totals.emptyKm / totals.totalKm) * 100) : null,
    costPerKm: totals.totalKm ? rounded(amount(totals.totalExpensesMinor) / totals.totalKm, 2) : null,
    profitPerKm: totals.totalKm ? rounded(amount(totals.profitMinor) / totals.totalKm, 2) : null,
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
  let expenseRows: ExpenseRow[] = [];
  if (tripIds.length) {
    const [pnlResult, expensesResult] = await Promise.all([
      supabase.from("pnl_snapshots")
        .select("trip_id, revenue_minor, direct_expenses_minor, driver_compensation_minor, estimated_tax_minor, total_expenses_minor, management_profit_minor, total_km, loaded_km, empty_km")
        .in("trip_id", tripIds)
        .eq("is_current", true),
      supabase.from("expenses")
        .select("reporting_amount_minor, quantity, unit, expense_categories(display_name, economic_group)")
        .in("trip_id", tripIds)
        .neq("review_status", "REJECTED")
        .eq("status", "RECORDED")
        .is("deleted_at", null),
    ]);
    if (pnlResult.error || expensesResult.error) throw new Error("FINANCE_UNAVAILABLE");
    pnlRows = (pnlResult.data ?? []) as PnlRow[];
    expenseRows = (expensesResult.data ?? []) as unknown as ExpenseRow[];
  }

  const pnlByTrip = new Map(pnlRows.map((row) => [row.trip_id, row]));
  const totals = emptyTotals();
  const byDriver = new Map<string, { name: string; totals: ReturnType<typeof emptyTotals> }>();
  const byVehicle = new Map<string, { name: string; totals: ReturnType<typeof emptyTotals> }>();
  const byMonth = new Map<string, ReturnType<typeof emptyTotals>>();

  for (const trip of trips) {
    const pnl = pnlByTrip.get(trip.id);
    addPnl(totals, pnl);
    const driverName = asOne(trip.drivers)?.display_name ?? "Водитель не назначен";
    const vehicle = asOne(trip.vehicles);
    const vehicleName = vehicle ? `${vehicle.display_name}${vehicle.plate_number ? ` · ${vehicle.plate_number}` : ""}` : "Автомобиль не найден";
    const driverBucket = byDriver.get(trip.driver_id ?? "unassigned") ?? { name: driverName, totals: emptyTotals() };
    const vehicleBucket = byVehicle.get(trip.vehicle_id) ?? { name: vehicleName, totals: emptyTotals() };
    addPnl(driverBucket.totals, pnl);
    addPnl(vehicleBucket.totals, pnl);
    byDriver.set(trip.driver_id ?? "unassigned", driverBucket);
    byVehicle.set(trip.vehicle_id, vehicleBucket);
    const month = trip.started_at?.slice(0, 7) ?? "Дата не указана";
    const monthBucket = byMonth.get(month) ?? emptyTotals();
    addPnl(monthBucket, pnl);
    byMonth.set(month, monthBucket);
  }

  const expenseGroups = new Map<string, { category: string; economicGroup: string; amountMinor: number; fuelLiters: number }>();
  for (const expense of expenseRows) {
    const category = asOne(expense.expense_categories);
    if (!category) continue;
    const key = `${category.economic_group}:${category.display_name}`;
    const bucket = expenseGroups.get(key) ?? { category: category.display_name, economicGroup: category.economic_group, amountMinor: 0, fuelLiters: 0 };
    bucket.amountMinor += Number(expense.reporting_amount_minor);
    if (expense.unit === "L") bucket.fuelLiters += Number(expense.quantity ?? 0);
    expenseGroups.set(key, bucket);
  }

  const ranked = (source: typeof byDriver) => [...source.values()]
    .map((item) => ({ name: item.name, ...publicTotals(item.totals) }))
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
    totals: publicTotals(totals),
    monthly: [...byMonth.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-18)
      .map(([month, monthTotals]) => ({ month, ...publicTotals(monthTotals) })),
    drivers: ranked(byDriver).slice(0, 30),
    vehicles: ranked(byVehicle).slice(0, 30),
    expenseGroups: [...expenseGroups.values()]
      .map((item) => ({ category: item.category, economicGroup: item.economicGroup, amount: amount(item.amountMinor), fuelLiters: rounded(item.fuelLiters) }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 30),
    recentTrips: trips.slice(0, 80).map((trip) => {
      const pnl = pnlByTrip.get(trip.id);
      const vehicle = asOne(trip.vehicles);
      return {
        title: trip.title,
        startedAt: trip.started_at,
        status: trip.status,
        driver: asOne(trip.drivers)?.display_name ?? null,
        vehicle: vehicle ? `${vehicle.display_name}${vehicle.plate_number ? ` · ${vehicle.plate_number}` : ""}` : null,
        hasCalculatedPnl: Boolean(pnl),
        ...(pnl ? publicTotals(Object.assign(emptyTotals(), { trips: 1,
          revenueMinor: Number(pnl.revenue_minor), directExpensesMinor: Number(pnl.direct_expenses_minor),
          driverCompensationMinor: Number(pnl.driver_compensation_minor), estimatedTaxMinor: Number(pnl.estimated_tax_minor),
          totalExpensesMinor: Number(pnl.total_expenses_minor), profitMinor: Number(pnl.management_profit_minor),
          totalKm: Number(pnl.total_km), loadedKm: Number(pnl.loaded_km), emptyKm: Number(pnl.empty_km),
        })) : {}),
      };
    }),
    dataQuality: {
      tripsWithoutCalculatedPnl: trips.filter((trip) => !pnlByTrip.has(trip.id)).length,
      note: "Суммы переданы в основной валюте компании. Адреса, геопозиции, чеки, комментарии, контакты и Telegram-данные исключены.",
    },
  };
}

export type ReportAiChatContext = Awaited<ReturnType<typeof buildReportAiChatContext>>;
