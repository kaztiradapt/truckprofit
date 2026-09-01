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

function formatKm(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} км`;
}

function formatMinor(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium" }).format(new Date(value)) : "Рейсов не было";
}

export function DriverReports({ reports, baseCurrency, canViewFinance }: { reports: DriverReport[]; baseCurrency: string; canViewFinance: boolean }) {
  const totals = reports.reduce((result, report) => ({
    trips: result.trips + report.totalTrips,
    activeTrips: result.activeTrips + report.activeTrips,
    totalKm: result.totalKm + report.totalKm,
    loadedKm: result.loadedKm + report.loadedKm,
  }), { trips: 0, activeTrips: 0, totalKm: 0, loadedKm: 0 });

  return <section className="driver-reports">
    <div className="report-summary" aria-label="Сводка по водителям">
      <article><span>Водителей</span><strong>{reports.length}</strong><small>в рабочем списке</small></article>
      <article><span>Всего рейсов</span><strong>{totals.trips}</strong><small>{totals.activeTrips} сейчас в пути</small></article>
      <article><span>Общий пробег</span><strong>{formatKm(totals.totalKm)}</strong><small>по рейсам с километражем</small></article>
      <article><span>С грузом</span><strong>{formatKm(totals.loadedKm)}</strong><small>{totals.totalKm ? `${Math.round((totals.loadedKm / totals.totalKm) * 100)}% общего пробега` : "Пока нет данных"}</small></article>
    </div>

    <article className="panel report-table-panel">
      <div className="panel-title"><div><p className="eyebrow">Эффективность команды</p><h2>Сводка по каждому водителю</h2></div><span>{reports.length} водителей</span></div>
      {reports.length ? <div className="table-wrap"><table className="responsive-table driver-report-table">
        <thead><tr><th>Водитель</th><th>Автомобиль</th><th>Рейсы</th><th>Пробег</th><th>С грузом</th><th>Порожний</th>{canViewFinance ? <><th>Оплата</th><th>Результат</th></> : null}<th>Последний рейс</th></tr></thead>
        <tbody>{reports.map((report) => <tr key={report.driverId}>
          <td data-label="Водитель"><strong>{report.displayName}</strong><small>{report.status === "ACTIVE" ? "Активен" : report.status === "INVITED" ? "Приглашён" : "Неактивен"}</small></td>
          <td data-label="Автомобиль">{report.assignedVehicleName ?? "Не закреплён"}</td>
          <td data-label="Рейсы"><strong>{report.totalTrips}</strong><small>{report.activeTrips} активных · {report.completedTrips} закрытых</small></td>
          <td data-label="Пробег">{formatKm(report.totalKm)}</td>
          <td data-label="С грузом">{formatKm(report.loadedKm)}</td>
          <td data-label="Порожний">{formatKm(report.emptyKm)}</td>
          {canViewFinance ? <><td data-label="Оплата">{formatMinor(report.driverCompensationMinor, baseCurrency)}</td><td data-label="Результат">{formatMinor(report.managementProfitMinor, baseCurrency)}</td></> : null}
          <td data-label="Последний рейс">{formatDate(report.latestTripAt)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">Добавьте водителей и назначьте их на рейсы — здесь появится сводка.</p>}
    </article>
  </section>;
}
