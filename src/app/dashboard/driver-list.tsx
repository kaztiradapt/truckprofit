"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { DriverInviteButton } from "./driver-invite-button";

type Driver = {
  id: string;
  displayName: string;
  status: string;
  telegramLinked: boolean;
  pendingInviteExpiresAt: string | null;
  isOwnerDriver: boolean;
  assignedVehicleId: string | null;
  assignedVehicleName: string | null;
};

type Vehicle = { id: string; displayName: string; plateNumber: string; status: string };

type DriverListProps = {
  organizationId: string;
  drivers: Driver[];
  vehicles: Vehicle[];
  canManage: boolean;
  canDelete: boolean;
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Активен",
  INVITED: "Приглашён",
  INACTIVE: "Неактивен",
};

export function DriverList({ organizationId, drivers, vehicles, canManage, canDelete }: DriverListProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(driverId: string, method: "PATCH" | "DELETE", body: object, successMessage: string) {
    setBusy(`${method}-${driverId}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Операция не выполнена.");
      setEditingId("");
      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Операция не выполнена.");
    } finally {
      setBusy("");
    }
  }

  async function updateDriver(event: FormEvent<HTMLFormElement>, driverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(driverId, "PATCH", {
      organizationId,
      displayName: form.get("display_name"),
      status: form.get("status"),
      assignedVehicleId: form.get("assigned_vehicle_id") || null,
    }, "Водитель обновлён.");
  }

  async function removeDriver(driver: Driver) {
    const ownerNote = driver.isOwnerDriver ? " Водительский режим владельца будет отключён." : "";
    if (!window.confirm(`Удалить водителя «${driver.displayName}»?${ownerNote} История рейсов и расходов сохранится.`)) return;
    await request(driver.id, "DELETE", { organizationId }, "Водитель удалён из рабочего списка.");
  }

  if (!drivers.length) return <ul className="entity-list driver-list"><li className="empty-state">Добавьте первого водителя формой выше.</li></ul>;

  return <>
    {error ? <p className="form-error driver-list-message" role="alert">{error}</p> : null}
    {message ? <p className="form-success driver-list-message" role="status">{message}</p> : null}
    <ul className="entity-list driver-list">{drivers.map((driver) => <li key={driver.id}>
      {editingId === driver.id ? <form className="driver-inline-edit" onSubmit={(event) => updateDriver(event, driver.id)}>
        <label><span>Имя водителя</span><input name="display_name" defaultValue={driver.displayName} minLength={2} maxLength={160} required /></label>
        <label><span>Статус</span><select name="status" defaultValue={driver.status}><option value="ACTIVE">Активен</option><option value="INVITED">Приглашён</option><option value="INACTIVE">Неактивен</option></select></label>
        <label><span>Закреплённый автомобиль</span><select name="assigned_vehicle_id" defaultValue={driver.assignedVehicleId ?? ""}><option value="">Не закреплён</option>{vehicles.filter((vehicle) => vehicle.status === "ACTIVE").map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.displayName} · {vehicle.plateNumber}</option>)}</select></label>
        <div className="driver-inline-actions">
          <button type="submit" className="tiny-button" disabled={busy === `PATCH-${driver.id}`}>{busy === `PATCH-${driver.id}` ? "Сохраняю…" : "Сохранить"}</button>
          <button type="button" className="tiny-button" onClick={() => setEditingId("")}>Отмена</button>
        </div>
      </form> : <>
        <span>{driver.displayName}{driver.isOwnerDriver ? <span className="owner-driver-mark">Вы</span> : null}<small>{driver.isOwnerDriver ? driver.telegramLinked ? "Ваш профиль · Telegram подключён" : "Ваш профиль владельца-водителя" : driver.telegramLinked ? "Telegram подключён" : driver.pendingInviteExpiresAt ? "Приглашение подготовлено" : "Ещё не приглашён"}{driver.assignedVehicleName ? ` · Авто: ${driver.assignedVehicleName}` : " · Авто не закреплено"}</small></span>
        <span className="driver-actions">
          <span className={`badge ${driver.telegramLinked ? "badge-connected" : ""}`}>{driver.telegramLinked ? "Подключён" : statusLabels[driver.status] ?? driver.status}</span>
          <span className="driver-item-buttons">
            {canManage && !driver.telegramLinked ? <DriverInviteButton driverId={driver.id} driverName={driver.displayName} pendingInviteExpiresAt={driver.pendingInviteExpiresAt} selfService={driver.isOwnerDriver} /> : null}
            {canManage ? <button type="button" className="tiny-button" onClick={() => { setEditingId(driver.id); setError(""); setMessage(""); }}>Изменить</button> : null}
            {canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `DELETE-${driver.id}`} onClick={() => void removeDriver(driver)}>{busy === `DELETE-${driver.id}` ? "Удаляю…" : "Удалить"}</button> : null}
          </span>
        </span>
      </>}
    </li>)}</ul>
  </>;
}
