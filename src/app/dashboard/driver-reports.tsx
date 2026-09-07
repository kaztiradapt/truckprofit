"use client";

import { useMemo, useState, type MouseEvent } from "react";

import {
  aggregateManagementReport,
  expenseBehaviors,
  expenseGroups,
  type ExpenseBehavior,
  type ManagementReportExpense,
  type ReportExpenseGroup,
} from "@/domain/reports/management-report";
import { AiReportAnalyst } from "./ai-report-analyst";
import { AiReportChat } from "./ai-report-chat";
import { DeviceDateTime } from "./device-date-time";

type DriverReport = {
  driverId: string;
  displayName: string;
  status: string;
  assignedVehicleName: string | null;
  totalTrips: number;
  activeTrips: number;
  completedTrips: number;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  driverCompensationMinor: number;
  managementProfitMinor: number;
  latestTripAt: string | null;
};

type ReportTrip = {
  id: string;
  title: string;
  driverId: string | null;
  vehicleId: string;
  vehicleName: string;
  status: string;
  startedAt: string | null;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  revenueMinor: number;
  driverCompensationMinor: number;
};

type ReportExpense = ManagementReportExpense & {
  id: string;
  vehicleId: string;
  driverId: string | null;
  categoryName: string;
  occurredAt: string;
};

type VehicleOption = { id: string; displayName: string; plateNumber: string };

const groupLabels: Record<ReportExpenseGroup, string> = {
  FUEL: "Топливо",
  TOLLS: "Платные дороги",
  REPAIR: "Ремонт",
  MAINTENANCE: "ТО и обслуживание",
  OTHER: "Прочие",
};

const behaviorLabels: Record<ExpenseBehavior, string> = {
  VARIABLE: "Переменные",
  FIXED: "Постоянные",
  RESERVE: "Резервы / нормативы",
  ONE_OFF: "Разовые",
  CAPITAL: "Капитальные",
};

