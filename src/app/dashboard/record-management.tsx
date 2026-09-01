"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

type Vehicle = { id: string; displayName: string; plateNumber: string; makeModel: string | null; fuelNorm: number | null; status: string };
type Driver = { id: string; displayName: string; status: string; isOwnerDriver: boolean };
type Trip = {
  id: string;
  title: string;
  status: string;
  vehicleId: string;
  driverId: string | null;
  vehicleName: string;
  driverName: string | null;
  startedAt: string | null;
  originCity: string;
  destinationCity: string;
  loadState: string;
};

type Props = {
  organizationId: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  canManageVehicles: boolean;
  canManageDrivers: boolean;
  canManageTrips: boolean;
  canDelete: boolean;
};

const vehicleStatusLabels: Record<string, string> = { ACTIVE: "Активна", INACTIVE: "Неактивна", MAINTENANCE: "На ремонте", ARCHIVED: "В архиве" };
const driverStatusLabels: Record<string, string> = { ACTIVE: "Активен", INACTIVE: "Неактивен", INVITED: "Приглашён" };
const tripStatusLabels: Record<string, string> = { DRAFT: "Черновик", ACTIVE: "В рейсе", COMPLETED: "Закрыт", CANCELLED: "Отменён" };

function RecordCard({ children, title, count, wide = false }: { children: ReactNode; title: string; count: number; wide?: boolean }) {
  return <article className={`panel record-card${wide ? " record-card-wide" : ""}`}><div className="panel-title"><h3>{title}</h3><span>{count}</span></div>{children}</article>;
}

