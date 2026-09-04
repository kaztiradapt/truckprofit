import type { ManagementReportTotals } from "./management-report";

type CsvCell = string | number | null | undefined;

export type ReportExportTrip = {
  title: string;
  driverName: string;
  vehicleName: string;
  status: string;
  startedAt: string | null;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  revenueMinor: number;
  directExpensesMinor: number;
  driverCompensationMinor: number;
  profitMinor: number;
};

export type ReportExportDriver = {
  displayName: string;
  assignedVehicleName: string | null;
  totalTrips: number;
  activeTrips: number;
  completedTrips: number;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  revenueMinor: number;
  actualExpensesMinor: number;
  actualProfitMinor: number;
  normalizedProfitMinor: number;
};

export type ReportExportVehicle = {
  name: string;
  trips: number;
  activeTrips: number;
  totalKm: number;
  revenueMinor: number;
  actualExpensesMinor: number;
  profitMinor: number;
};

export type ManagementReportExportInput = {
  organizationName: string;
  currency: string;
  generatedAt: string;
  filters: {
    period: string;
    driver: string;
    vehicle: string;
    tripStatus: string;
  };
  totals: ManagementReportTotals;
  trips: ReportExportTrip[];
  drivers: ReportExportDriver[];
  vehicles: ReportExportVehicle[];
  includeFinance: boolean;
};

const statusLabels: Record<string, string> = {
  ACTIVE: "В рейсе",
  CANCELLED: "Отменён",
  COMPLETED: "Закрыт",
  DRAFT: "Черновик",
};

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : "";

  let text = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  // Не позволяем значениям из пользовательских полей становиться формулами Excel.
  if (/^[\t\n ]*[=+@]/.test(text) || /^[\t\n ]*-(?!\d)/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows: readonly CsvCell[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

function money(minor: number): number {
  return Math.round(minor) / 100;
}

function perKm(amountMinor: number, km: number): number | null {
  return km > 0 ? Math.round((amountMinor / 100 / km) * 100) / 100 : null;
}

export function buildManagementReportCsv(input: ManagementReportExportInput): string {
  const { totals } = input;
  const rows: CsvCell[][] = [
    ["TruckProfit — управленческий отчёт"],
    ["Компания", input.organizationName],
    ["Сформирован", input.generatedAt],
    ["Основная валюта", input.currency],
    ["Период", input.filters.period],
    ["Водитель", input.filters.driver],
    ["Автомобиль", input.filters.vehicle],
    ["Статус рейса", input.filters.tripStatus],
    [],
    ["Сводка"],
    ["Показатель", "Значение", "Единица"],
    ["Рейсы", totals.trips, "шт."],
    ["Общий пробег", totals.totalKm, "км"],
    ["Пробег с грузом", totals.loadedKm, "км"],
    ["Порожний пробег", totals.emptyKm, "км"],
    ["Топливо", Math.round(totals.fuelLiters * 100) / 100, "л"],
  ];

  if (input.includeFinance) {
    rows.push(
      ["Выручка", money(totals.revenueMinor), input.currency],
      ["Прямые расходы", money(totals.directExpensesMinor), input.currency],
      ["Оплата водителей", money(totals.driverCompensationMinor), input.currency],
      ["Все фактические затраты", money(totals.actualExpensesMinor), input.currency],
      ["Фактический результат", money(totals.actualProfitMinor), input.currency],
      ["Нормализованный результат", money(totals.normalizedProfitMinor), input.currency],
      ["Фактическая себестоимость / км", perKm(totals.actualExpensesMinor, totals.totalKm), input.currency],
      ["Нормальная себестоимость / км", perKm(totals.normalizedExpensesMinor, totals.totalKm), input.currency],
    );
  }

  rows.push(
    [],
    ["Рейсы"],
    [
      "Рейс", "Водитель", "Автомобиль", "Статус", "Дата старта", "Общий км", "С грузом, км", "Порожний, км",
      ...(input.includeFinance ? ["Выручка", "Прямые расходы", "Оплата водителя", "Результат", "Валюта"] : []),
    ],
    ...input.trips.map((trip) => [
      trip.title,
      trip.driverName,
      trip.vehicleName,
      statusLabels[trip.status] ?? trip.status,
      trip.startedAt?.slice(0, 10) ?? "",
      trip.totalKm,
      trip.loadedKm,
      trip.emptyKm,
      ...(input.includeFinance ? [money(trip.revenueMinor), money(trip.directExpensesMinor), money(trip.driverCompensationMinor), money(trip.profitMinor), input.currency] : []),
    ]),
    [],
    ["Водители"],
    [
      "Водитель", "Закреплённый автомобиль", "Рейсы", "Активные", "Закрытые", "Общий км", "С грузом, км", "Порожний, км",
      ...(input.includeFinance ? ["Выручка", "Все затраты", "Фактический результат", "Нормализованный результат", "Валюта"] : []),
    ],
    ...input.drivers.map((driver) => [
      driver.displayName,
      driver.assignedVehicleName ?? "Не закреплён",
      driver.totalTrips,
      driver.activeTrips,
      driver.completedTrips,
      driver.totalKm,
      driver.loadedKm,
      driver.emptyKm,
      ...(input.includeFinance ? [money(driver.revenueMinor), money(driver.actualExpensesMinor), money(driver.actualProfitMinor), money(driver.normalizedProfitMinor), input.currency] : []),
    ]),
    [],
    ["Автомобили"],
    [
      "Автомобиль", "Рейсы", "Активные", "Общий км",
      ...(input.includeFinance ? ["Выручка", "Все затраты", "Результат", "Валюта"] : []),
    ],
    ...input.vehicles.map((vehicle) => [
      vehicle.name,
      vehicle.trips,
      vehicle.activeTrips,
      vehicle.totalKm,
      ...(input.includeFinance ? [money(vehicle.revenueMinor), money(vehicle.actualExpensesMinor), money(vehicle.profitMinor), input.currency] : []),
    ]),
  );

  return rowsToCsv(rows);
}

export function reportExportFilename(organizationName: string, date: Date): string {
  const safeOrganization = organizationName
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "company";
  const localDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return `TruckProfit-${safeOrganization}-${localDate}.csv`;
}
