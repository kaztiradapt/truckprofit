"use client";

import { useMemo, useState } from "react";

import { getDriverTripStatus } from "@/domain/driver-trip-status";
import { groupExpensesByCurrency } from "@/domain/trip-expenses";
import type { DashboardData } from "@/lib/dashboard-data";
import { DeviceDateTime } from "./device-date-time";
import { ReceiptViewerButton } from "./receipt-viewer-button";
import { TripTrackingMap } from "./trip-tracking-map";

type Trip = DashboardData["trips"][number];
type Expense = DashboardData["recentExpenses"][number];
type Income = DashboardData["incomes"][number];

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMinor(value: number, currency: string) {
  return formatMoney(value / 100, currency);
}

function formatKm(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("ru-RU")} км`;
}

function loadStateLabel(value: string) {
  if (value === "EMPTY") return "Порожний";
  if (value === "LOADED") return "С грузом";
  return "Статус груза не указан";
}

function expenseSourceLabel(value: string) {
  if (value === "TELEGRAM") return "Telegram водителя";
  if (value === "IMPORT") return "Импорт";
  return "Кабинет";
}

function paymentStatusLabel(value: string) {
  return ({
    PLANNED: "Запланирован",
    INVOICED: "Счёт выставлен",
    PARTIAL: "Оплачен частично",
    PAID: "Оплачен",
    OVERDUE: "Просрочен",
  } as Record<string, string>)[value] ?? value;
}

function TripIncomePanel({ trip, incomes, baseCurrency, canViewFinance }: {
  trip: Trip;
  incomes: Income[];
  baseCurrency: string;
  canViewFinance: boolean;
}) {
  if (!canViewFinance) return null;
  const totalReportingMinor = incomes.reduce((sum, income) => sum + income.reportingAmountMinor, 0);
  return <section className="trip-expenses trip-incomes" aria-label={`Доход рейса ${trip.title}`}>
    <div className="trip-expenses-heading">
      <div><h3>Доход рейса</h3><p>Сумма, указанная при оформлении рейса, заказчик и состояние оплаты.</p></div>
      <div className="trip-expense-totals">
        <span><small>Итого в учёте, {baseCurrency}</small><strong>{formatMinor(totalReportingMinor, baseCurrency)}</strong></span>
      </div>
    </div>
    {incomes.length ? <ul className="trip-expense-list">
      {incomes.map((income) => <li key={income.id}>
        <span className="trip-expense-copy">
          <b>{income.customerName ?? "Заказчик не указан"}</b>
          <small>{paymentStatusLabel(income.paymentStatus)}{income.expectedPaymentAt ? <> · ожидаемая оплата <DeviceDateTime value={income.expectedPaymentAt} mode="date" /></> : null}</small>
          {income.comment ? <p>{income.comment}</p> : null}
        </span>
        <span className="income-amount">
          <strong>{formatMoney(income.amount, income.currency)}</strong>
          {income.currency !== income.reportingCurrency ? <small>В учёте: {formatMinor(income.reportingAmountMinor, income.reportingCurrency)} · курс {income.fxRateToReporting.toLocaleString("ru-RU")}</small> : null}
        </span>
      </li>)}
    </ul> : <p className="trip-expense-empty">Доход для этого рейса не указан. В новых рейсах он сохраняется одновременно с созданием рейса.</p>}
  </section>;
}

function TripExpensePanel({ trip, expenses, baseCurrency, canViewFinance }: {
  trip: Trip;
  expenses: Expense[];
  baseCurrency: string;
  canViewFinance: boolean;
}) {
  if (!canViewFinance) {
    return <section className="trip-expenses trip-expenses-locked">
      <div><h3>Расходы рейса</h3><p>Финансовые данные скрыты настройками доступа вашей роли.</p></div>
    </section>;
  }

  const totals = groupExpensesByCurrency(expenses, baseCurrency);
  return <section className="trip-expenses" aria-label={`Расходы рейса ${trip.title}`}>
    <div className="trip-expenses-heading">
      <div><h3>Расходы рейса</h3><p>Запись водителя сразу появляется здесь и учитывается в экономике рейса.</p></div>
      <div className="trip-expense-totals">
        {totals.length ? totals.map((total) => <span key={total.currency}><small>Итого, {total.currency}</small><strong>{formatMoney(total.amount, total.currency)}</strong></span>) : <span><small>Записано</small><strong>0</strong></span>}
      </div>
    </div>
    {expenses.length ? <ul className="trip-expense-list">
      {expenses.map((expense) => <li key={expense.id}>
        <span className="trip-expense-copy">
          <b>{expense.categoryName}</b>
          <small>{expense.driverName ?? trip.driverName ?? "Водитель не указан"} · <DeviceDateTime value={expense.occurredAt} /> · {expenseSourceLabel(expense.source)}</small>
          {expense.locationText ? <small>Место: {expense.locationText}</small> : null}
          {expense.comment ? <p>{expense.comment}</p> : null}
        </span>
        <span className="expense-amount-actions">
          <strong>{formatMoney(expense.amount, expense.currency)}</strong>
          {expense.receipt ? <ReceiptViewerButton expenseId={expense.id} filename={expense.receipt.originalFilename} contentType={expense.receipt.contentType} /> : null}
        </span>
      </li>)}
    </ul> : <p className="trip-expense-empty">Расходов пока нет. После сохранения расхода водителем в Telegram он автоматически появится в этой карточке и в разделе «Расходы».</p>}
    <p className="trip-expense-footnote">Суммы разных валют показаны отдельно. Итоговый P&amp;L в {baseCurrency} фиксируется после закрытия рейса и расчёта результата.</p>
  </section>;
}

function DriverStatusHistory({ trip }: { trip: Trip }) {
  return <section className="driver-status-history" aria-label={`История статусов водителя рейса ${trip.title}`}>
    <div className="driver-status-history-heading">
      <div><h3>История статусов водителя</h3><p>Все отметки из Telegram сохраняются в хронологии рейса.</p></div>
      <span>{trip.driverStatusHistory.length}</span>
    </div>
    {trip.driverStatusHistory.length ? <ol>
      {trip.driverStatusHistory.map((status) => {
        const definition = getDriverTripStatus(status.code);
        return <li className={definition.tone} key={status.id}>
          <i aria-hidden="true" />
          <span><strong>{definition.label}</strong><small><DeviceDateTime value={status.recordedAt} />{status.locationText ? ` · ${status.locationText}` : ""}</small></span>
        </li>;
      })}
    </ol> : <p className="trip-expense-empty">Водитель ещё не передавал статусы по этому рейсу.</p>}
  </section>;
}

function ExpandedTrip({ organizationId, trip, expenses, incomes, baseCurrency, canManage, canViewFinance }: {
  organizationId: string;
  trip: Trip;
  expenses: Expense[];
  incomes: Income[];
  baseCurrency: string;
  canManage: boolean;
  canViewFinance: boolean;
}) {
  const plannedKm = trip.distanceKm ?? (trip.legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0) || null);
  const incomeTotalMinor = incomes.reduce((sum, income) => sum + income.reportingAmountMinor, 0);
  const driverStatus = getDriverTripStatus(trip.driverStatus?.code);
  return <div className="active-trip-detail">
    <TripTrackingMap
      organizationId={organizationId}
      tripId={trip.id}
      routeRecord={{
        title: trip.title,
        vehicleId: trip.vehicleId,
        driverId: trip.driverId,
        originCity: trip.originCity,
        destinationCity: trip.destinationCity,
        originAddress: trip.originAddress,
        destinationAddress: trip.destinationAddress,
        distanceKm: trip.distanceKm,
        loadState: trip.loadState,
        startedAt: trip.startedAt,
      }}
      origin={{ latitude: trip.originLatitude, longitude: trip.originLongitude, label: trip.originAddress, city: trip.originCity }}
      destination={{ latitude: trip.destinationLatitude, longitude: trip.destinationLongitude, label: trip.destinationAddress, city: trip.destinationCity }}
      routeGeometry={trip.routeGeometry}
      initialPoints={trip.locationHistory}
      canManage={canManage}
    />
    <div className="trip-grid active-trip-grid">
      <div className="route-panel">
        {trip.legs.length ? trip.legs.map((leg, index) => <div className={`route-line ${leg.loadState === "EMPTY" ? "empty-leg" : ""} ${index === trip.legs.length - 1 ? "last" : ""}`} key={leg.id}>
          <i />
          <div>
            <strong>{leg.originCity} → {leg.destinationCity}</strong>
            <span>{loadStateLabel(leg.loadState)} · {formatKm(leg.distanceKm)}</span>
            {index === 0 ? <small>Погрузка: {trip.originAddress}<br />Выгрузка: {trip.destinationAddress}</small> : null}
          </div>
        </div>) : <p className="empty-state">Плечи рейса ещё не заполнены.</p>}
      </div>
      <div className="economics">
        <div className={`driver-status-card ${driverStatus.tone}`}>
          <span>Статус водителя</span>
          <strong>{driverStatus.label}</strong>
          <small>{trip.driverStatus ? <>Обновлён <DeviceDateTime value={trip.driverStatus.recordedAt} />{trip.driverStatus.locationText ? ` · ${trip.driverStatus.locationText}` : ""} · по времени устройства</> : "Водитель ещё не выбрал статус в боте"}</small>
        </div>
        <div><span>Плановый пробег</span><strong>{formatKm(plannedKm)}</strong></div>
        <div><span>Точек водителя</span><strong>{trip.locationHistory.length}</strong></div>
        {canViewFinance ? <><div><span>Доход рейса</span><strong>{incomes.length ? formatMinor(incomeTotalMinor, baseCurrency) : "Не указан"}</strong></div>
        <div><span>Все расходы</span><strong>{trip.pnl ? formatMinor(trip.pnl.totalExpensesMinor, baseCurrency) : expenses.length ? `${expenses.length} записей` : "—"}</strong></div>
        <div><span>Результат рейса</span><strong>{trip.pnl ? formatMinor(trip.pnl.managementProfitMinor, baseCurrency) : "После закрытия"}</strong></div></> : null}
      </div>
    </div>
    <DriverStatusHistory trip={trip} />
    <TripIncomePanel trip={trip} incomes={incomes} baseCurrency={baseCurrency} canViewFinance={canViewFinance} />
    <TripExpensePanel trip={trip} expenses={expenses} baseCurrency={baseCurrency} canViewFinance={canViewFinance} />
  </div>;
}

export function ActiveTripDetails({ organizationId, trips, expenses, incomes, baseCurrency, canManage, canViewFinance }: {
  organizationId: string;
  trips: Trip[];
  expenses: Expense[];
  incomes: Income[];
  baseCurrency: string;
  canManage: boolean;
  canViewFinance: boolean;
}) {
  const activeTrips = useMemo(() => trips.filter((trip) => trip.status === "ACTIVE"), [trips]);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(activeTrips[0]?.id ?? null);

  if (!activeTrips.length) {
    return <section className="panel active-trip-browser"><div className="panel-title"><div><p className="eyebrow">Активные рейсы</p><h2>Сейчас машин в пути нет</h2></div><span>0</span></div><p className="empty-state">Создайте новый рейс — после назначения водителя он появится здесь с маршрутом, геопозициями и расходами.</p></section>;
  }

  return <section className="active-trip-browser" aria-label="Подробности активных рейсов">
    <div className="active-trip-browser-heading">
      <div><p className="eyebrow">Активные рейсы</p><h2>Маршруты, доходы и расходы</h2><p>Откройте нужный рейс — карта и его финансовые записи загрузятся внутри карточки.</p></div>
      <span>{activeTrips.length} в пути</span>
    </div>
    <div className="active-trip-list">
      {activeTrips.map((trip) => {
        const tripExpenses = expenses.filter((expense) => expense.tripId === trip.id);
        const tripIncomes = incomes.filter((income) => income.tripId === trip.id);
        const incomeTotalMinor = tripIncomes.reduce((sum, income) => sum + income.reportingAmountMinor, 0);
        const totals = groupExpensesByCurrency(tripExpenses, baseCurrency);
        const expanded = expandedTripId === trip.id;
        const driverStatus = getDriverTripStatus(trip.driverStatus?.code);
        return <article className={`active-trip-card${expanded ? " expanded" : ""}`} key={trip.id}>
          <div className="active-trip-summary">
            <div className="active-trip-main">
              <small>{trip.originCity || "Погрузка"} → {trip.destinationCity || "Выгрузка"}</small>
              <b>{trip.title}</b>
              <em>{trip.vehicleName} · {trip.driverName ?? "Водитель не назначен"} · <DeviceDateTime value={trip.startedAt} mode="date" /></em>
              <span className={`driver-status-line ${driverStatus.tone}`}>
                <i aria-hidden="true" />
                <b>{driverStatus.label}</b>
                {trip.driverStatus ? <small><DeviceDateTime value={trip.driverStatus.recordedAt} /></small> : null}
              </span>
            </div>
            <span className="active-trip-facts">
              <span><small>Пробег</small><b>{formatKm(trip.distanceKm)}</b></span>
              {canViewFinance ? <span><small>Доход</small><b>{tripIncomes.length ? formatMinor(incomeTotalMinor, baseCurrency) : "Не указан"}</b></span> : null}
              {canViewFinance ? <span><small>Расходы</small><b>{totals.length ? totals.map((total) => formatMoney(total.amount, total.currency)).join(" · ") : "Нет"}</b></span> : null}
            </span>
            <button
              type="button"
              className="active-trip-toggle"
              aria-expanded={expanded}
              aria-controls={`active-trip-${trip.id}`}
              onClick={() => setExpandedTripId(expanded ? null : trip.id)}
            >{expanded ? "Свернуть" : "Подробнее"}<i aria-hidden="true" /></button>
          </div>
          {expanded ? <div id={`active-trip-${trip.id}`}><ExpandedTrip key={trip.id} organizationId={organizationId} trip={trip} expenses={tripExpenses} incomes={tripIncomes} baseCurrency={baseCurrency} canManage={canManage} canViewFinance={canViewFinance} /></div> : null}
        </article>;
      })}
    </div>
  </section>;
}
