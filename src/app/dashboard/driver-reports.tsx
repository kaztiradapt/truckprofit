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

export function DriverReports({ reports, trips, vehicles, baseCurrency, canViewFinance }: {
  reports: DriverReport[];
  trips: ReportTrip[];
  vehicles: VehicleOption[];
  baseCurrency: string;
  canViewFinance: boolean;
}) {
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const filteredReports = useMemo(() => {
    const matchingTrips = trips.filter((trip) => (!driverId || trip.driverId === driverId) && (!vehicleId || trip.vehicleId === vehicleId));
    const driversWithTrips = new Set(matchingTrips.flatMap((trip) => trip.driverId ? [trip.driverId] : []));
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    const result = reports
      .filter((report) => (!driverId || report.driverId === driverId) && (!vehicleId || driverId || driversWithTrips.has(report.driverId)))
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
  }, [driverId, reports, trips, vehicleId, vehicles]);
  const totals = filteredReports.reduce((result, report) => ({
    trips: result.trips + report.totalTrips,
    activeTrips: result.activeTrips + report.activeTrips,
    totalKm: result.totalKm + report.totalKm,
    loadedKm: result.loadedKm + report.loadedKm,
  }), { trips: 0, activeTrips: 0, totalKm: 0, loadedKm: 0 });

  return <section className="driver-reports">
    <div className="report-filters" aria-label="Фильтры отчёта">
      <label><span>Водитель</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Все водители</option>{reports.map((report) => <option key={report.driverId} value={report.driverId}>{report.displayName}</option>)}</select></label>
      <label><span>Автомобиль</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Все автомобили</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
      {driverId || vehicleId ? <button type="button" className="tiny-button" onClick={() => { setDriverId(""); setVehicleId(""); }}>Сбросить фильтры</button> : null}
    </div>
    <div className="report-summary" aria-label="Сводка по водителям">
      <article><span>Водителей</span><strong>{filteredReports.length}</strong><small>в выбранной сводке</small></article>
      <article><span>Всего рейсов</span><strong>{totals.trips}</strong><small>{totals.activeTrips} сейчас в пути</small></article>
      <article><span>Общий пробег</span><strong>{formatKm(totals.totalKm)}</strong><small>по рейсам с километражем</small></article>
      <article><span>С грузом</span><strong>{formatKm(totals.loadedKm)}</strong><small>{totals.totalKm ? `${Math.round((totals.loadedKm / totals.totalKm) * 100)}% общего пробега` : "Пока нет данных"}</small></article>
    </div>

    <article className="panel report-table-panel">
      <div className="panel-title"><div><p className="eyebrow">Эффективность команды</p><h2>Сводка по каждому водителю</h2></div><span>{filteredReports.length} водителей</span></div>
      {filteredReports.length ? <div className="table-wrap"><table className="responsive-table driver-report-table">
        <thead><tr><th>Водитель</th><th>Автомобиль</th><th>Рейсы</th><th>Пробег</th><th>С грузом</th><th>Порожний</th>{canViewFinance ? <><th>Оплата</th><th>Результат</th></> : null}<th>Последний рейс</th></tr></thead>
        <tbody>{filteredReports.map((report) => <tr key={report.driverId}>
          <td data-label="Водитель"><strong>{report.displayName}</strong><small>{report.status === "ACTIVE" ? "Активен" : report.status === "INVITED" ? "Приглашён" : "Неактивен"}</small></td>
          <td data-label="Автомобиль">{report.assignedVehicleName ?? "Не закреплён"}</td>
          <td data-label="Рейсы"><strong>{report.totalTrips}</strong><small>{report.activeTrips} активных · {report.completedTrips} закрытых</small></td>
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
