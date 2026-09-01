import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { completeTrip, createDriver, createVehicle, enableOwnerDriverMode, recalculateTripPnl, reviewExpense } from "@/app/actions/owner";
import { getDashboardData } from "@/lib/dashboard-data";
import { DriverInviteButton } from "./driver-invite-button";
import { IncomeForm } from "./income-form";
import { OwnerTelegramConnectButton } from "./owner-telegram-connect-button";
import { RecordManagement } from "./record-management";
import { TelegramMenuButton } from "./telegram-menu-button";
import { TeamManagement } from "./team-management";
import { TripCreateForm } from "./trip-create-form";

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

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function openStreetMapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`;
}

function statusLabel(value: string) {
  return ({ DRAFT: "Черновик", ACTIVE: "В рейсе", COMPLETED: "Закрыт", CANCELLED: "Отменён" } as Record<string, string>)[value] ?? value;
}

const sectionTitles: Record<DashboardSection, string> = {
  overview: "Управленческий обзор",
  trips: "Рейсы и маршруты",
  vehicles: "Автомобили",
  drivers: "Водители",
  expenses: "Расходы",
  team: "Сотрудники и роли",
  operations: "Создание и закрытие рейса",
  records: "Редактирование данных",
  help: "Инструкции и ЧАВО",
};

export const dashboardSections = ["overview", "trips", "vehicles", "drivers", "expenses", "team", "operations", "records", "help"] as const;
export type DashboardSection = (typeof dashboardSections)[number];

export async function DashboardScreen({ section, searchParams }: { section: DashboardSection; searchParams: Promise<{ error?: string; message?: string }> }) {
  const data = await getDashboardData();
  if (data === "UNAUTHENTICATED") redirect("/login");
  if (data === "NO_ORGANIZATION") redirect("/onboarding");
  const { error, message } = await searchParams;
  const canManageVehicles = data.permissions.includes("MANAGE_VEHICLES");
  const canManageDrivers = data.permissions.includes("MANAGE_DRIVERS");
  const canManageTrips = data.permissions.includes("MANAGE_TRIPS");
  const canManageFinance = data.permissions.includes("MANAGE_FINANCE");
  const canReviewExpenses = data.permissions.includes("REVIEW_EXPENSES");
  const canViewFinance = data.permissions.includes("VIEW_FINANCE");
  const canDelete = data.permissions.includes("DELETE_RECORDS");
  const canOperate = canManageVehicles || canManageDrivers || canManageTrips || canManageFinance || canReviewExpenses;
  const ownerDriver = data.drivers.find((driver) => driver.isOwnerDriver) ?? null;
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
          <Link className={section === "overview" ? "active" : ""} href="/dashboard">Обзор</Link>
          <Link className={section === "trips" ? "active" : ""} href="/dashboard/trips">Рейсы</Link>
          <Link className={section === "vehicles" ? "active" : ""} href="/dashboard/vehicles">Автомобили</Link>
          <Link className={section === "drivers" ? "active" : ""} href="/dashboard/drivers">Водители</Link>
          {canViewFinance || canReviewExpenses ? <Link className={section === "expenses" ? "active" : ""} href="/dashboard/expenses">Расходы</Link> : null}
          {data.role === "OWNER" ? <Link className={section === "team" ? "active" : ""} href="/dashboard/team">Сотрудники</Link> : null}
          {canOperate ? <Link className={section === "operations" ? "active" : ""} href="/dashboard/operations">Создание рейса</Link> : null}
          {canManageVehicles || canManageDrivers || canManageTrips ? <Link className={section === "records" ? "active" : ""} href="/dashboard/records">Редактирование</Link> : null}
          <Link className={section === "help" ? "active" : ""} href="/dashboard/help">Инструкция</Link>
        </nav>
        <div className="sidebar-note">
          <span>{data.organization.name}</span>
          <small>{data.vehicles.length} авто · {data.organization.baseCurrency}</small>
          {data.role === "OWNER" ? <TelegramMenuButton organizationId={data.organization.id} /> : null}
          <form action={signOut}><button className="sidebar-signout" type="submit">Выйти</button></form>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">Экономика автопарка</p><h1>{sectionTitles[section]}</h1></div>
          {canManageTrips && section !== "operations" ? <Link className="primary-link" href="/dashboard/operations">+ Новый рейс</Link> : null}
        </header>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        {section === "overview" && data.role === "OWNER" ? <section className="owner-telegram-card" aria-label="Telegram владельца">
          <span><b>Кабинет владельца в Telegram</b><small>Сводка, рейсы, водители, расходы и быстрый переход в Mini App.</small></span>
          <OwnerTelegramConnectButton organizationId={data.organization.id} linked={data.ownerTelegramLinked} />
        </section> : null}

        {section === "overview" && (canViewFinance || canReviewExpenses) ? <div className={data.pendingExpenses.length ? "signal signal-warning" : "signal"}>
          <div><span className="signal-dot" />{data.pendingExpenses.length ? `${data.pendingExpenses.length} расход(а) ждут проверки` : "Все расходы проверены"}</div>
          <p>{latestPnl ? "P&L последнего рейса зафиксирован" : "Данные поступают из рейсов и Telegram"}</p>
        </div> : section === "overview" ? <div className="signal"><div><span className="signal-dot" />Роль: {data.accessRoleName}</div><p>Финансовые показатели скрыты настройками доступа</p></div> : null}

        {section === "overview" && canViewFinance ? <section className="metrics" aria-label="Ключевые показатели">
          <article><span>Выручка</span><strong>{formatMoney(data.totals.revenue, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.revenue / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Нет закрытого пробега"}</small></article>
          <article><span>Все расходы</span><strong>{formatMoney(data.totals.expenses, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.expenses / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Только утверждённые"}</small></article>
          <article className="profit"><span>Результат</span><strong>{formatMoney(data.totals.profit, data.organization.baseCurrency)}</strong><small>{latestPnl ? `${margin} маржа последнего рейса` : "До оценочных налогов"}</small></article>
          <article><span>Порожний пробег</span><strong>{latestPnl ? formatKm(latestPnl.emptyKm) : emptyShare}</strong><small>{latestPnl ? `${emptyShare} от последнего рейса` : "Доля от общего"}</small></article>
        </section> : null}

        {section === "overview" || section === "trips" ? <section className="trip-card">
          {latestTrip ? <>
            <div className="trip-heading">
              <div><p className="eyebrow">Последний рейс</p><h2>{latestTrip.title}</h2><p>{latestTrip.vehicleName} · {latestTrip.driverName ?? "Водитель не назначен"} · {dateLabel(latestTrip.startedAt)}</p></div>
              <span className="status">{statusLabel(latestTrip.status)}</span>
            </div>
            {latestTrip.lastLocation ? <div className="trip-location">
              <span><b>📍 Последняя геопозиция</b><small>{dateTimeLabel(latestTrip.lastLocation.recordedAt)} · {latestTrip.lastLocation.horizontalAccuracyM === null ? "точность не указана" : `точность около ${Math.round(latestTrip.lastLocation.horizontalAccuracyM)} м`}</small></span>
              <a href={openStreetMapUrl(latestTrip.lastLocation.latitude, latestTrip.lastLocation.longitude)} target="_blank" rel="noreferrer">Открыть на карте</a>
            </div> : null}
            <div className="trip-grid">
              <div className="route-panel">
                {latestTrip.legs.length ? latestTrip.legs.map((leg, index) => (
                  <div className={`route-line ${leg.loadState === "EMPTY" ? "empty-leg" : ""} ${index === latestTrip.legs.length - 1 ? "last" : ""}`} key={leg.id}>
                    <i />
                    <div><strong>{leg.originCity} → {leg.destinationCity}</strong><span>{leg.loadState === "EMPTY" ? "Порожний" : leg.loadState === "LOADED" ? "С грузом" : "Статус груза не указан"} · {formatKm(leg.distanceKm)}</span>{index === 0 ? <small>Погрузка: {latestTrip.originAddress}<br />Выгрузка: {latestTrip.destinationAddress}</small> : null}</div>
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
        </section> : null}

        {["trips", "vehicles", "drivers", "expenses"].includes(section) ? <section className="board-grid compact-board section-board">
          {section === "trips" ? <article className="panel panel-wide">
            <div className="panel-title"><div><p className="eyebrow">Рейсы</p><h2>Активность и P&amp;L</h2></div><span>{data.trips.length} рейс(ов)</span></div>
            {data.trips.length ? <div className="table-wrap"><table><thead><tr><th>Рейс</th><th>Машина</th><th>Водитель</th><th>Старт</th><th>Статус</th><th>P&amp;L</th></tr></thead><tbody>
              {data.trips.map((trip) => <tr key={trip.id}><td>{trip.title}</td><td>{trip.vehicleName}</td><td>{trip.driverName ?? "Не назначен"}</td><td>{dateLabel(trip.startedAt)}</td><td><span className="badge">{statusLabel(trip.status)}</span></td><td>{trip.pnl ? `${formatMinor(trip.pnl.managementProfitMinor, data.organization.baseCurrency)} · ${trip.pnl.totalKm} км` : "—"}</td></tr>)}
            </tbody></table></div> : <p className="empty-state">Пока нет рейсов.</p>}
          </article> : null}

          {section === "vehicles" ? <article className="panel panel-wide"><p className="eyebrow">Парк</p><h2>{data.vehicles.length} машин(ы)</h2>
            <ul className="entity-list">{data.vehicles.length ? data.vehicles.map((vehicle) => <li key={vehicle.id}><span>{vehicle.displayName}<small>{vehicle.plateNumber}</small></span><span className="badge">{vehicle.status}</span></li>) : <li className="empty-state">Нет добавленных машин.</li>}</ul>
          </article> : null}

          {section === "drivers" ? <article className="panel panel-wide">
            <div className="panel-title"><div><p className="eyebrow">Команда</p><h2>Водители</h2></div><span>{data.drivers.length} в списке</span></div>
            {canManageDrivers ? <form action={createDriver} className="team-driver-form"><input type="hidden" name="organization_id" value={data.organization.id} /><label htmlFor="team-driver-name">Новый водитель</label><div><input id="team-driver-name" name="display_name" placeholder="Имя и фамилия" required /><button type="submit">+ Добавить</button></div><small>После добавления сразу появится кнопка приглашения в Telegram.</small></form> : null}
            <div className="team-list-heading"><b>Список водителей</b><span>{data.drivers.length ? "Статус и подключение Telegram" : "Список пока пуст"}</span></div>
            <ul className="entity-list driver-list">{data.drivers.length ? data.drivers.map((driver) => <li key={driver.id}><span>{driver.displayName}{driver.isOwnerDriver ? <span className="owner-driver-mark">Вы</span> : null}<small>{driver.isOwnerDriver ? driver.telegramLinked ? "Ваш профиль · Telegram подключён" : "Ваш профиль владельца-водителя" : driver.telegramLinked ? "Telegram подключён" : driver.pendingInviteExpiresAt ? "Приглашение подготовлено" : "Ещё не приглашён"}</small></span><span className="driver-actions"><span className={`badge ${driver.telegramLinked ? "badge-connected" : ""}`}>{driver.telegramLinked ? "Подключён" : driver.status}</span>{canManageDrivers && !driver.telegramLinked ? <DriverInviteButton driverId={driver.id} driverName={driver.displayName} pendingInviteExpiresAt={driver.pendingInviteExpiresAt} selfService={driver.isOwnerDriver} /> : null}</span></li>) : <li className="empty-state">Добавьте первого водителя формой выше.</li>}</ul>
            {data.role === "OWNER" && !ownerDriver ? <form action={enableOwnerDriverMode} className="self-driver-cta"><input type="hidden" name="organization_id" value={data.organization.id} /><span><b>Вы сами за рулём?</b><small>Это дополнительный вариант — создадим отдельный водительский режим для вашего профиля.</small></span><button type="submit" className="tiny-button">Я владелец-водитель</button></form> : null}
          </article> : null}

          {section === "expenses" && (canViewFinance || canReviewExpenses) ? <article className="panel panel-wide"><div className="panel-title"><div><p className="eyebrow">Финансовый контроль</p><h2>Расходы на проверке</h2></div><span>{data.pendingExpenses.length}</span></div>
            <ul className="entity-list">{data.pendingExpenses.length ? data.pendingExpenses.map((expense) => <li key={expense.id}><span>{expense.categoryName}<small>{expense.tripTitle ?? "Без рейса"} · {dateLabel(expense.occurredAt)}{expense.comment ? ` · ${expense.comment}` : ""}</small></span><span>{formatMoney(expense.amount, expense.currency)}{canReviewExpenses ? <span className="review-actions"><form action={reviewExpense}><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="expense_id" value={expense.id} /><input type="hidden" name="decision" value="APPROVED" /><button type="submit">Принять</button></form><form action={reviewExpense}><input type="hidden" name="organization_id" value={data.organization.id} /><input type="hidden" name="expense_id" value={expense.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="button-secondary" type="submit">Отклонить</button></form></span> : null}</span></li>) : <li className="empty-state">Новых расходов нет.</li>}</ul>
          </article> : section === "expenses" ? <article className="panel panel-wide"><h2>Доступ ограничен</h2><p className="muted">Владелец не выдал этой роли доступ к финансовым данным.</p></article> : null}
        </section> : null}

        {section === "team" && data.role === "OWNER" ? <TeamManagement organizationId={data.organization.id} roles={data.accessRoles} staff={data.staff} /> : section === "team" ? <section className="panel"><h2>Доступ ограничен</h2><p className="muted">Управление сотрудниками доступно только владельцу.</p></section> : null}

        {section === "operations" && canOperate ? <section className="operations">
          <div className="start-intro"><p className="eyebrow">End-to-end контур</p><h2>Провести настоящий рейс</h2><p>Организация уже подключена. Пройдите шаги по порядку — данные сохраняются в защищённом контуре компании.</p></div>
          <div className="workbench">
            <div className="workbench-status"><span className="ready" />Supabase, Telegram и расчётный слой подключены</div>
            {canManageVehicles ? <form action={createVehicle} className="flow-card">
              <div className="flow-card-heading"><span className="flow-step">1</span><span><b>Автомобиль</b><small>Добавьте машину в парк</small></span></div>
              <input type="hidden" name="organization_id" value={data.organization.id} />
              <div className="flow-fields vehicle-fields">
                <label className="flow-field"><span>Название</span><input name="display_name" placeholder="Например: DAF 001" required /></label>
                <label className="flow-field"><span>Госномер</span><input name="plate_number" placeholder="Например: KZ 001 DEM" required /></label>
                <label className="flow-field"><span>Марка и модель</span><input name="make_model" placeholder="Например: DAF XF" /></label>
                <label className="flow-field"><span>Норма топлива</span><input name="fuel_norm" inputMode="decimal" placeholder="30.5 л/100 км" /></label>
              </div>
              <div className="flow-card-action"><button type="submit">Сохранить</button></div>
            </form> : null}
            {canManageTrips ? <TripCreateForm organizationId={data.organization.id} vehicles={data.vehicles} drivers={data.drivers} today={today} /> : null}
            {canManageFinance ? <IncomeForm organizationId={data.organization.id} baseCurrency={data.organization.baseCurrency} trips={data.trips.map(({ id, title }) => ({ id, title }))} /> : null}
            {canManageTrips || canManageFinance ? <div className="flow-card flow-card-closing">
              <div className="flow-card-heading"><span className="flow-step">4</span><span><b>Закрытие и P&amp;L</b><small>Завершите рейс и рассчитайте итог</small></span></div>
              <div className="closing-actions">
                {canManageTrips ? <form action={completeTrip} className="closing-action"><input type="hidden" name="organization_id" value={data.organization.id} /><label className="flow-field"><span>Завершить рейс</span><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "ACTIVE")}><option value="">Выберите активный рейс</option>{data.trips.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="submit" disabled={!data.trips.some((item) => item.status === "ACTIVE")}>Закрыть</button></form> : null}
                {canManageFinance ? <form action={recalculateTripPnl} className="closing-action"><input type="hidden" name="organization_id" value={data.organization.id} /><label className="flow-field"><span>Рассчитать результат</span><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "COMPLETED")}><option value="">Выберите закрытый рейс</option>{data.trips.filter((item) => item.status === "COMPLETED").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="submit" disabled={!data.trips.some((item) => item.status === "COMPLETED")}>Рассчитать P&amp;L</button></form> : null}
              </div>
            </div> : null}
          </div>
        </section> : section === "operations" ? <section className="panel"><h2>Ваш доступ: {data.accessRoleName}</h2><p className="muted">Редактирование ограничено владельцем. Доступные данные остаются в режиме просмотра.</p></section> : null}

        {section === "records" && (canManageVehicles || canManageDrivers || canManageTrips) ? <RecordManagement
          organizationId={data.organization.id}
          vehicles={data.vehicles}
          drivers={data.drivers}
          trips={data.trips}
          canManageVehicles={canManageVehicles}
          canManageDrivers={canManageDrivers}
          canManageTrips={canManageTrips}
          canDelete={canDelete}
        /> : section === "records" ? <section className="panel"><h2>Доступ ограничен</h2><p className="muted">Владелец не выдал этой роли права редактирования.</p></section> : null}

        {section === "help" ? <section className="help-section">
          <div className="start-intro"><p className="eyebrow">ЧАВО и инструкции</p><h2>Как пользоваться TruckProfit</h2><p>Короткие сценарии для ежедневной работы. В Telegram та же справка открывается кнопкой «❓ Помощь» или командой /help.</p></div>
          <div className="help-grid">
            <article className="panel"><h3>Владельцу</h3><ol><li>Добавьте автомобиль и водителя.</li><li>Создайте рейс, укажите маршрут и доход.</li><li>Подключите свой Telegram кнопкой выше.</li><li>Проверяйте расходы водителей и закрывайте рейс.</li><li>После закрытия рассчитайте P&amp;L.</li></ol></article>
            <article className="panel"><h3>Водителю</h3><ol><li>Откройте персональную ссылку владельца и нажмите START.</li><li>В «Мой рейс» проверьте адреса погрузки и выгрузки.</li><li>Там же одной кнопкой отмечайте ожидание, погрузку, путь и выгрузку.</li><li>Геопозиция передаётся только после вашего нажатия и разрешения Telegram.</li><li>После расхода отправьте фото чека; оплату смотрите в «Моя зарплата».</li></ol></article>
            <article className="panel"><h3>Mini App</h3><ol><li>Откройте «Открыть кабинет» возле поля ввода в Telegram.</li><li>При первом запуске войдите тем же email владельца.</li><li>Каждый раздел открывается на отдельной странице из верхнего или бокового меню.</li><li>Все данные синхронизируются с ботом автоматически.</li><li>Для сложных операций используйте кабинет, для быстрых — меню бота.</li></ol></article>
          </div>
          <div className="faq-list">
            <details><summary>Почему бот не видит мой профиль?</summary><p>Telegram ещё не привязан или открыта чужая/просроченная ссылка. Создайте новую ссылку в карточке владельца или водителя и нажмите START именно в нужном аккаунте Telegram.</p></details>
            <details><summary>Можно ли владельцу самому быть водителем?</summary><p>Да. Нажмите «Я владелец-водитель» в разделе команды. Один Telegram получит два режима, между ними можно переключаться в меню бота.</p></details>
            <details><summary>Что делать, если ошибся в расходе?</summary><p>Не создавайте дубликат. Владелец может отклонить расход на проверке; затем водитель внесёт правильный.</p></details>
            <details><summary>Где смотреть полную экономику?</summary><p>В Mini App: выручка, утверждённые расходы, прибыль, пробег и P&amp;L закрытых рейсов. Бот показывает быструю оперативную сводку.</p></details>
          </div>
        </section> : null}

        <p className="disclaimer">Management estimate: без распределения офисных расходов и будущих ремонтных резервов.</p>
      </section>
    </main>
  );
}
