import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { completeTrip, createDriver, createVehicle, enableOwnerDriverMode, recalculateTripPnl } from "@/app/actions/owner";
import { getDashboardData } from "@/lib/dashboard-data";
import { DriverList } from "./driver-list";
import { DriverReports } from "./driver-reports";
import { IncomeForm } from "./income-form";
import { OwnerTelegramConnectButton } from "./owner-telegram-connect-button";
import { TelegramMenuButton } from "./telegram-menu-button";
import { TeamManagement } from "./team-management";
import { TripCreateForm } from "./trip-create-form";
import { TripList } from "./trip-list";
import { TripTrackingMap } from "./trip-tracking-map";
import { VehicleList } from "./vehicle-list";

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

const sectionTitles: Record<DashboardSection, string> = {
  overview: "Управленческий обзор",
  trips: "Рейсы и маршруты",
  vehicles: "Автомобили",
  drivers: "Водители",
  reports: "Отчёты по водителям",
  expenses: "Расходы",
  team: "Сотрудники и роли",
  operations: "Создание и закрытие рейса",
  help: "Инструкции и ЧАВО",
};

export const dashboardSections = ["overview", "trips", "vehicles", "drivers", "reports", "expenses", "team", "operations", "help"] as const;
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
  const canViewFinance = data.permissions.includes("VIEW_FINANCE");
  const canDelete = data.permissions.includes("DELETE_RECORDS");
  const canOperate = canManageTrips || canManageFinance;
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
  const navigationItems = [
    { href: "/dashboard", label: "Обзор", visible: true, key: "overview" },
    { href: "/dashboard/trips", label: "Рейсы", visible: true, key: "trips" },
    { href: "/dashboard/vehicles", label: "Автомобили", visible: true, key: "vehicles" },
    { href: "/dashboard/drivers", label: "Водители", visible: true, key: "drivers" },
    { href: "/dashboard/reports", label: "Отчёты", visible: true, key: "reports" },
    { href: "/dashboard/expenses", label: "Расходы", visible: canViewFinance, key: "expenses" },
    { href: "/dashboard/team", label: "Сотрудники", visible: data.role === "OWNER", key: "team" },
    { href: "/dashboard/operations", label: "Создание рейса", visible: canOperate, key: "operations" },
    { href: "/dashboard/help", label: "Инструкция", visible: true, key: "help" },
  ].filter((item) => item.visible);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>TP</span><strong>TruckProfit</strong></div>
        <nav className="desktop-navigation" aria-label="Основная навигация">
          {navigationItems.map((item) => <Link className={section === item.key ? "active" : ""} href={item.href} key={item.key}>{item.label}</Link>)}
        </nav>
        <details className="mobile-navigation">
          <summary><span>Меню</span><i aria-hidden="true" /></summary>
          <div className="mobile-navigation-panel">
            <nav aria-label="Мобильная навигация">
              {navigationItems.map((item) => <Link className={section === item.key ? "active" : ""} href={item.href} key={item.key}>{item.label}</Link>)}
            </nav>
            <div className="mobile-account">
              <span><b>{data.organization.name}</b><small>{data.accessRoleName} · {data.organization.baseCurrency}</small></span>
              <form action={signOut}><button className="sidebar-signout" type="submit">Выйти</button></form>
            </div>
          </div>
        </details>
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
          {canManageTrips && ["overview", "trips"].includes(section) ? <Link className="primary-link" href="/dashboard/operations">+ Новый рейс</Link> : null}
        </header>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        {section === "overview" && data.role === "OWNER" ? <section className="owner-telegram-card" aria-label="Telegram владельца">
          <span><b>Кабинет владельца в Telegram</b><small>Сводка, рейсы, водители, расходы и быстрый переход в Mini App.</small></span>
          <OwnerTelegramConnectButton organizationId={data.organization.id} linked={data.ownerTelegramLinked} />
        </section> : null}

        {section === "overview" && canViewFinance ? <div className="signal">
          <div><span className="signal-dot" />Расходы учитываются автоматически</div>
          <p>{latestPnl ? "P&L последнего рейса зафиксирован" : "Данные поступают из рейсов и Telegram"}</p>
        </div> : section === "overview" ? <div className="signal"><div><span className="signal-dot" />Роль: {data.accessRoleName}</div><p>Финансовые показатели скрыты настройками доступа</p></div> : null}

        {section === "overview" && canViewFinance ? <section className="metrics" aria-label="Ключевые показатели">
          <article><span>Выручка</span><strong>{formatMoney(data.totals.revenue, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.revenue / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Нет закрытого пробега"}</small></article>
          <article><span>Все расходы</span><strong>{formatMoney(data.totals.expenses, data.organization.baseCurrency)}</strong><small>{data.totals.totalKm ? `${formatMoney(data.totals.expenses / data.totals.totalKm, data.organization.baseCurrency)} / км` : "Учитываются сразу после записи"}</small></article>
          <article className="profit"><span>Результат</span><strong>{formatMoney(data.totals.profit, data.organization.baseCurrency)}</strong><small>{latestPnl ? `${margin} маржа последнего рейса` : "До оценочных налогов"}</small></article>
          <article><span>Порожний пробег</span><strong>{latestPnl ? formatKm(latestPnl.emptyKm) : emptyShare}</strong><small>{latestPnl ? `${emptyShare} от последнего рейса` : "Доля от общего"}</small></article>
        </section> : null}

        {section === "overview" || section === "trips" ? <section className="trip-card">
          {latestTrip ? <>
            <div className="trip-heading">
              <div><p className="eyebrow">Последний рейс</p><h2>{latestTrip.title}</h2><p>{latestTrip.vehicleName} · {latestTrip.driverName ?? "Водитель не назначен"} · {dateLabel(latestTrip.startedAt)}</p></div>
              <span className="status">{statusLabel(latestTrip.status)}</span>
            </div>
            <TripTrackingMap
              organizationId={data.organization.id}
              tripId={latestTrip.id}
              routeRecord={{
                title: latestTrip.title,
                vehicleId: latestTrip.vehicleId,
                driverId: latestTrip.driverId,
                originCity: latestTrip.originCity,
                destinationCity: latestTrip.destinationCity,
                originAddress: latestTrip.originAddress,
                destinationAddress: latestTrip.destinationAddress,
                distanceKm: latestTrip.distanceKm,
                loadState: latestTrip.loadState,
                startedAt: latestTrip.startedAt,
              }}
              origin={{ latitude: latestTrip.originLatitude, longitude: latestTrip.originLongitude, label: latestTrip.originAddress, city: latestTrip.originCity }}
              destination={{ latitude: latestTrip.destinationLatitude, longitude: latestTrip.destinationLongitude, label: latestTrip.destinationAddress, city: latestTrip.destinationCity }}
              initialPoints={latestTrip.locationHistory}
              canManage={canManageTrips}
            />
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
            <TripList organizationId={data.organization.id} baseCurrency={data.organization.baseCurrency} trips={data.trips} vehicles={data.vehicles} drivers={data.drivers} canManage={canManageTrips} canDelete={canDelete} />
          </article> : null}

          {section === "vehicles" ? <>
            {canManageVehicles ? <article className="panel vehicle-create-panel">
              <p className="eyebrow">Новая машина</p><h2>Добавить автомобиль</h2>
              <form action={createVehicle} className="stack-form vehicle-create-form">
                <input type="hidden" name="organization_id" value={data.organization.id} />
                <div className="vehicle-create-grid">
                  <label><span>Название</span><input name="display_name" placeholder="Например: DAF 001" required /></label>
                  <label><span>Госномер</span><input name="plate_number" placeholder="Например: KZ 001 DEM" required /></label>
                  <label><span>Марка и модель</span><input name="make_model" placeholder="Например: DAF XF" /></label>
                  <label><span>Норма топлива</span><input name="fuel_norm" inputMode="decimal" placeholder="30.5 л/100 км" /></label>
                </div>
                <button type="submit">Добавить автомобиль</button>
              </form>
            </article> : null}
            <article className={`panel ${canManageVehicles ? "" : "panel-wide"}`}><div className="panel-title"><div><p className="eyebrow">Парк</p><h2>Автомобили</h2></div><span>{data.vehicles.length} в списке</span></div>
              <VehicleList organizationId={data.organization.id} vehicles={data.vehicles} canManage={canManageVehicles} canDelete={canDelete} />
            </article>
          </> : null}

          {section === "drivers" ? <article className="panel panel-wide">
            <div className="panel-title"><div><p className="eyebrow">Команда</p><h2>Водители</h2></div><span>{data.drivers.length} в списке</span></div>
            {canManageDrivers ? <form action={createDriver} className="team-driver-form"><input type="hidden" name="organization_id" value={data.organization.id} /><label htmlFor="team-driver-name">Новый водитель</label><div><input id="team-driver-name" name="display_name" placeholder="Имя и фамилия" required /><button type="submit">+ Добавить</button></div><small>После добавления сразу появится кнопка приглашения в Telegram.</small></form> : null}
            <div className="team-list-heading"><b>Список водителей</b><span>{data.drivers.length ? "Статус и подключение Telegram" : "Список пока пуст"}</span></div>
            <DriverList organizationId={data.organization.id} drivers={data.drivers} vehicles={data.vehicles} canManage={canManageDrivers} canDelete={canDelete} />
            {data.role === "OWNER" && !ownerDriver ? <form action={enableOwnerDriverMode} className="self-driver-cta"><input type="hidden" name="organization_id" value={data.organization.id} /><span><b>Вы сами за рулём?</b><small>Это дополнительный вариант — создадим отдельный водительский режим для вашего профиля.</small></span><button type="submit" className="tiny-button">Я владелец-водитель</button></form> : null}
          </article> : null}

          {section === "expenses" && canViewFinance ? <article className="panel panel-wide"><div className="panel-title"><div><p className="eyebrow">Финансовый учёт</p><h2>Последние расходы</h2></div><span>{data.recentExpenses.length}</span></div>
            <p className="panel-note">Расход попадает в экономику рейса сразу после записи водителем.</p>
            <ul className="entity-list expense-list">{data.recentExpenses.length ? data.recentExpenses.map((expense) => <li key={expense.id}><span>{expense.categoryName}<small>{expense.tripTitle ?? "Без рейса"} · {dateLabel(expense.occurredAt)}{expense.comment ? ` · ${expense.comment}` : ""}</small></span><strong>{formatMoney(expense.amount, expense.currency)}</strong></li>) : <li className="empty-state">Расходов пока нет.</li>}</ul>
          </article> : section === "expenses" ? <article className="panel panel-wide"><h2>Доступ ограничен</h2><p className="muted">Владелец не выдал этой роли доступ к финансовым данным.</p></article> : null}
        </section> : null}

        {section === "team" && data.role === "OWNER" ? <TeamManagement organizationId={data.organization.id} roles={data.accessRoles} staff={data.staff} /> : section === "team" ? <section className="panel"><h2>Доступ ограничен</h2><p className="muted">Управление сотрудниками доступно только владельцу.</p></section> : null}

        {section === "reports" ? <DriverReports reports={data.driverReports} baseCurrency={data.organization.baseCurrency} canViewFinance={canViewFinance} /> : null}

        {section === "operations" && canOperate ? <section className="operations">
          <div className="start-intro"><p className="eyebrow">End-to-end контур</p><h2>Провести настоящий рейс</h2><p>Организация уже подключена. Пройдите шаги по порядку — данные сохраняются в защищённом контуре компании.</p></div>
          <div className="workbench">
            <div className="workbench-status"><span className="ready" />Supabase, Telegram и расчётный слой подключены</div>
            {canManageTrips ? <TripCreateForm organizationId={data.organization.id} vehicles={data.vehicles} drivers={data.drivers} today={today} /> : null}
            {canManageFinance ? <IncomeForm organizationId={data.organization.id} baseCurrency={data.organization.baseCurrency} trips={data.trips.map(({ id, title }) => ({ id, title }))} /> : null}
            {canManageTrips || canManageFinance ? <div className="flow-card flow-card-closing">
              <div className="flow-card-heading"><span className="flow-step">3</span><span><b>Закрытие и P&amp;L</b><small>Завершите рейс и рассчитайте итог</small></span></div>
              <div className="closing-actions">
                {canManageTrips ? <form action={completeTrip} className="closing-action"><input type="hidden" name="organization_id" value={data.organization.id} /><label className="flow-field"><span>Завершить рейс</span><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "ACTIVE")}><option value="">Выберите активный рейс</option>{data.trips.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="submit" disabled={!data.trips.some((item) => item.status === "ACTIVE")}>Закрыть</button></form> : null}
                {canManageFinance ? <form action={recalculateTripPnl} className="closing-action"><input type="hidden" name="organization_id" value={data.organization.id} /><label className="flow-field"><span>Рассчитать результат</span><select name="trip_id" required disabled={!data.trips.some((item) => item.status === "COMPLETED")}><option value="">Выберите закрытый рейс</option>{data.trips.filter((item) => item.status === "COMPLETED").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="submit" disabled={!data.trips.some((item) => item.status === "COMPLETED")}>Рассчитать P&amp;L</button></form> : null}
              </div>
            </div> : null}
          </div>
        </section> : section === "operations" ? <section className="panel"><h2>Ваш доступ: {data.accessRoleName}</h2><p className="muted">Редактирование ограничено владельцем. Доступные данные остаются в режиме просмотра.</p></section> : null}

        {section === "help" ? <section className="help-section">
          <div className="start-intro"><p className="eyebrow">ЧАВО и инструкции</p><h2>Как пользоваться TruckProfit</h2><p>Короткие сценарии для ежедневной работы. В Telegram та же справка открывается кнопкой «❓ Помощь» или командой /help.</p></div>
          <div className="help-grid">
            <article className="panel"><h3>Владельцу</h3><ol><li>Добавьте автомобиль в разделе «Автомобили», а водителя — в разделе «Водители».</li><li>Откройте «Изменить» у водителя и закрепите за ним автомобиль. При выборе водителя в новом рейсе эта машина подставится сама.</li><li>В «Создании рейса» найдите адрес погрузки, затем адрес выгрузки и выберите вариант маршрута.</li><li>Проверьте плановый километраж: он подставляется с карты, но его можно исправить вручную.</li><li>Сводку по рейсам и пробегу команды смотрите в разделе «Отчёты».</li><li>Расходы водителей учитываются автоматически, а после закрытия рейса можно рассчитать P&amp;L.</li></ol></article>
            <article className="panel"><h3>Водителю</h3><ol><li>Откройте персональную ссылку владельца и нажмите START.</li><li>В «Мой рейс» проверьте адреса погрузки и выгрузки.</li><li>Там же одной кнопкой отмечайте ожидание, погрузку, путь и выгрузку.</li><li>Геопозиция передаётся только после вашего нажатия и разрешения Telegram.</li><li>После расхода отправьте фото чека; оплату смотрите в «Моя зарплата».</li></ol></article>
            <article className="panel"><h3>Mini App</h3><ol><li>Откройте «Открыть кабинет» возле поля ввода в Telegram.</li><li>При первом запуске войдите тем же email владельца.</li><li>Каждый раздел открывается на отдельной странице из верхнего или бокового меню.</li><li>В обзоре карта показывает маршрут, текущую точку водителя и всю историю геопозиций.</li><li>Нажмите номер точки, чтобы найти её на карте; выберите тип «Ночёвка / отдых», «Погрузка», «Выгрузка» или добавьте комментарий.</li></ol></article>
          </div>
          <div className="faq-list">
            <details><summary>Почему бот не видит мой профиль?</summary><p>Telegram ещё не привязан или открыта чужая/просроченная ссылка. Создайте новую ссылку в карточке владельца или водителя и нажмите START именно в нужном аккаунте Telegram.</p></details>
            <details><summary>Можно ли владельцу самому быть водителем?</summary><p>Да. Нажмите «Я владелец-водитель» в разделе команды. Один Telegram получит два режима, между ними можно переключаться в меню бота.</p></details>
            <details><summary>Как учитывается расход?</summary><p>Сразу после сохранения водителем. Дополнительное подтверждение владельца не требуется.</p></details>
            <details><summary>Как работает основная валюта компании?</summary><p>При создании компании выберите валюту управленческого учёта: KZT, RUB, USD, CNY или UZS. Если доход записан в другой валюте, кабинет попросит курс именно к основной валюте компании. Например, для рублёвой компании: «1 USD = сколько RUB». Доход и P&amp;L будут пересчитаны в RUB.</p></details>
            <details><summary>Откуда берётся километраж рейса?</summary><p>После выбора погрузки и выгрузки кабинет строит автомобильный маршрут и подставляет его расстояние. Перед созданием рейса проверьте значение: при необходимости его можно заменить плановым километражем вручную.</p></details>
            <details><summary>Как закрепить автомобиль за водителем?</summary><p>Откройте раздел «Водители», нажмите «Изменить» напротив нужного человека и выберите активный автомобиль. При создании следующего рейса выбор этого водителя автоматически подставит закреплённую машину; при необходимости её можно заменить вручную.</p></details>
            <details><summary>Что показывает раздел «Отчёты»?</summary><p>По каждому водителю видны закреплённая машина, количество активных и закрытых рейсов, общий, гружёный и порожний пробег, а также дата последнего рейса. Финансовые показатели отображаются только ролям с доступом к финансам.</p></details>
            <details><summary>Сохраняются ли старые геопозиции водителя?</summary><p>Да. Каждая отправленная водителем точка остаётся в истории рейса. Последняя отмечена как текущая, а прошлые можно открыть по номеру, подписать и дополнить комментарием.</p></details>
            <details><summary>Где смотреть полную экономику?</summary><p>В Mini App: выручка, расходы, прибыль, пробег и P&amp;L закрытых рейсов. Бот показывает быструю оперативную сводку.</p></details>
          </div>
        </section> : null}

        <p className="disclaimer">Management estimate: без распределения офисных расходов и будущих ремонтных резервов.</p>
      </section>
    </main>
  );
}