export function RecordManagement(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(endpoint: string, method: "PATCH" | "DELETE", body: object, key: string, successMessage: string) {
    setBusy(key); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Операция не выполнена.");
      setEditing("");
      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Операция не выполнена.");
    } finally { setBusy(""); }
  }

  async function updateVehicle(event: FormEvent<HTMLFormElement>, vehicleId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fuelNormText = String(form.get("fuel_norm") ?? "").trim().replace(",", ".");
    await request(`/api/vehicles/${vehicleId}`, "PATCH", {
      organizationId: props.organizationId,
      displayName: form.get("display_name"),
      plateNumber: form.get("plate_number"),
      makeModel: form.get("make_model"),
      fuelNorm: fuelNormText ? Number(fuelNormText) : null,
      status: form.get("status"),
    }, `vehicle-${vehicleId}`, "Машина обновлена.");
  }

  async function updateDriver(event: FormEvent<HTMLFormElement>, driverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/drivers/${driverId}`, "PATCH", {
      organizationId: props.organizationId,
      displayName: form.get("display_name"),
      status: form.get("status"),
    }, `driver-${driverId}`, "Водитель обновлён.");
  }

  async function updateTrip(event: FormEvent<HTMLFormElement>, tripId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/trips/${tripId}`, "PATCH", {
      organizationId: props.organizationId,
      title: form.get("title"),
      vehicleId: form.get("vehicle_id"),
      driverId: form.get("driver_id") || null,
      originCity: form.get("origin_city"),
      destinationCity: form.get("destination_city"),
      loadState: form.get("load_state"),
      startedAt: form.get("started_at"),
    }, `trip-${tripId}`, "Рейс обновлён.");
  }

  async function remove(kind: "vehicles" | "drivers" | "trips", id: string, label: string) {
    const warning = kind === "trips"
      ? `Удалить рейс «${label}»? Связанные доходы и расходы будут исключены из расчётов.`
      : `Удалить «${label}»? Запись будет скрыта, но сохранится в журнале.`;
    if (!window.confirm(warning)) return;
    const noun = kind === "vehicles" ? "Машина удалена." : kind === "drivers" ? "Водитель удалён." : "Рейс удалён.";
    await request(`/api/${kind}/${id}`, "DELETE", { organizationId: props.organizationId }, `delete-${kind}-${id}`, noun);
  }

  return <section className="record-management" id="records">
    <div className="start-intro"><p className="eyebrow">Справочники и рейсы</p><h2>Редактирование данных</h2><p>Исправляйте записи прямо в кабинете. Удаление — мягкое: данные остаются в журнале, но пропадают из рабочих списков и расчётов.</p></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="form-success" role="status">{message}</p> : null}
    <div className="record-management-grid">
      {props.canManageVehicles ? <RecordCard title="Машины" count={props.vehicles.length}>
        <ul className="record-list">{props.vehicles.map((vehicle) => <li key={vehicle.id}>
          {editing === `vehicle-${vehicle.id}` ? <form className="record-edit-form" onSubmit={(event) => updateVehicle(event, vehicle.id)}>
            <label>Название<input name="display_name" defaultValue={vehicle.displayName} required /></label>
            <label>Госномер<input name="plate_number" defaultValue={vehicle.plateNumber} required /></label>
            <label>Марка и модель<input name="make_model" defaultValue={vehicle.makeModel ?? ""} /></label>
            <label>Норма топлива<input name="fuel_norm" inputMode="decimal" defaultValue={vehicle.fuelNorm ?? ""} /></label>
            <label>Статус<select name="status" defaultValue={vehicle.status}><option value="ACTIVE">Активна</option><option value="INACTIVE">Неактивна</option><option value="MAINTENANCE">На ремонте</option></select></label>
            <div className="record-edit-actions"><button type="submit" className="tiny-button" disabled={busy === `vehicle-${vehicle.id}`}>Сохранить</button><button type="button" className="tiny-button" onClick={() => setEditing("")}>Отмена</button></div>
          </form> : <><span><b>{vehicle.displayName}</b><small>{vehicle.plateNumber}{vehicle.makeModel ? ` · ${vehicle.makeModel}` : ""}</small></span><span className="record-actions"><span className="badge">{vehicleStatusLabels[vehicle.status] ?? vehicle.status}</span><span><button type="button" className="tiny-button" onClick={() => setEditing(`vehicle-${vehicle.id}`)}>Изменить</button>{props.canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `delete-vehicles-${vehicle.id}`} onClick={() => remove("vehicles", vehicle.id, vehicle.displayName)}>Удалить</button> : null}</span></span></>}
        </li>)}</ul>
      </RecordCard> : null}

      {props.canManageDrivers ? <RecordCard title="Водители" count={props.drivers.length}>
        <ul className="record-list">{props.drivers.map((driver) => <li key={driver.id}>
          {editing === `driver-${driver.id}` ? <form className="record-edit-form record-edit-compact" onSubmit={(event) => updateDriver(event, driver.id)}>
            <label>Имя<input name="display_name" defaultValue={driver.displayName} required /></label>
            <label>Статус<select name="status" defaultValue={driver.status}><option value="ACTIVE">Активен</option><option value="INVITED">Приглашён</option><option value="INACTIVE">Неактивен</option></select></label>
            <div className="record-edit-actions"><button type="submit" className="tiny-button" disabled={busy === `driver-${driver.id}`}>Сохранить</button><button type="button" className="tiny-button" onClick={() => setEditing("")}>Отмена</button></div>
          </form> : <><span><b>{driver.displayName}{driver.isOwnerDriver ? " · Вы" : ""}</b><small>{driverStatusLabels[driver.status] ?? driver.status}</small></span><span className="record-actions"><button type="button" className="tiny-button" onClick={() => setEditing(`driver-${driver.id}`)}>Изменить</button>{props.canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `delete-drivers-${driver.id}`} onClick={() => remove("drivers", driver.id, driver.displayName)}>Удалить</button> : null}</span></>}
        </li>)}</ul>
      </RecordCard> : null}

      {props.canManageTrips ? <RecordCard title="Рейсы" count={props.trips.length} wide>
        <ul className="record-list">{props.trips.map((trip) => <li key={trip.id}>
          {editing === `trip-${trip.id}` ? <form className="record-edit-form trip-edit-form" onSubmit={(event) => updateTrip(event, trip.id)}>
            <label className="record-field-wide">Название<input name="title" defaultValue={trip.title} required /></label>
            <label>Машина<select name="vehicle_id" defaultValue={trip.vehicleId} required>{props.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
            <label>Водитель<select name="driver_id" defaultValue={trip.driverId ?? ""}><option value="">Назначить позже</option>{props.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}</select></label>
            <label>Откуда<input name="origin_city" defaultValue={trip.originCity} required /></label>
            <label>Куда<input name="destination_city" defaultValue={trip.destinationCity} required /></label>
            <label>Тип пробега<select name="load_state" defaultValue={trip.loadState}><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label>
            <label>Дата старта<input name="started_at" type="date" defaultValue={trip.startedAt?.slice(0, 10) ?? ""} required /></label>
            <div className="record-edit-actions record-field-wide"><button type="submit" className="tiny-button" disabled={busy === `trip-${trip.id}`}>Сохранить</button><button type="button" className="tiny-button" onClick={() => setEditing("")}>Отмена</button></div>
          </form> : <><span><b>{trip.title}</b><small>{trip.originCity} → {trip.destinationCity} · {trip.vehicleName} · {trip.driverName ?? "без водителя"}</small></span><span className="record-actions"><span className="badge">{tripStatusLabels[trip.status] ?? trip.status}</span><span><button type="button" className="tiny-button" onClick={() => setEditing(`trip-${trip.id}`)}>Изменить</button>{props.canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `delete-trips-${trip.id}`} onClick={() => remove("trips", trip.id, trip.title)}>Удалить</button> : null}</span></span></>}
        </li>)}</ul>
      </RecordCard> : null}
    </div>
  </section>;
}
