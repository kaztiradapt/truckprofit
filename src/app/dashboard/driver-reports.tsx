"use client";

import { useMemo, useState } from "react";
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
  driverId: string | null;
  vehicleId: string;
  vehicleName: string;
  status: string;
  startedAt: string | null;
  totalKm: number;
  loadedKm: number;
  emptyKm: number;
  revenueMinor: number;
  totalExpensesMinor: number;
  driverCompensationMinor: number;
  managementProfitMinor: number;
};
type VehicleOption = { id: string; displayName: string; plateNumber: string };

function formatKm(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} км`;
}

function formatMinor(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
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

export function DriverReports({ reports, trips, vehicles, baseCurrency, canViewFinance }: {
  reports: DriverReport[];
  trips: ReportTrip[];
  vehicles: VehicleOption[];
  baseCurrency: string;
  canViewFinance: boolean;
}) {
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [tripStatus, setTripStatus] = useState("");

  const matchingTrips = useMemo(() => trips.filter((trip) =>
    (!driverId || trip.driverId === driverId)
    && (!vehicleId || trip.vehicleId === vehicleId)
    && (!tripStatus || trip.status === tripStatus)), [driverId, tripStatus, trips, vehicleId]);

  const filteredReports = useMemo(() => {
    const driversWithTrips = new Set(matchingTrips.flatMap((trip) => trip.driverId ? [trip.driverId] : []));
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    const restrictToMatchingTrips = Boolean(vehicleId || tripStatus);
    const result = reports
      .filter((report) => (!driverId || report.driverId === driverId) && (!restrictToMatchingTrips || driversWithTrips.has(report.driverId)))
      .map((report) => ({
        ...report,
        assignedVehicleName: selectedVehicle ? `${selectedVehicle.displayName} · ${selectedVehicle.plateNumber}` : report.assignedVehicleName,
        totalTrips: 0,
        activeTrips: 0,
        completedTrips: 0,
        totalKm: 0,
        loadedKm: 0,
        emptyKm: 0,
        driverCompensationMinor: 0,
        managementProfitMinor: 0,
        latestTripAt: null as string | null,
      }));
    const byDriver = new Map(result.map((report) => [report.driverId, report]));
    for (const trip of matchingTrips) {
      if (!trip.driverId) continue;
      const report = byDriver.get(trip.driverId);
      if (!report) continue;
      report.totalTrips += 1;
      if (trip.status === "ACTIVE") report.activeTrips += 1;
      if (trip.status === "COMPLETED") report.completedTrips += 1;
      report.totalKm += trip.totalKm;
      report.loadedKm += trip.loadedKm;
      report.emptyKm += trip.emptyKm;
      report.driverCompensationMinor += trip.driverCompensationMinor;
      report.managementProfitMinor += trip.managementProfitMinor;
      if (trip.startedAt && (!report.latestTripAt || trip.startedAt > report.latestTripAt)) report.latestTripAt = trip.startedAt;
    }
    return result;
  }, [driverId, matchingTrips, reports, tripStatus, vehicleId, vehicles]);

  const totals = useMemo(() => matchingTrips.reduce((result, trip) => ({
    trips: result.trips + 1,
    activeTrips: result.activeTrips + (trip.status === "ACTIVE" ? 1 : 0),
    completedTrips: result.completedTrips + (trip.status === "COMPLETED" ? 1 : 0),
    totalKm: result.totalKm + trip.totalKm,
    loadedKm: result.loadedKm + trip.loadedKm,
    revenueMinor: result.revenueMinor + trip.revenueMinor,
    totalExpensesMinor: result.totalExpensesMinor + trip.totalExpensesMinor,
    managementProfitMinor: result.managementProfitMinor + trip.managementProfitMinor,
  }), {
    trips: 0,
    activeTrips: 0,
    completedTrips: 0,
    totalKm: 0,
    loadedKm: 0,
    revenueMinor: 0,
    totalExpensesMinor: 0,
    managementProfitMinor: 0,
  }), [matchingTrips]);

  const driverPerformance = useMemo(() => filteredReports
    .filter((report) => report.totalTrips > 0)
    .sort((left, right) => right.totalKm - left.totalKm)
    .slice(0, 6), [filteredReports]);
  const maximumDriverKm = Math.max(0, ...driverPerformance.map((report) => report.totalKm));

  const vehiclePerformance = useMemo(() => {
    const byVehicle = new Map(vehicles.map((vehicle) => [vehicle.id, {
      id: vehicle.id,
      name: `${vehicle.displayName} · ${vehicle.plateNumber}`,
      trips: 0,
      activeTrips: 0,
      totalKm: 0,
    }]));
    for (const trip of matchingTrips) {
      const current = byVehicle.get(trip.vehicleId) ?? { id: trip.vehicleId, name: trip.vehicleName, trips: 0, activeTrips: 0, totalKm: 0 };
      current.trips += 1;
      current.activeTrips += trip.status === "ACTIVE" ? 1 : 0;
      current.totalKm += trip.totalKm;
      byVehicle.set(trip.vehicleId, current);
    }
    return [...byVehicle.values()].filter((vehicle) => vehicle.trips > 0).sort((left, right) => right.totalKm - left.totalKm).slice(0, 6);
  }, [matchingTrips, vehicles]);
  const maximumVehicleKm = Math.max(0, ...vehiclePerformance.map((vehicle) => vehicle.totalKm));
  const loadedShare = totals.totalKm ? Math.round((totals.loadedKm / totals.totalKm) * 100) : 0;
  const margin = totals.revenueMinor ? (totals.managementProfitMinor / totals.revenueMinor) * 100 : null;
  const filtersApplied = Boolean(driverId || vehicleId || tripStatus);

  return <section className="driver-reports">
    <div className="report-dashboard-intro">
      <div><p className="eyebrow">Дэшборд эффективности</p><h2>Водители и автомобили</h2><p>Показатели, сравнение и детализация меняются вместе с фильтрами.</p></div>
      <span>{tripCount(matchingTrips.length)} в выборке</span>
    </div>

    <div className="report-filters" aria-label="Фильтры отчёта">
      <label><span>Водитель</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Все водители</option>{reports.map((report) => <option key={report.driverId} value={report.driverId}>{report.displayName}</option>)}</select></label>
      <label><span>Автомобиль</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Все автомобили</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
      <label><span>Статус рейса</span><select value={tripStatus} onChange={(event) => setTripStatus(event.target.value)}><option value="">Все статусы</option><option value="ACTIVE">В рейсе</option><option value="COMPLETED">Закрыт</option><option value="DRAFT">Черновик</option><option value="CANCELLED">Отменён</option></select></label>
      {filtersApplied ? <button type="button" className="tiny-button" onClick={() => { setDriverId(""); setVehicleId(""); setTripStatus(""); }}>Сбросить фильтры</button> : null}
    </div>

    <div className={`report-summary${canViewFinance ? " report-summary-finance" : ""}`} aria-label="Ключевые показатели отчёта">
      <article><span>Водителей</span><strong>{filteredReports.length}</strong><small>в выбранной сводке</small></article>
      <article><span>Всего рейсов</span><strong>{totals.trips}</strong><small>{totals.activeTrips} в пути · {totals.completedTrips} закрыто</small></article>
      <article><span>Общий пробег</span><strong>{formatKm(totals.totalKm)}</strong><small>по рейсам с километражем</small></article>
      <article><span>Пробег с грузом</span><strong>{loadedShare}%</strong><small>{formatKm(totals.loadedKm)} от общего</small></article>
      {canViewFinance ? <>
        <article><span>Доход</span><strong>{formatMinor(totals.revenueMinor, baseCurrency)}</strong><small>по рассчитанным рейсам</small></article>
        <article><span>Все расходы</span><strong>{formatMinor(totals.totalExpensesMinor, baseCurrency)}</strong><small>включая оплату водителей</small></article>
        <article className="report-profit"><span>Результат</span><strong>{formatMinor(totals.managementProfitMinor, baseCurrency)}</strong><small>до оценочных налогов</small></article>
        <article><span>Маржа</span><strong>{margin === null ? "—" : `${margin.toFixed(1)}%`}</strong><small>результат / доход</small></article>
      </> : null}
    </div>

    <div className="report-charts" aria-label="Сравнительные диаграммы">
      <article className="report-chart-card">
        <div className="report-chart-heading"><div><p className="eyebrow">Команда</p><h3>Пробег по водителям</h3></div><span>Топ-6</span></div>
        {driverPerformance.length ? <div className="report-bars">{driverPerformance.map((report) => <div className="report-bar-row" key={report.driverId}>
          <div><strong>{report.displayName}</strong><span>{tripCount(report.totalTrips)} · {formatKm(report.totalKm)}</span></div>
          <div className="report-bar-track" aria-hidden="true"><i style={{ width: barWidth(report.totalKm, maximumDriverKm) }} /></div>
          {canViewFinance ? <small>Результат: {formatMinor(report.managementProfitMinor, baseCurrency)}</small> : <small>С грузом: {report.totalKm ? Math.round((report.loadedKm / report.totalKm) * 100) : 0}%</small>}
        </div>)}</div> : <p className="empty-state">Нет рейсов для диаграммы.</p>}
      </article>

      <article className="report-chart-card">
        <div className="report-chart-heading"><div><p className="eyebrow">Автопарк</p><h3>Использование автомобилей</h3></div><span>Топ-6</span></div>
        {vehiclePerformance.length ? <div className="report-bars">{vehiclePerformance.map((vehicle) => <div className="report-bar-row" key={vehicle.id}>
          <div><strong>{vehicle.name}</strong><span>{tripCount(vehicle.trips)} · {vehicle.activeTrips} сейчас в пути</span></div>
          <div className="report-bar-track vehicle" aria-hidden="true"><i style={{ width: barWidth(vehicle.totalKm, maximumVehicleKm) }} /></div>
          <small>{formatKm(vehicle.totalKm)}</small>
        </div>)}</div> : <p className="empty-state">Нет рейсов для диаграммы.</p>}
      </article>
    </div>

    <article className="panel report-table-panel">
      <div className="panel-title"><div><p className="eyebrow">Детализация</p><h2>Сводка по каждому водителю</h2></div><span>{driverCount(filteredReports.length)}</span></div>
      {filteredReports.length ? <div className="table-wrap"><table className="responsive-table driver-report-table">
        <thead><tr><th>Водитель</th><th>Автомобиль</th><th>Рейсы</th><th>Пробег</th><th>С грузом</th><th>Порожний</th>{canViewFinance ? <><th>Оплата</th><th>Результат</th></> : null}<th>Последний рейс</th></tr></thead>
        <tbody>{filteredReports.map((report) => <tr key={report.driverId}>
          <td data-label="Водитель"><strong>{report.displayName}</strong><small>{report.status === "ACTIVE" ? "Активен" : report.status === "INVITED" ? "Приглашён" : "Неактивен"}</small></td>
          <td data-label="Автомобиль">{report.assignedVehicleName ?? "Не закреплён"}</td>
          <td data-label="Рейсы"><strong>{report.totalTrips}</strong><small>{report.activeTrips} {plural(report.activeTrips, ["активный", "активных", "активных"])} · {report.completedTrips} {plural(report.completedTrips, ["закрытый", "закрытых", "закрытых"])}</small></td>
          <td data-label="Пробег">{formatKm(report.totalKm)}</td>
          <td data-label="С грузом">{formatKm(report.loadedKm)}</td>
          <td data-label="Порожний">{formatKm(report.emptyKm)}</td>
          {canViewFinance ? <><td data-label="Оплата">{formatMinor(report.driverCompensationMinor, baseCurrency)}</td><td data-label="Результат">{formatMinor(report.managementProfitMinor, baseCurrency)}</td></> : null}
          <td data-label="Последний рейс"><DeviceDateTime value={report.latestTripAt} mode="date" fallback="Рейсов не было" /></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">По выбранным фильтрам рейсов не найдено.</p>}
    </article>
  </section>;
}
