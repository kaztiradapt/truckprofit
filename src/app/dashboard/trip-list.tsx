"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Vehicle = { id: string; displayName: string; plateNumber: string };
type Driver = { id: string; displayName: string };
type Trip = {
  id: string; title: string; status: string; vehicleId: string; driverId: string | null; vehicleName: string; driverName: string | null; startedAt: string | null;
  originCity: string; destinationCity: string; originAddress: string; destinationAddress: string; originLatitude: number | null; originLongitude: number | null;
  destinationLatitude: number | null; destinationLongitude: number | null; loadState: string;
  pnl: { managementProfitMinor: number; totalKm: number } | null;
};

const tripStatusLabels: Record<string, string> = { DRAFT: "Черновик", ACTIVE: "В рейсе", COMPLETED: "Закрыт", CANCELLED: "Отменён" };

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}

export function TripList({ organizationId, baseCurrency, trips, vehicles, drivers, canManage, canDelete }: { organizationId: string; baseCurrency: string; trips: Trip[]; vehicles: Vehicle[]; drivers: Driver[]; canManage: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(tripId: string, method: "PATCH" | "DELETE", body: object, successMessage: string) {
    setBusy(`${method}-${tripId}`); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/trips/${tripId}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Операция не выполнена.");
      setEditingId(""); setMessage(successMessage); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Операция не выполнена.");
    } finally { setBusy(""); }
  }

  async function updateTrip(event: FormEvent<HTMLFormElement>, tripId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(tripId, "PATCH", {
      organizationId,
      title: form.get("title"), vehicleId: form.get("vehicle_id"), driverId: form.get("driver_id") || null,
      originCity: form.get("origin_city"), destinationCity: form.get("destination_city"), originAddress: form.get("origin_address"), destinationAddress: form.get("destination_address"),
      originLatitude: form.get("origin_latitude") ? Number(form.get("origin_latitude")) : null,
      originLongitude: form.get("origin_longitude") ? Number(form.get("origin_longitude")) : null,
      destinationLatitude: form.get("destination_latitude") ? Number(form.get("destination_latitude")) : null,
      destinationLongitude: form.get("destination_longitude") ? Number(form.get("destination_longitude")) : null,
      loadState: form.get("load_state"), startedAt: form.get("started_at"),
    }, "Рейс обновлён.");
  }

  async function removeTrip(trip: Trip) {
    if (!window.confirm(`Удалить рейс «${trip.title}»? Связанные доходы и расходы будут исключены из расчётов, но сохранятся в журнале.`)) return;
    await request(trip.id, "DELETE", { organizationId }, "Рейс удалён из рабочего списка.");
  }

  if (!trips.length) return <p className="empty-state">Пока нет рейсов.</p>;
  return <>
    {error ? <p className="form-error list-action-message" role="alert">{error}</p> : null}
    {message ? <p className="form-success list-action-message" role="status">{message}</p> : null}
    <div className="table-wrap"><table className="responsive-table trip-manage-table"><thead><tr><th>Рейс</th><th>Машина</th><th>Водитель</th><th>Старт</th><th>Статус</th><th>P&amp;L</th>{canManage || canDelete ? <th>Действия</th> : null}</tr></thead><tbody>
      {trips.map((trip) => <Fragment key={trip.id}><tr><td data-label="Рейс">{trip.title}</td><td data-label="Машина">{trip.vehicleName}</td><td data-label="Водитель">{trip.driverName ?? "Не назначен"}</td><td data-label="Старт">{trip.startedAt ? new Date(trip.startedAt).toLocaleDateString("ru-RU") : "—"}</td><td data-label="Статус"><span className="badge">{tripStatusLabels[trip.status] ?? trip.status}</span></td><td data-label="P&L">{trip.pnl ? `${money(trip.pnl.managementProfitMinor, baseCurrency)} · ${trip.pnl.totalKm} км` : "—"}</td>{canManage || canDelete ? <td data-label="Действия"><span className="table-action-buttons">{canManage ? <button type="button" className="tiny-button" onClick={() => setEditingId(editingId === trip.id ? "" : trip.id)}>Изменить</button> : null}{canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `DELETE-${trip.id}`} onClick={() => void removeTrip(trip)}>{busy === `DELETE-${trip.id}` ? "Удаляю…" : "Удалить"}</button> : null}</span></td> : null}</tr>
        {editingId === trip.id ? <tr className="trip-inline-edit-row"><td colSpan={7}><form className="record-edit-form trip-edit-form" onSubmit={(event) => updateTrip(event, trip.id)}>
          <label className="record-field-wide">Название<input name="title" defaultValue={trip.title} required /></label>
          <label>Машина<select name="vehicle_id" defaultValue={trip.vehicleId} required>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
          <label>Водитель<select name="driver_id" defaultValue={trip.driverId ?? ""}><option value="">Назначить позже</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}</select></label>
          <label>Откуда<input name="origin_city" defaultValue={trip.originCity} required /></label><label>Куда<input name="destination_city" defaultValue={trip.destinationCity} required /></label>
          <label className="record-field-wide">Адрес погрузки<input name="origin_address" defaultValue={trip.originAddress} required /></label><label className="record-field-wide">Адрес выгрузки<input name="destination_address" defaultValue={trip.destinationAddress} required /></label>
          <input type="hidden" name="origin_latitude" value={trip.originLatitude ?? ""} /><input type="hidden" name="origin_longitude" value={trip.originLongitude ?? ""} />
          <input type="hidden" name="destination_latitude" value={trip.destinationLatitude ?? ""} /><input type="hidden" name="destination_longitude" value={trip.destinationLongitude ?? ""} />
          <label>Тип пробега<select name="load_state" defaultValue={trip.loadState}><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label>
          <label>Дата старта<input name="started_at" type="date" defaultValue={trip.startedAt?.slice(0, 10) ?? ""} required /></label>
          <div className="record-edit-actions record-field-wide"><button type="submit" className="tiny-button" disabled={busy === `PATCH-${trip.id}`}>{busy === `PATCH-${trip.id}` ? "Сохраняю…" : "Сохранить"}</button><button type="button" className="tiny-button" onClick={() => setEditingId("")}>Отмена</button></div>
        </form></td></tr> : null}</Fragment>)}
    </tbody></table></div>
  </>;
}