function formatKm(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} км`;
}

function formatMinor(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
}

function formatRate(value: number | null, currency: string) {
  return value === null ? "—" : `${formatMinor(value, currency)} / км`;
}

function barWidth(value: number, maximum: number) {
  if (value <= 0 || maximum <= 0) return "0%";
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

function plural(value: number, forms: [string, string, string]) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (last === 1 && lastTwo !== 11) return forms[0];
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

function tripCount(value: number) {
  return `${value} ${plural(value, ["рейс", "рейса", "рейсов"])}`;
}

function driverCount(value: number) {
  return `${value} ${plural(value, ["водитель", "водителя", "водителей"])}`;
}

function perKm(amountMinor: number, km: number): number | null {
  return km > 0 ? Math.round(amountMinor / km) : null;
}

function datePart(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

export function DriverReports({ organizationId, reports, trips, expenses, vehicles, baseCurrency, canViewFinance }: {
  organizationId: string;
  organizationName: string;
  reports: DriverReport[];
  trips: ReportTrip[];
  expenses: ReportExpense[];
  vehicles: VehicleOption[];
  baseCurrency: string;
  canViewFinance: boolean;
}) {
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [tripStatus, setTripStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const matchingTrips = useMemo(() => trips.filter((trip) => {
    const date = datePart(trip.startedAt);
    return (!driverId || trip.driverId === driverId)
      && (!vehicleId || trip.vehicleId === vehicleId)
      && (!tripStatus || trip.status === tripStatus)
      && (!dateFrom || Boolean(date && date >= dateFrom))
      && (!dateTo || Boolean(date && date <= dateTo));
  }), [dateFrom, dateTo, driverId, tripStatus, trips, vehicleId]);

  const matchingTripIds = useMemo(() => new Set(matchingTrips.map((trip) => trip.id)), [matchingTrips]);
  const matchingExpenses = useMemo(() => expenses.filter((expense) => expense.tripId && matchingTripIds.has(expense.tripId)), [expenses, matchingTripIds]);
  const totals = useMemo(() => aggregateManagementReport(matchingTrips, matchingExpenses), [matchingExpenses, matchingTrips]);

  const expensesByTrip = useMemo(() => {
    const result = new Map<string, ReportExpense[]>();
    for (const expense of matchingExpenses) {
      if (!expense.tripId) continue;
      const current = result.get(expense.tripId) ?? [];
      current.push(expense);
      result.set(expense.tripId, current);
    }
    return result;
  }, [matchingExpenses]);

  const filteredReports = useMemo(() => {
    const driversWithTrips = new Set(matchingTrips.flatMap((trip) => trip.driverId ? [trip.driverId] : []));
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    const restrictToMatchingTrips = Boolean(vehicleId || tripStatus || dateFrom || dateTo);
    const result = reports
      .filter((report) => (!driverId || report.driverId === driverId) && (!restrictToMatchingTrips || driversWithTrips.has(report.driverId)))
      .map((report) => ({
        ...report,
        assignedVehicleName: selectedVehicle ? `${selectedVehicle.displayName} · ${selectedVehicle.plateNumber}` : report.assignedVehicleName,
        totalTrips: 0, activeTrips: 0, completedTrips: 0, totalKm: 0, loadedKm: 0, emptyKm: 0,
        driverCompensationMinor: 0, managementProfitMinor: 0, latestTripAt: null as string | null,
        revenueMinor: 0, actualExpensesMinor: 0, normalizedExpensesMinor: 0, normalizedProfitMinor: 0,
      }));
    const byDriver = new Map(result.map((report) => [report.driverId, report]));
    for (const trip of matchingTrips) {
      if (!trip.driverId) continue;
      const report = byDriver.get(trip.driverId);
      if (!report) continue;
      const tripTotals = aggregateManagementReport([trip], expensesByTrip.get(trip.id) ?? []);
      report.totalTrips += 1;
      if (trip.status === "ACTIVE") report.activeTrips += 1;
      if (trip.status === "COMPLETED") report.completedTrips += 1;
      report.totalKm += trip.totalKm;
      report.loadedKm += trip.loadedKm;
      report.emptyKm += trip.emptyKm;
      report.driverCompensationMinor += trip.driverCompensationMinor;
      report.revenueMinor += trip.revenueMinor;
      report.actualExpensesMinor += tripTotals.actualExpensesMinor;
      report.normalizedExpensesMinor += tripTotals.normalizedExpensesMinor;
      report.managementProfitMinor += tripTotals.actualProfitMinor;
      report.normalizedProfitMinor += tripTotals.normalizedProfitMinor;
      if (trip.startedAt && (!report.latestTripAt || trip.startedAt > report.latestTripAt)) report.latestTripAt = trip.startedAt;
    }
    return result;
  }, [dateFrom, dateTo, driverId, expensesByTrip, matchingTrips, reports, tripStatus, vehicleId, vehicles]);

  const driverPerformance = useMemo(() => filteredReports
    .filter((report) => report.totalTrips > 0)
    .sort((left, right) => right.totalKm - left.totalKm)
    .slice(0, 6), [filteredReports]);
  const maximumDriverKm = Math.max(0, ...driverPerformance.map((report) => report.totalKm));

  const vehicleReportRows = useMemo(() => {
    const byVehicle = new Map(vehicles.map((vehicle) => [vehicle.id, {
      id: vehicle.id, name: `${vehicle.displayName} · ${vehicle.plateNumber}`,
      trips: 0, activeTrips: 0, totalKm: 0, revenueMinor: 0, actualExpensesMinor: 0, profitMinor: 0,
    }]));
    for (const trip of matchingTrips) {
      const current = byVehicle.get(trip.vehicleId) ?? {
        id: trip.vehicleId, name: trip.vehicleName, trips: 0, activeTrips: 0, totalKm: 0,
        revenueMinor: 0, actualExpensesMinor: 0, profitMinor: 0,
      };
      const tripTotals = aggregateManagementReport([trip], expensesByTrip.get(trip.id) ?? []);
      current.trips += 1;
      current.activeTrips += trip.status === "ACTIVE" ? 1 : 0;
      current.totalKm += trip.totalKm;
      current.revenueMinor += trip.revenueMinor;
      current.actualExpensesMinor += tripTotals.actualExpensesMinor;
      current.profitMinor += tripTotals.actualProfitMinor;
      byVehicle.set(trip.vehicleId, current);
    }
    return [...byVehicle.values()].filter((vehicle) => vehicle.trips > 0).sort((left, right) => right.totalKm - left.totalKm);
  }, [expensesByTrip, matchingTrips, vehicles]);
  const vehiclePerformance = useMemo(() => vehicleReportRows.slice(0, 6), [vehicleReportRows]);
  const maximumVehicleKm = Math.max(0, ...vehiclePerformance.map((vehicle) => vehicle.totalKm));

  const expenseStructure = expenseGroups.map((group) => ({ group, amount: totals.expensesByGroupMinor[group] })).filter((item) => item.amount > 0);
  const expenseBehaviorsData = expenseBehaviors.map((behavior) => ({ behavior, amount: totals.expensesByBehaviorMinor[behavior] })).filter((item) => item.amount > 0);
  const maximumExpenseGroup = Math.max(0, ...expenseStructure.map((item) => item.amount));
  const maximumExpenseBehavior = Math.max(0, ...expenseBehaviorsData.map((item) => item.amount));
  const loadedShare = totals.totalKm ? Math.round((totals.loadedKm / totals.totalKm) * 100) : 0;
  const emptyShare = totals.totalKm ? Math.round((totals.emptyKm / totals.totalKm) * 100) : 0;
  const margin = totals.revenueMinor ? (totals.actualProfitMinor / totals.revenueMinor) * 100 : null;
  const normalizedMargin = totals.revenueMinor ? (totals.normalizedProfitMinor / totals.revenueMinor) * 100 : null;
  const fuelPer100 = totals.totalKm > 0 && totals.fuelLiters > 0 ? (totals.fuelLiters / totals.totalKm) * 100 : null;
  const filtersApplied = Boolean(driverId || vehicleId || tripStatus || dateFrom || dateTo);

  function setRecentPeriod(days: number) {
    const latest = trips.map((trip) => datePart(trip.startedAt)).filter(Boolean).sort().at(-1);
    const end = latest ? new Date(`${latest}T12:00:00`) : new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  }

  function currentReportHref(format: "csv" | "print") {
    const params = new URLSearchParams({ format });
    if (driverId) params.set("driverId", driverId);
    if (vehicleId) params.set("vehicleId", vehicleId);
    if (tripStatus) params.set("tripStatus", tripStatus);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/reports/export?${params.toString()}`;
  }

  function attachDeviceTimeZone(event: MouseEvent<HTMLAnchorElement>) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const url = new URL(event.currentTarget.href);
    url.searchParams.set("timeZone", timeZone);
    event.currentTarget.href = url.toString();
  }

  return <section className="driver-reports">
    <div className="report-dashboard-intro">
      <div><p className="eyebrow">Управленческий дэшборд</p><h2>Экономика автопарка</h2><p>Факт показывает все затраты. Нормализованный результат отдельно убирает только отмеченные разовые и капитальные расходы.</p></div>
      <span>{tripCount(matchingTrips.length)} в выборке</span>
    </div>

    <div className="report-period-presets" aria-label="Быстрый выбор периода">
      <b>Период</b>
      <button type="button" onClick={() => setRecentPeriod(30)}>30 дней</button>
      <button type="button" onClick={() => setRecentPeriod(90)}>90 дней</button>
      <button type="button" onClick={() => setRecentPeriod(365)}>12 месяцев</button>
      <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>Всё время</button>
    </div>

    <div className="report-filters" aria-label="Фильтры отчёта">
      <label><span>С даты</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label><span>По дату</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      <label><span>Водитель</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Все водители</option>{reports.map((report) => <option key={report.driverId} value={report.driverId}>{report.displayName}</option>)}</select></label>
      <label><span>Автомобиль</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Все автомобили</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
      <label><span>Статус рейса</span><select value={tripStatus} onChange={(event) => setTripStatus(event.target.value)}><option value="">Все статусы</option><option value="ACTIVE">В рейсе</option><option value="COMPLETED">Закрыт</option><option value="DRAFT">Черновик</option><option value="CANCELLED">Отменён</option></select></label>
      {filtersApplied ? <button type="button" className="tiny-button" onClick={() => { setDriverId(""); setVehicleId(""); setTripStatus(""); setDateFrom(""); setDateTo(""); }}>Сбросить</button> : null}
    </div>

    <div className="report-export-toolbar" aria-label="Выгрузка отчёта">
      <span><b>Скачать текущую выборку</b><small>Фильтры применяются к файлу. Выгрузка работает и во встроенном браузере Telegram.</small></span>
      <div>
        {matchingTrips.length ? <>
          <a className="button-secondary" href={currentReportHref("print")} onClick={attachDeviceTimeZone}>Печать / PDF</a>
          <a className="button" href={currentReportHref("csv")} onClick={attachDeviceTimeZone}>Скачать CSV</a>
        </> : <>
          <button type="button" className="button-secondary" disabled>Печать / PDF</button>
          <button type="button" disabled>Скачать CSV</button>
        </>}
      </div>
    </div>

    {canViewFinance ? <AiReportAnalyst
      key={`${driverId}:${vehicleId}:${tripStatus}:${dateFrom}:${dateTo}`}
      organizationId={organizationId}
      driverId={driverId}
      vehicleId={vehicleId}
      tripStatus={tripStatus}
      dateFrom={dateFrom}
      dateTo={dateTo}
    /> : null}

    {canViewFinance ? <AiReportChat
      organizationId={organizationId}
      driverId={driverId}
      vehicleId={vehicleId}
      tripStatus={tripStatus}
      dateFrom={dateFrom}
      dateTo={dateTo}
    /> : null}

    <div className={`report-summary${canViewFinance ? " report-summary-finance" : ""}`} aria-label="Ключевые показатели отчёта">
      <article><span>Рейсы</span><strong>{totals.trips}</strong><small>{matchingTrips.filter((trip) => trip.status === "ACTIVE").length} в пути · {matchingTrips.filter((trip) => trip.status === "COMPLETED").length} закрыто</small></article>
      <article><span>Общий пробег</span><strong>{formatKm(totals.totalKm)}</strong><small>{loadedShare}% с грузом · {emptyShare}% порожний</small></article>
      <article><span>Порожний пробег</span><strong>{formatKm(totals.emptyKm)}</strong><small>цель — снижать без потери выручки</small></article>
      <article><span>Средний расход</span><strong>{fuelPer100 === null ? "—" : `${fuelPer100.toFixed(1)} л`}</strong><small>на 100 км по расходам с литрами</small></article>
      {canViewFinance ? <>
        <article><span>Валовая выручка</span><strong>{formatMinor(totals.revenueMinor, baseCurrency)}</strong><small>{formatRate(perKm(totals.revenueMinor, totals.totalKm), baseCurrency)} продано</small></article>
        <article><span>Фактические затраты</span><strong>{formatMinor(totals.actualExpensesMinor, baseCurrency)}</strong><small>расходы + содержание водителей</small></article>
        <article className="report-profit"><span>Фактический результат</span><strong>{formatMinor(totals.actualProfitMinor, baseCurrency)}</strong><small>{margin === null ? "маржа —" : `маржа ${margin.toFixed(1)}%`} · до налогов</small></article>
        <article className="report-normalized-profit"><span>Нормализованный результат</span><strong>{formatMinor(totals.normalizedProfitMinor, baseCurrency)}</strong><small>{normalizedMargin === null ? "маржа —" : `маржа ${normalizedMargin.toFixed(1)}%`} · без аномалий</small></article>
        <article><span>Фактическая себестоимость</span><strong>{formatRate(perKm(totals.actualExpensesMinor, totals.totalKm), baseCurrency)}</strong><small>все затраты на общий км</small></article>
        <article><span>Нормальная себестоимость</span><strong>{formatRate(perKm(totals.normalizedExpensesMinor, totals.totalKm), baseCurrency)}</strong><small>без исключённых аномалий</small></article>
        <article><span>Прибыль на км</span><strong>{formatRate(perKm(totals.normalizedProfitMinor, totals.totalKm), baseCurrency)}</strong><small>нормализованный результат</small></article>
        <article className="report-excluded"><span>Вне нормальной себестоимости</span><strong>{formatMinor(totals.excludedExpensesMinor, baseCurrency)}</strong><small>остаются в фактическом результате</small></article>
      </> : null}
    </div>

    {canViewFinance ? <div className="report-comparison" aria-label="Сравнение факта и нормализованного результата">
      <article><span>Факт</span><b>{formatMinor(totals.actualProfitMinor, baseCurrency)}</b><small>Выручка − все расходы − оплата водителей</small></article>
      <i aria-hidden="true">→</i>
      <article className="normalized"><span>Нормальная работа</span><b>{formatMinor(totals.normalizedProfitMinor, baseCurrency)}</b><small>Факт + {formatMinor(totals.excludedExpensesMinor, baseCurrency)} разовых исключений</small></article>
    </div> : null}

    <div className="report-charts" aria-label="Сравнительные диаграммы">
      <article className="report-chart-card">
        <div className="report-chart-heading"><div><p className="eyebrow">Команда</p><h3>Пробег по водителям</h3></div><span>Топ-6</span></div>
        {driverPerformance.length ? <div className="report-bars">{driverPerformance.map((report) => <div className="report-bar-row" key={report.driverId}>
          <div><strong>{report.displayName}</strong><span>{tripCount(report.totalTrips)} · {formatKm(report.totalKm)}</span></div>
          <div className="report-bar-track" aria-hidden="true"><i style={{ width: barWidth(report.totalKm, maximumDriverKm) }} /></div>
          {canViewFinance ? <small>Факт: {formatMinor(report.managementProfitMinor, baseCurrency)}</small> : <small>С грузом: {report.totalKm ? Math.round((report.loadedKm / report.totalKm) * 100) : 0}%</small>}
        </div>)}</div> : <p className="empty-state">Нет рейсов для диаграммы.</p>}
      </article>

      <article className="report-chart-card">
        <div className="report-chart-heading"><div><p className="eyebrow">Автопарк</p><h3>Использование автомобилей</h3></div><span>Топ-6</span></div>
        {vehiclePerformance.length ? <div className="report-bars">{vehiclePerformance.map((vehicle) => <div className="report-bar-row" key={vehicle.id}>
          <div><strong>{vehicle.name}</strong><span>{tripCount(vehicle.trips)} · {vehicle.activeTrips} сейчас в пути</span></div>
          <div className="report-bar-track vehicle" aria-hidden="true"><i style={{ width: barWidth(vehicle.totalKm, maximumVehicleKm) }} /></div>
          <small>{canViewFinance ? formatRate(perKm(vehicle.profitMinor, vehicle.totalKm), baseCurrency) : formatKm(vehicle.totalKm)}</small>
        </div>)}</div> : <p className="empty-state">Нет рейсов для диаграммы.</p>}
      </article>

      {canViewFinance ? <>
        <article className="report-chart-card">
          <div className="report-chart-heading"><div><p className="eyebrow">Структура затрат</p><h3>На что ушли деньги</h3></div><span>{formatMinor(totals.directExpensesMinor, baseCurrency)}</span></div>
          {expenseStructure.length ? <div className="report-bars">{expenseStructure.map((item) => <div className="report-bar-row" key={item.group}>
            <div><strong>{groupLabels[item.group]}</strong><span>{totals.directExpensesMinor ? `${((item.amount / totals.directExpensesMinor) * 100).toFixed(1)}% расходов` : "—"}</span></div>
            <div className="report-bar-track expenses" aria-hidden="true"><i style={{ width: barWidth(item.amount, maximumExpenseGroup) }} /></div>
            <small>{formatMinor(item.amount, baseCurrency)}</small>
          </div>)}</div> : <p className="empty-state">Расходы по выбранным рейсам пока не записаны.</p>}
        </article>

        <article className="report-chart-card">
          <div className="report-chart-heading"><div><p className="eyebrow">Управленческий учёт</p><h3>Характер затрат</h3></div><span>Факт не изменяется</span></div>
          {expenseBehaviorsData.length ? <div className="report-bars">{expenseBehaviorsData.map((item) => <div className="report-bar-row" key={item.behavior}>
            <div><strong>{behaviorLabels[item.behavior]}</strong><span>{item.behavior === "ONE_OFF" || item.behavior === "CAPITAL" ? "проверьте включение в норму" : "операционные"}</span></div>
            <div className="report-bar-track behavior" aria-hidden="true"><i style={{ width: barWidth(item.amount, maximumExpenseBehavior) }} /></div>
            <small>{formatMinor(item.amount, baseCurrency)}</small>
          </div>)}</div> : <p className="empty-state">Нет классифицированных расходов.</p>}
        </article>
      </> : null}
    </div>

    <article className="panel report-table-panel">
      <div className="panel-title"><div><p className="eyebrow">Детализация</p><h2>Сводка по каждому водителю</h2></div><span>{driverCount(filteredReports.length)}</span></div>
      {filteredReports.length ? <div className="table-wrap"><table className="responsive-table driver-report-table">
        <thead><tr><th>Водитель</th><th>Автомобиль</th><th>Рейсы</th><th>Пробег</th><th>С грузом</th><th>Порожний</th>{canViewFinance ? <><th>Выручка</th><th>Себестоимость / км</th><th>Факт</th><th>Норма</th></> : null}<th>Последний рейс</th></tr></thead>
        <tbody>{filteredReports.map((report) => <tr key={report.driverId}>
          <td data-label="Водитель"><strong>{report.displayName}</strong><small>{report.status === "ACTIVE" ? "Активен" : report.status === "INVITED" ? "Приглашён" : "Неактивен"}</small></td>
          <td data-label="Автомобиль">{report.assignedVehicleName ?? "Не закреплён"}</td>
          <td data-label="Рейсы"><strong>{report.totalTrips}</strong><small>{report.activeTrips} в пути · {report.completedTrips} закрыто</small></td>
          <td data-label="Пробег">{formatKm(report.totalKm)}</td>
          <td data-label="С грузом">{formatKm(report.loadedKm)}</td>
          <td data-label="Порожний">{formatKm(report.emptyKm)}</td>
          {canViewFinance ? <><td data-label="Выручка">{formatMinor(report.revenueMinor, baseCurrency)}</td><td data-label="Себестоимость / км">{formatRate(perKm(report.normalizedExpensesMinor, report.totalKm), baseCurrency)}</td><td data-label="Факт">{formatMinor(report.managementProfitMinor, baseCurrency)}</td><td data-label="Норма">{formatMinor(report.normalizedProfitMinor, baseCurrency)}</td></> : null}
          <td data-label="Последний рейс"><DeviceDateTime value={report.latestTripAt} mode="date" fallback="Рейсов не было" /></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">По выбранным фильтрам рейсов не найдено.</p>}
    </article>
  </section>;
}
