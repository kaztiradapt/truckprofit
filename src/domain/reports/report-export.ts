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

function html(value: CsvCell): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlMoney(valueMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(valueMinor / 100);
  } catch {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(valueMinor / 100)} ${currency}`;
  }
}

function htmlKm(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} км`;
}

function htmlTable(headers: string[], rows: CsvCell[][]): string {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${html(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Нет данных для выбранных фильтров</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${html(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function buildManagementReportHtml(input: ManagementReportExportInput): string {
  const { totals } = input;
  const summary = [
    ["Рейсы", String(totals.trips)],
    ["Общий пробег", htmlKm(totals.totalKm)],
    ["С грузом", htmlKm(totals.loadedKm)],
    ["Порожний пробег", htmlKm(totals.emptyKm)],
    ...(input.includeFinance ? [
      ["Выручка", htmlMoney(totals.revenueMinor, input.currency)],
      ["Фактические затраты", htmlMoney(totals.actualExpensesMinor, input.currency)],
      ["Фактический результат", htmlMoney(totals.actualProfitMinor, input.currency)],
      ["Нормализованный результат", htmlMoney(totals.normalizedProfitMinor, input.currency)],
    ] : []),
  ];
  const tripHeaders = ["Рейс", "Водитель", "Автомобиль", "Статус", "Дата", "Общий км", "С грузом", "Порожний",
    ...(input.includeFinance ? ["Выручка", "Расходы", "Оплата водителя", "Результат"] : [])];
  const tripRows = input.trips.map((trip) => [
    trip.title,
    trip.driverName,
    trip.vehicleName,
    statusLabels[trip.status] ?? trip.status,
    trip.startedAt?.slice(0, 10) ?? "",
    trip.totalKm,
    trip.loadedKm,
    trip.emptyKm,
    ...(input.includeFinance ? [
      htmlMoney(trip.revenueMinor, input.currency),
      htmlMoney(trip.directExpensesMinor, input.currency),
      htmlMoney(trip.driverCompensationMinor, input.currency),
      htmlMoney(trip.profitMinor, input.currency),
    ] : []),
  ]);
  const driverHeaders = ["Водитель", "Закреплённый автомобиль", "Рейсы", "Активные", "Закрытые", "Общий км",
    ...(input.includeFinance ? ["Выручка", "Все затраты", "Результат"] : [])];
  const driverRows = input.drivers.map((driver) => [
    driver.displayName,
    driver.assignedVehicleName ?? "Не закреплён",
    driver.totalTrips,
    driver.activeTrips,
    driver.completedTrips,
    driver.totalKm,
    ...(input.includeFinance ? [
      htmlMoney(driver.revenueMinor, input.currency),
      htmlMoney(driver.actualExpensesMinor, input.currency),
      htmlMoney(driver.actualProfitMinor, input.currency),
    ] : []),
  ]);
  const vehicleHeaders = ["Автомобиль", "Рейсы", "Активные", "Общий км",
    ...(input.includeFinance ? ["Выручка", "Все затраты", "Результат"] : [])];
  const vehicleRows = input.vehicles.map((vehicle) => [
    vehicle.name,
    vehicle.trips,
    vehicle.activeTrips,
    vehicle.totalKm,
    ...(input.includeFinance ? [
      htmlMoney(vehicle.revenueMinor, input.currency),
      htmlMoney(vehicle.actualExpensesMinor, input.currency),
      htmlMoney(vehicle.profitMinor, input.currency),
    ] : []),
  ]);

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TruckProfit — отчёт ${html(input.organizationName)}</title>
<style>
  :root{color-scheme:light;--ink:#14231e;--muted:#627069;--line:#d9e3de;--green:#176f52;--paper:#fff;--wash:#f3f6f3}
  *{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{max-width:1180px;margin:0 auto;padding:28px}.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:12px;justify-content:flex-end;padding:14px 0;background:var(--wash)}
  button{appearance:none;border:0;border-radius:12px;background:var(--green);color:#fff;font:700 15px inherit;padding:13px 20px;cursor:pointer}button.secondary{background:#e4ebe7;color:var(--ink)}
  .sheet{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:34px;box-shadow:0 12px 36px #173d2920}
  .eyebrow{margin:0 0 6px;color:var(--green);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:32px}h2{margin:30px 0 12px;font-size:20px}
  .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;margin:24px 0;padding:18px;border-radius:14px;background:var(--wash)}.meta span{color:var(--muted)}
  .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric{padding:16px;border:1px solid var(--line);border-radius:14px}.metric span{display:block;color:var(--muted);font-size:12px}.metric b{display:block;margin-top:5px;font-size:20px}
  .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{background:var(--wash);font-size:12px}tbody tr:last-child td{border-bottom:0}
  .foot{margin:26px 0 0;color:var(--muted);font-size:12px}
  @media(max-width:700px){main{padding:12px}.sheet{padding:20px;border-radius:16px}h1{font-size:25px}.meta,.summary{grid-template-columns:1fr 1fr}.metric b{font-size:17px}}
  @media print{body{background:#fff;font-size:10px}main{max-width:none;padding:0}.toolbar{display:none}.sheet{border:0;border-radius:0;box-shadow:none;padding:0}.summary{grid-template-columns:repeat(4,1fr)}h2{break-after:avoid}.table-wrap{overflow:visible}table{font-size:9px}th,td{padding:6px;white-space:normal}thead{display:table-header-group}}
</style></head><body><main>
<div class="toolbar"><button type="button" class="secondary" onclick="history.back()">Вернуться в отчёты</button><button type="button" onclick="window.print()">Печать / сохранить PDF</button></div>
<article class="sheet"><p class="eyebrow">TruckProfit · управленческий отчёт</p><h1>${html(input.organizationName)}</h1>
<div class="meta"><div><span>Сформирован:</span> ${html(input.generatedAt)}</div><div><span>Основная валюта:</span> ${html(input.currency)}</div><div><span>Период:</span> ${html(input.filters.period)}</div><div><span>Статус:</span> ${html(input.filters.tripStatus)}</div><div><span>Водитель:</span> ${html(input.filters.driver)}</div><div><span>Автомобиль:</span> ${html(input.filters.vehicle)}</div></div>
<section class="summary">${summary.map(([label, value]) => `<div class="metric"><span>${html(label)}</span><b>${html(value)}</b></div>`).join("")}</section>
<h2>Рейсы</h2>${htmlTable(tripHeaders, tripRows)}
<h2>Водители</h2>${htmlTable(driverHeaders, driverRows)}
<h2>Автомобили</h2>${htmlTable(vehicleHeaders, vehicleRows)}
<p class="foot">Отчёт сформирован системой TruckProfit по выбранным фильтрам. Финансовые показатели отображаются только пользователям с соответствующим доступом.</p>
</article></main></body></html>`;
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
