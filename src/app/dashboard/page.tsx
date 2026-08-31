import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { createDriver, createIncome, createTrip, createVehicle } from "@/app/actions/owner";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (data === "UNAUTHENTICATED") redirect("/login");
  if (data === "NO_ORGANIZATION") redirect("/onboarding");
  const canOperate = data.role === "OWNER" || data.role === "MANAGER";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <div><p className="eyebrow">{data.organization.name}</p><h1>Экономика автопарка</h1></div>
        <form action={signOut}><button className="button-secondary" type="submit">Выйти</button></form>
      </header>

      <section className="metrics" aria-label="Ключевые показатели парка">
        <article><span>Выручка</span><strong>{formatMoney(data.totals.revenue, data.organization.baseCurrency)}</strong></article>
        <article><span>Расходы</span><strong>{formatMoney(data.totals.expenses, data.organization.baseCurrency)}</strong></article>
        <article><span>Операционная прибыль</span><strong>{formatMoney(data.totals.profit, data.organization.baseCurrency)}</strong></article>
        <article><span>Порожний пробег</span><strong>{data.totals.emptyMileagePct === null ? "—" : `${data.totals.emptyMileagePct}%`}</strong></article>
      </section>

      <section className="board-grid">
        <article className="panel panel-wide">
          <div className="panel-title"><div><p className="eyebrow">Рейсы</p><h2>Активность и P&L</h2></div><span>{data.trips.length} рейс(ов)</span></div>
          {data.trips.length ? (
            <div className="table-wrap"><table><thead><tr><th>Рейс</th><th>Машина</th><th>Водитель</th><th>Старт</th><th>Статус</th></tr></thead><tbody>
              {data.trips.map((trip) => <tr key={trip.id}><td>{trip.title}</td><td>{trip.vehicleName}</td><td>{trip.driverName ?? "Не назначен"}</td><td>{dateLabel(trip.startedAt)}</td><td><span className="badge">{trip.status}</span></td></tr>)}
            </tbody></table></div>
          ) : <p className="empty-state">Пока нет рейсов. Добавьте машину, водителя и первый рейс ниже.</p>}
        </article>

        <article className="panel"><p className="eyebrow">Парк</p><h2>{data.vehicles.length} машин(ы)</h2>
          <ul className="entity-list">{data.vehicles.length ? data.vehicles.map((vehicle) => <li key={vehicle.id}><span>{vehicle.displayName}<small>{vehicle.plateNumber}</small></span><span className="badge">{vehicle.status}</span></li>) : <li className="empty-state">Нет добавленных машин.</li>}</ul>
        </article>
        <article className="panel"><p className="eyebrow">Команда</p><h2>{data.drivers.length} водителей</h2>
          <ul className="entity-list">{data.drivers.length ? data.drivers.map((driver) => <li key={driver.id}><span>{driver.displayName}</span><span className="badge">{driver.status}</span></li>) : <li className="empty-state">Нет добавленных водителей.</li>}</ul>
        </article>
      </section>

      {canOperate ? <section className="operations"><div><p className="eyebrow">Операционный ввод</p><h2>Первичные факты</h2><p className="muted">Каждая форма проходит авторизацию на сервере. Доход и рейс дополнительно попадают в audit-log.</p></div>
        <div className="forms-grid">
          <form action={createVehicle} className="panel stack-form"><h3>1. Машина</h3><input type="hidden" name="organization_id" value={data.organization.id} /><label>Название<input name="display_name" placeholder="DAF 001" required /></label><label>Госномер<input name="plate_number" placeholder="KZ 001 DEM" required /></label><label>Марка/модель<input name="make_model" placeholder="DAF XF" /></label><label>Норма л/100 км<input name="fuel_norm" inputMode="decimal" placeholder="30.5" /></label><button type="submit">Добавить машину</button></form>
          <form action={createDriver} className="panel stack-form"><h3>2. Водитель</h3><input type="hidden" name="organization_id" value={data.organization.id} /><label>ФИО / позывной<input name="display_name" placeholder="Иванов И.И." required /></label><p className="muted">Telegram привязывается отдельно одноразовым приглашением.</p><button type="submit">Добавить водителя</button></form>
          <form action={createTrip} className="panel stack-form"><h3>3. Рейс и первое плечо</h3><input type="hidden" name="organization_id" value={data.organization.id} /><label>Название рейса<input name="title" placeholder="Алматы → Москва" required /></label><label>Машина<select name="vehicle_id" required disabled={!data.vehicles.length}><option value="">Выберите машину</option>{data.vehicles.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.plateNumber}</option>)}</select></label><label>Водитель<select name="driver_id"><option value="">Назначить позже</option>{data.drivers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><div className="split-fields"><label>Откуда<input name="origin_city" placeholder="Алматы" required /></label><label>Куда<input name="destination_city" placeholder="Москва" required /></label></div><label>Тип плеча<select name="load_state" defaultValue="LOADED"><option value="LOADED">Гружёный</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label><label>Дата старта<input name="started_at" type="date" defaultValue={today} required /></label><button type="submit" disabled={!data.vehicles.length}>Создать активный рейс</button></form>
          <form action={createIncome} className="panel stack-form"><h3>4. Доход рейса</h3><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="currency" value={data.organization.baseCurrency} /><label>Рейс<select name="trip_id" required disabled={!data.trips.length}><option value="">Выберите рейс</option>{data.trips.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Клиент<input name="customer_name" placeholder="ТОО Клиент" /></label><label>Сумма, {data.organization.baseCurrency}<input name="amount" inputMode="decimal" placeholder="1000000" required /></label><label>Ожидаемая оплата<input name="expected_payment_at" type="date" /></label><label>Комментарий<input name="comment" placeholder="Ставка по заявке" /></label><button type="submit" disabled={!data.trips.length}>Добавить доход</button></form>
        </div>
      </section> : <section className="panel"><h2>Ваш доступ: водитель</h2><p className="muted">Операционный ввод доступен в Telegram; web-кабинет собственника скрывает общую экономику.</p></section>}
    </main>
  );
}
