import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { completeTrip, createDriver, createIncome, createTrip, createVehicle, recalculateTripPnl, reviewExpense } from "@/app/actions/owner";
import { getDashboardData } from "@/lib/dashboard-data";
import { DriverInviteButton } from "./driver-invite-button";
import { TelegramMenuButton } from "./telegram-menu-button";

export const dynamic = "force-dynamic";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatMinor(value: number, currency: string) {
  return formatMoney(value / 100, currency);
}

function formatKm(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("ru-RU")} км`;
}

function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function statusLabel(value: string) {
  return ({ DRAFT: "Черновик", ACTIVE: "В рейсе", COMPLETED: "Закрыт", CANCELLED: "Отменён" } as Record<string, string>)[value] ?? value;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const data = await getDashboardData();
  if (data === "UNAUTHENTICATED") redirect("/login");
  if (data === "NO_ORGANIZATION") redirect("/onboarding");
  const { error, message } = await searchParams;
  const canOperate = data.role === "OWNER" || data.role === "MANAGER";
  const today = new Date().toISOString().slice(0, 10);
  const latestTrip = data.trips[0] ?? null;
  const latestPnl = latestTrip?.pnl ?? null;
  const margin = latestPnl && latestPnl.revenueMinor > 0
    ? `${((latestPnl.managementProfitMinor / latestPnl.revenueMinor) * 100).toFixed(1)}%`
    : "—";
  const emptyShare = latestPnl && latestPnl.totalKm > 0
    ? `${((latestPnl.emptyKm / latestPnl.totalKm) * 100).toFixed(1)}%`
    : data.totals.emptyMileagePct === null ? "—" : `${data.totals.emptyMileagePct}%`;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>TP</span><strong>TruckProfit</strong></div>
        <nav aria-label="Основная навигация">
          <a className="active" href="#overview">Обзор</a>
          <a href="#trips">Рейсы</a>
          <a href="#vehicles">Автомобили</a>
          <a href="#drivers">Водители</a>
          <a href="#expenses">Расходы</a>
          {canOperate ? <a href="#operations">Первичные факты</a> : null}
        </nav>
        <div className="sidebar-note">
          <span>{data.organization.name}</span>
          <small>{data.vehicles.length} авто · {data.organization.baseCurrency}</small>
          {canOperate ? <TelegramMenuButton organizationId={data.organization.id} /> : null}
          <form action={signOut}><button className="sidebar-signout" type="submit">Выйти</button></form>
        </div>
      </aside>

      <section className="content" id="overview">
        <header className="topbar">
          <div><p className="eyebrow">Экономика автопарка</p><h1>Управленческий обзор</h1></div>
          {canOperate ? <a className="primary-link" href="#operations">+ Новый рейс</a> : null}
        </header>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        <div className={data.pendingExpenses.length ? "signal signal-warning" : "signal"}>
          <div><span className="signal-dot" />{data.pendingExpenses.length ? `${data.pendingExpenses.length} расход(а) ждут проверки` : "Все расходы проверены"}</div>
          <p>{latestPnl ? "P&L последнего рейса зафиксирован" : "Данные поступают из рейсов и Telegram"}</p>
        </div>

        <section className="metrics" aria-label="Ключевые показатели">
          <article><span>Выручка</span><strong>{formatMoney(data.totals.revenue, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.revenue / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Нет закрытого пробега"}</small></article>
          <article><span>Все расходы</span><strong>{formatMoney(data.totals.expenses, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.expenses / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Только утверждённые"}</small></article>
          <article className="profit"><span>Результат</span><strong>{formatMoney(data.totals.profit, data.organization.baseCurrency)}</strong><small>{latestPnl ? `${margin} маржа последнего рейса` : "До оценочных налогов"}</small></article>
          <article><span>Порожний пробег</span><strong>{latestPnl ? formatKm(latestPnl.emptyKm) : emptyShare}</strong><small>{latestPnl ? `${emptyShare} от последнего рейса` : "Доля от общего"}</small></article>
        </section>

        <section className="trip-card" id="trips">
          {latestTrip ? <>
            <div className="trip-heading">
              <div><p className="eyebrow">Последний рейс</p><h2>{latestTrip.title}</h2><p>{latestTrip.vehicleName} · {latestTrip.driverName ?? "Водитель не назначен"} · {dateLabel(latestTrip.startedAt)}</p></div>
              <span className="status">{statusLabel(latestTrip.status)}</span>
            </div>
            <div className="trip-grid">
              <div className="route-panel">
                {latestTrip.legs.length ? latestTrip.legs.map((leg, index) => (
                  <div className={`route-line ${leg.loadState === "EMPTY" ? "empty-leg" : ""} ${index === latestTrip.legs.length - 1 ? "last" : ""}`} key={leg.id}>
                    <i />
                    <div><strong>{leg.originCity} → {leg.destinationCity}</strong><span>{leg.loadState === "EMPTY" ? "Порожний" : leg.loadState === "LOADED" ? "С грузом" : "Статус груза не указан"} · {formatKm(leg.distanceKm)}</span></div>
                  </div>
                )) : <p className="empty-state">Плечи рейса ещё не заполнены.</p>}
              </div>
              <div className="economics">
                <div><span>Общий пробег</span><strong>{latestPnl ? formatKm(latestPnl.totalKm) : formatKm(data.totals.totalKm || null)}</strong></div>
                <div><span>С грузом</span><strong>{latestPnl ? formatKm(latestPnl.loadedKm) : "—"}</strong></div>
                <div><span>Прибыль / км</span><strong>{latestPnl && latestPnl.totalKm ? `${formatMinor(Math.round(latestPnl.managementProfitMinor / latestPnl.totalKm), data.organization.baseCurrency)} / км` : "—"}</strong></div>
                <div><span>Оплата водителя</span><strong>{latestPnl ? formatMinor(latestPnl.driverCompensationMinor, data.organization.baseCurrency) : "—"}</strong></div>
              </div>
            </div>
          </> : <div className="empty-trip"><p className="eyebrow">Первый рейс</p><h2>Начните с машины и водителя</h2><p>Ниже расположен рабочий end-to-end контур из архива TruckProfit.</p></div>}
        </section>

        <section className="board-grid compact-board">
          <article className="panel panel-wide">
            <div className="panel-title"><div><p className="eyebrow">Рейсы</p><h2>Активность и P&amp;L</h2></div><span>{data.trips.length} рейс(ов)</span></div>
            {data.trips.length ? <div className="table-wrap"><table><thead><tr><th>Рейс</th><th>Машина</th><th>Водитель</th><th>Старт</th><th>Статус</th><th>P&amp;L</th></tr></thead><tbody>
              {data.trips.map((trip) => <tr key={trip.id}><td>{trip.title}</td><td>{trip.vehicleName}</td><td>{trip.driverName ?? "Не назначен"}</td><td>{dateLabel(trip.startedAt)}</td><td><span className="badge">{statusLabel(trip.status)}</span></td><td>{trip.pnl ? `${formatMinor(trip.pnl.managementProfitMinor, data.organization.baseCurrency)} · ${trip.pnl.totalKm} км` : "—"}</td></tr>)}
            </tbody></table></div> : <p className="empty-state">Пока нет рейсов.</p>}
          </article>

          <article className="panel" id="vehicles"><p className="eyebrow">Парк</p><h2>{data.vehicles.length} машин(ы)</h2>
            <ul className="entity-list">{data.vehicles.length ? data.vehicles.map((vehicle) => <li key={vehicle.id}><span>{vehicle.displayName}<small>{vehicle.plateNumber}</small></span><span className="badge">{vehicle.status}</span></li>) : <li className="empty-state">Нет добавленных машин.</li>}</ul>
          </article>

          <article className="panel" id="drivers"><p className="eyebrow">Команда</p><h2>{data.drivers.length} водителей</h2>
            <ul className="entity-list driver-list">{data.drivers.length ? data.drivers.map((driver) => <li key={driver.id}><span>{driver.displayName}<small>{driver.telegramLinked ? "Telegram подключён" : driver.pendingInviteExpiresAt ? "Приглашение подготовлено" : "Ещё не приглашён"}</small></span><span className="driver-actions"><span className={`badge ${driver.telegramLinked ? "badge-connected" : ""}`}>{driver.telegramLinked ? "Подключён" : driver.status}</span>{canOperate && !driver.telegramLinked ? <DriverInviteButton driverId={driver.id} driverName={driver.displayName} pendingInviteExpiresAt={driver.pendingInviteExpiresAt} /> : null}</span></li>) : <li className="empty-state">Нет добавленных водителей.</li>}</ul>
          </article>

          <article className="panel panel-wide" id="expenses"><div className="panel-title"><div><p className="eyebrow">Финансовый контроль</p><h2>Расходы на проверке</h2></div><span>{data.pendingExpenses.length}</span></div>
            <ul className="entity-list">{data.pendingExpenses.length ? data.pendingExpenses.map((expense) => <li key={expense.id}><span>{expense.categoryName}<small>{expense.tripTitle ?? "Без рейса"} · {dateLabel(expense.occurredAt)}{expense.comment ? ` · ${expense.comment}` : ""}</small></span><span>{formatMoney(expense.amount, expense.currency)}<span className="review-actions"><form action={reviewExpense}><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="expense_id" value={expense.id} /><input type="hidden" name="decision" value="APPROVED" /><button type="submit">Принять</button></form><form action={reviewExpense}><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="expense_id" value={expense.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="button-secondary" type="submit">Отклонить</button></form></span></span></li>) : <li className="empty-state">Новых расходов нет.</li>}</ul>
          </article>
        </section>

        {canOperate ? <section className="operations" id="operations">
          <div className="start-intro"><p className="eyebrow">End-to-end контур</p><h2>Провести настоящий рейс</h2><p>Организация уже подключена. Пройдите шаги по порядку — данные сохраняются в защищённом контуре компании.</p></div>
          <div className="workbench">
            <div className="workbench-status"><span className="ready" />Supabase, Telegram и расчётный слой подключены</div>
            <form action={createVehicle} className="flow-card grid-form"><b>1. Автомобиль</b><input type="hidden" name="organization_id" value={data.organization.id} /><input name="display_name" placeholder="DAF 001" required /><input name="plate_number" placeholder="KZ 001 DEM" required /><input name="make_model" placeholder="DAF XF" /><input name="fuel_norm" inputMode="decimal" placeholder="30.5 л/100 км" /><button type="submit">Сохранить</button></form>
            <form action={createDriver} className="flow-card"><b>2. Водитель</b><input type="hidden" name="organization_id" value={data.organization.id} /><input name="display_name" placeholder="Марат Садыков" required /><span className="flow-hint">После сохранения нажмите «Создать приглашение» в карточке водителя и отправьте его через Telegram.</span><button type="submit">Сохранить</button></form>
            <form action={createTrip} className="flow-card grid-form"><b>3. Рейс</b><input type="hidden" name="organization_id" value={data.organization.id} /><input name="title" placeholder="Алматы → Москва" required /><select name="vehicle_id" required disabled={!data.vehicles.length}><option value="">Машина</option>{data.vehicles.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.plateNumber}</option>)}</select><select name="driver_id"><option value="">Водитель позже</option>{data.drivers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><input name="origin_city" placeholder="Алматы" required /><input name="destination_city" placeholder="Москва" required /><select name="load_state" defaultValue="LOADED"><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select><input name="started_at" type="date" defaultValue={today} required /><button type="submit" disabled={!data.vehicles.length}>Создать</button></form>
            <form action={createIncome} className="flow-card"><b>4. Доход</b><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="currency" value={data.organization.baseCurrency} /><select name="trip_id" required disabled={!data.trips.length}><option value="">Рейс</option>{data.trips.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input name="customer_name" placeholder="Заказчик" /><input name="amount" inputMode="decimal" placeholder={`Сумма, ${data.organization.baseCurrency}`} required /><input name="expected_payment_at" type="date" /><input name="comment" placeholder="Комментарий" /><button type="submit" disabled={!data.trips.length}>Добавить</button></form>
            <div className="flow-card action-card"><b>5. Закрытие и P&amp;L</b><form action={completeTrip} className="inline-flow"><input type="hidden" name="organization_id" value={data.organization.id} /><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "ACTIVE")}><option value="">Активный рейс</option>{data.trips.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="submit" disabled={!data.trips.some((item) => item.status === "ACTIVE")}>Закрыть</button></form><form action={recalculateTripPnl} className="inline-flow"><input type="hidden" name="organization_id" value={data.organization.id} /><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "COMPLETED")}><option value="">Закрытый рейс</option>{data.trips.filter((item) => item.status === "COMPLETED").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="submit" disabled={!data.trips.some((item) => item.status === "COMPLETED")}>Рассчитать P&amp;L</button></form></div>
          </div>
        </section> : <section className="panel"><h2>Ваш доступ: водитель</h2><p className="muted">Операционный ввод доступен в Telegram; общая экономика скрыта.</p></section>}

        <p className="disclaimer">Management estimate: без распределения офисных расходов и будущих ремонтных резервов.</p>
      </section>
    </main>
  );
}
