import { aggregateManagementReport } from "@/domain/reports/management-report";
import type {
  ManagementReportExportInput,
  ReportExportDriver,
  ReportExportVehicle,
} from "@/domain/reports/report-export";
import type { DashboardData } from "@/lib/dashboard-data";

export type ManagementReportExportFilters = {
  driverId?: string;
  vehicleId?: string;
  tripStatus?: "ACTIVE" | "COMPLETED" | "DRAFT" | "CANCELLED";
  dateFrom?: string;
  dateTo?: string;
};

function datePart(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function tripStatusLabel(value?: string): string {
  if (!value) return "Все статусы";
  return ({ ACTIVE: "В рейсе", CANCELLED: "Отменён", COMPLETED: "Закрыт", DRAFT: "Черновик" } as Record<string, string>)[value] ?? value;
}

function generatedAtLabel(date: Date, timeZone?: string): string {
  try {
    return date.toLocaleString("ru-RU", timeZone ? { timeZone } : undefined);
  } catch {
    return date.toLocaleString("ru-RU");
  }
}

type WorkingDriver = ReportExportDriver & {
  driverId: string;
  latestTripAt: string | null;
};

export function buildManagementReportExport(
  data: DashboardData,
  filters: ManagementReportExportFilters,
  generatedAt: Date,
  timeZone?: string,
): ManagementReportExportInput {
  const incomesByTrip = new Map<string, number>();
  for (const income of data.incomes) {
    incomesByTrip.set(income.tripId, (incomesByTrip.get(income.tripId) ?? 0) + income.reportingAmountMinor);
  }

  const reportTrips = data.trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    driverId: trip.driverId,
    vehicleId: trip.vehicleId,
    vehicleName: trip.vehicleName,
    status: trip.status,
    startedAt: trip.startedAt,
    totalKm: trip.pnl?.totalKm ?? trip.legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0),
    loadedKm: trip.pnl?.loadedKm ?? trip.legs.filter((leg) => leg.loadState === "LOADED").reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0),
    emptyKm: trip.pnl?.emptyKm ?? trip.legs.filter((leg) => leg.loadState === "EMPTY").reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0),
    revenueMinor: incomesByTrip.get(trip.id) ?? trip.pnl?.revenueMinor ?? 0,
    driverCompensationMinor: trip.pnl?.driverCompensationMinor ?? 0,
  }));

  const matchingTrips = reportTrips.filter((trip) => {
    const date = datePart(trip.startedAt);
    return (!filters.driverId || trip.driverId === filters.driverId)
      && (!filters.vehicleId || trip.vehicleId === filters.vehicleId)
      && (!filters.tripStatus || trip.status === filters.tripStatus)
      && (!filters.dateFrom || Boolean(date && date >= filters.dateFrom))
      && (!filters.dateTo || Boolean(date && date <= filters.dateTo));
  });
  const matchingTripIds = new Set(matchingTrips.map((trip) => trip.id));
  const matchingExpenses = data.recentExpenses.filter((expense) => expense.tripId && matchingTripIds.has(expense.tripId));
  const totals = aggregateManagementReport(matchingTrips, matchingExpenses);

  const expensesByTrip = new Map<string, DashboardData["recentExpenses"]>();
  for (const expense of matchingExpenses) {
    if (!expense.tripId) continue;
    const current = expensesByTrip.get(expense.tripId) ?? [];
    current.push(expense);
    expensesByTrip.set(expense.tripId, current);
  }

  const driversWithTrips = new Set(matchingTrips.flatMap((trip) => trip.driverId ? [trip.driverId] : []));
  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === filters.vehicleId);
  const restrictDriversToMatchingTrips = Boolean(filters.vehicleId || filters.tripStatus || filters.dateFrom || filters.dateTo);
  const workingDrivers: WorkingDriver[] = data.driverReports
    .filter((report) => (!filters.driverId || report.driverId === filters.driverId)
      && (!restrictDriversToMatchingTrips || driversWithTrips.has(report.driverId)))
    .map((report) => ({
      driverId: report.driverId,
      displayName: report.displayName,
      assignedVehicleName: selectedVehicle
        ? `${selectedVehicle.displayName} · ${selectedVehicle.plateNumber}`
        : report.assignedVehicleName,
      totalTrips: 0,
      activeTrips: 0,
      completedTrips: 0,
      totalKm: 0,
      loadedKm: 0,
      emptyKm: 0,
      revenueMinor: 0,
      actualExpensesMinor: 0,
      actualProfitMinor: 0,
      normalizedProfitMinor: 0,
      latestTripAt: null,
    }));
  const driversById = new Map(workingDrivers.map((driver) => [driver.driverId, driver]));
  for (const trip of matchingTrips) {
    if (!trip.driverId) continue;
    const driver = driversById.get(trip.driverId);
    if (!driver) continue;
    const tripTotals = aggregateManagementReport([trip], expensesByTrip.get(trip.id) ?? []);
    driver.totalTrips += 1;
    if (trip.status === "ACTIVE") driver.activeTrips += 1;
    if (trip.status === "COMPLETED") driver.completedTrips += 1;
    driver.totalKm += trip.totalKm;
    driver.loadedKm += trip.loadedKm;
    driver.emptyKm += trip.emptyKm;
    driver.revenueMinor += trip.revenueMinor;
    driver.actualExpensesMinor += tripTotals.actualExpensesMinor;
    driver.actualProfitMinor += tripTotals.actualProfitMinor;
    driver.normalizedProfitMinor += tripTotals.normalizedProfitMinor;
    if (trip.startedAt && (!driver.latestTripAt || trip.startedAt > driver.latestTripAt)) driver.latestTripAt = trip.startedAt;
  }

  const vehiclesById = new Map<string, ReportExportVehicle>(data.vehicles.map((vehicle) => [vehicle.id, {
    name: `${vehicle.displayName} · ${vehicle.plateNumber}`,
    trips: 0,
    activeTrips: 0,
    totalKm: 0,
    revenueMinor: 0,
    actualExpensesMinor: 0,
    profitMinor: 0,
  }]));
  for (const trip of matchingTrips) {
    const vehicle = vehiclesById.get(trip.vehicleId) ?? {
      name: trip.vehicleName,
      trips: 0,
      activeTrips: 0,
      totalKm: 0,
      revenueMinor: 0,
      actualExpensesMinor: 0,
      profitMinor: 0,
    };
    const tripTotals = aggregateManagementReport([trip], expensesByTrip.get(trip.id) ?? []);
    vehicle.trips += 1;
    if (trip.status === "ACTIVE") vehicle.activeTrips += 1;
    vehicle.totalKm += trip.totalKm;
    vehicle.revenueMinor += trip.revenueMinor;
    vehicle.actualExpensesMinor += tripTotals.actualExpensesMinor;
    vehicle.profitMinor += tripTotals.actualProfitMinor;
    vehiclesById.set(trip.vehicleId, vehicle);
  }

  const driverNames = new Map(data.driverReports.map((report) => [report.driverId, report.displayName]));
  const selectedDriver = data.driverReports.find((report) => report.driverId === filters.driverId);
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? displayDate(filters.dateFrom) : "начало учёта"} — ${filters.dateTo ? displayDate(filters.dateTo) : "сегодня"}`
    : "Всё время";

  return {
    organizationName: data.organization.name,
    currency: data.organization.baseCurrency,
    generatedAt: generatedAtLabel(generatedAt, timeZone),
    filters: {
      period,
      driver: selectedDriver?.displayName ?? "Все водители",
      vehicle: selectedVehicle ? `${selectedVehicle.displayName} · ${selectedVehicle.plateNumber}` : "Все автомобили",
      tripStatus: tripStatusLabel(filters.tripStatus),
    },
    totals,
    trips: matchingTrips.map((trip) => {
      const tripTotals = aggregateManagementReport([trip], expensesByTrip.get(trip.id) ?? []);
      return {
        title: trip.title,
        driverName: trip.driverId ? driverNames.get(trip.driverId) ?? "Водитель не найден" : "Не назначен",
        vehicleName: trip.vehicleName,
        status: trip.status,
        startedAt: trip.startedAt,
        totalKm: trip.totalKm,
        loadedKm: trip.loadedKm,
        emptyKm: trip.emptyKm,
        revenueMinor: trip.revenueMinor,
        directExpensesMinor: tripTotals.directExpensesMinor,
        driverCompensationMinor: trip.driverCompensationMinor,
        profitMinor: tripTotals.actualProfitMinor,
      };
    }),
    drivers: workingDrivers.map((driver) => ({
      displayName: driver.displayName,
      assignedVehicleName: driver.assignedVehicleName,
      totalTrips: driver.totalTrips,
      activeTrips: driver.activeTrips,
      completedTrips: driver.completedTrips,
      totalKm: driver.totalKm,
      loadedKm: driver.loadedKm,
      emptyKm: driver.emptyKm,
      revenueMinor: driver.revenueMinor,
      actualExpensesMinor: driver.actualExpensesMinor,
      actualProfitMinor: driver.actualProfitMinor,
      normalizedProfitMinor: driver.normalizedProfitMinor,
    })),
    vehicles: [...vehiclesById.values()].filter((vehicle) => vehicle.trips > 0).sort((left, right) => right.totalKm - left.totalKm),
    includeFinance: data.permissions.includes("VIEW_FINANCE"),
  };
}
