"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Vehicle = { id: string; displayName: string; plateNumber: string; makeModel: string | null; fuelNorm: number | null; status: string };

const statusLabels: Record<string, string> = { ACTIVE: "Активна", INACTIVE: "Неактивна", MAINTENANCE: "На ремонте", ARCHIVED: "В архиве" };

export function VehicleList({ organizationId, vehicles, canManage, canDelete }: { organizationId: string; vehicles: Vehicle[]; canManage: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(vehicleId: string, method: "PATCH" | "DELETE", body: object, successMessage: string) {
    setBusy(`${method}-${vehicleId}`); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Операция не выполнена.");
      setEditingId(""); setMessage(successMessage); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Операция не выполнена.");
    } finally { setBusy(""); }
  }

  async function updateVehicle(event: FormEvent<HTMLFormElement>, vehicleId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fuelNormText = String(form.get("fuel_norm") ?? "").trim().replace(",", ".");
    await request(vehicleId, "PATCH", {
      organizationId,
      displayName: form.get("display_name"),
      plateNumber: form.get("plate_number"),
      makeModel: form.get("make_model"),
      fuelNorm: fuelNormText ? Number(fuelNormText) : null,
      status: form.get("status"),
    }, "Автомобиль обновлён.");
  }

  async function removeVehicle(vehicle: Vehicle) {
    if (!window.confirm(`Удалить автомобиль «${vehicle.displayName}»? История рейсов и расходов сохранится.`)) return;
    await request(vehicle.id, "DELETE", { organizationId }, "Автомобиль удалён из рабочего списка.");
  }

  if (!vehicles.length) return <ul className="entity-list"><li className="empty-state">Нет добавленных машин.</li></ul>;
  return <>
    {error ? <p className="form-error list-action-message" role="alert">{error}</p> : null}
    {message ? <p className="form-success list-action-message" role="status">{message}</p> : null}
    <ul className="entity-list vehicle-manage-list">{vehicles.map((vehicle) => <li key={vehicle.id}>
      {editingId === vehicle.id ? <form className="record-edit-form vehicle-inline-edit" onSubmit={(event) => updateVehicle(event, vehicle.id)}>
        <label>Название<input name="display_name" defaultValue={vehicle.displayName} required /></label>
        <label>Госномер<input name="plate_number" defaultValue={vehicle.plateNumber} required /></label>
        <label>Марка и модель<input name="make_model" defaultValue={vehicle.makeModel ?? ""} /></label>
        <label>Норма топлива<input name="fuel_norm" inputMode="decimal" defaultValue={vehicle.fuelNorm ?? ""} /></label>
        <label>Статус<select name="status" defaultValue={vehicle.status}><option value="ACTIVE">Активна</option><option value="INACTIVE">Неактивна</option><option value="MAINTENANCE">На ремонте</option></select></label>
        <div className="record-edit-actions"><button type="submit" className="tiny-button" disabled={busy === `PATCH-${vehicle.id}`}>{busy === `PATCH-${vehicle.id}` ? "Сохраняю…" : "Сохранить"}</button><button type="button" className="tiny-button" onClick={() => setEditingId("")}>Отмена</button></div>
      </form> : <><span>{vehicle.displayName}<small>{vehicle.plateNumber}{vehicle.makeModel ? ` · ${vehicle.makeModel}` : ""}</small></span><span className="entity-manage-actions"><span className="badge">{statusLabels[vehicle.status] ?? vehicle.status}</span>{canManage ? <button type="button" className="tiny-button" onClick={() => setEditingId(vehicle.id)}>Изменить</button> : null}{canDelete ? <button type="button" className="tiny-button danger-button" disabled={busy === `DELETE-${vehicle.id}`} onClick={() => void removeVehicle(vehicle)}>{busy === `DELETE-${vehicle.id}` ? "Удаляю…" : "Удалить"}</button> : null}</span></>}
    </li>)}</ul>
  </>;
}
