"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type AccessRoleView = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  systemCode: string | null;
};

export type StaffView = {
  id: string;
  displayName: string;
  email: string | null;
  telegramUsername: string | null;
  telegramLinked: boolean;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  accessRoleId: string | null;
  roleName: string;
  isOwner: boolean;
  isCoOwner: boolean;
};

const permissionOptions = [
  ["VIEW_DASHBOARD", "Обзор и рейсы"],
  ["VIEW_FINANCE", "Просмотр финансов"],
  ["MANAGE_VEHICLES", "Редактировать автомобили"],
  ["MANAGE_DRIVERS", "Редактировать водителей"],
  ["MANAGE_TRIPS", "Редактировать рейсы"],
  ["MANAGE_FINANCE", "Редактировать финансы"],
  ["REVIEW_EXPENSES", "Обрабатывать расходы водителей"],
  ["MANAGE_TEAM", "Управлять сотрудниками и ролями"],
  ["DELETE_RECORDS", "Удалять записи"],
] as const;

type InviteResult = { telegramLink: string | null; expiresAt: string | null; emailInvited: boolean; roleName: string };

function statusLabel(status: StaffView["status"]) {
  return status === "ACTIVE" ? "Активен" : status === "SUSPENDED" ? "Приостановлен" : "Приглашён";
}

export function TeamManagement({ organizationId, roles, staff, canManageCoOwners, canDeleteRecords }: { organizationId: string; roles: AccessRoleView[]; staff: StaffView[]; canManageCoOwners: boolean; canDeleteRecords: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const assignableRoles = canManageCoOwners ? roles : roles.filter((role) => role.systemCode !== "CO_OWNER");

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    setBusy("staff"); setError(""); setMessage(""); setInvite(null);
    const form = new FormData(targetForm);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          displayName: form.get("display_name"),
          email: form.get("email"),
          telegramUsername: form.get("telegram_username"),
          accessRoleId: form.get("access_role_id"),
        }),
      });
      const payload = await response.json() as InviteResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось добавить сотрудника.");
      setInvite(payload);
      setMessage(payload.emailInvited ? "Участник добавлен, письмо для входа отправлено." : "Участник добавлен.");
      targetForm.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить сотрудника.");
    } finally { setBusy(""); }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    setBusy("role"); setError(""); setMessage("");
    const form = new FormData(targetForm);
    try {
      const response = await fetch("/api/team/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: form.get("name"),
          permissions: form.getAll("permissions"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать роль.");
      setMessage("Новая роль создана.");
      targetForm.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать роль.");
    } finally { setBusy(""); }
  }

  async function updateStaff(event: FormEvent<HTMLFormElement>, staffId: string) {
    event.preventDefault();
    setBusy(staffId); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/team/${staffId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          displayName: form.get("display_name"),
          email: form.get("email"),
          telegramUsername: form.get("telegram_username"),
          accessRoleId: form.get("access_role_id"),
          status: form.get("status"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось обновить доступ.");
      setMessage("Доступ сотрудника обновлён.");
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить доступ.");
    } finally { setBusy(""); }
  }

  async function createTelegramLink(staffId: string) {
    setBusy(`invite-${staffId}`); setError(""); setMessage(""); setInvite(null);
    try {
      const response = await fetch(`/api/team/${staffId}/telegram-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json() as { link?: string | null; expiresAt?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать Telegram-ссылку.");
      setInvite({ telegramLink: payload.link ?? null, expiresAt: payload.expiresAt ?? null, emailInvited: false, roleName: "" });
      setMessage("Новая Telegram-ссылка готова.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать Telegram-ссылку.");
    } finally { setBusy(""); }
  }

  async function removeStaff(person: StaffView) {
    if (!window.confirm(`Удалить участника «${person.displayName}» из кабинета? Доступ будет отключён, запись останется в журнале.`)) return;
    setBusy(`delete-${person.id}`); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/team/${person.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось удалить сотрудника.");
      setMessage("Участник удалён из кабинета.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить участника.");
    } finally { setBusy(""); }
  }

  async function copyInvite() {
    if (!invite?.telegramLink) return;
    await navigator.clipboard.writeText(invite.telegramLink);
    setMessage("Ссылка скопирована — отправьте её сотруднику.");
  }

  return (
    <section className="team-management" id="team">
      <div className="start-intro"><p className="eyebrow">Роли и доступы</p><h2>Сотрудники и совладельцы</h2><p>Добавляйте участников по email, Telegram @тегу или обоим контактам. После START доступ закрепляется за Telegram ID; если @тег изменится, бот обновит его автоматически.</p></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {invite?.telegramLink ? <div className="team-invite-result"><b>Персональная Telegram-ссылка</b><code>{invite.telegramLink}</code><div><button type="button" className="tiny-button" onClick={copyInvite}>Скопировать</button><a className="telegram-share-link" href={`https://t.me/share/url?url=${encodeURIComponent(invite.telegramLink)}`} target="_blank" rel="noreferrer">Отправить</a></div></div> : null}

      <div className="team-management-grid">
        <form className="panel stack-form" onSubmit={addStaff}>
          <div><p className="eyebrow">Новый участник</p><h3>Пригласить в кабинет</h3></div>
          <label>Имя<input name="display_name" placeholder="Например: Алексей Иванов" required /></label>
          <label>Email<input type="email" name="email" placeholder="employee@company.kz" /></label>
          <label>Telegram @тег<input name="telegram_username" placeholder="@username" /></label>
          <label>Роль<select name="access_role_id" required defaultValue=""><option value="" disabled>Выберите роль</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <small className="muted">Email даёт вход в Mini App, @тег — доступ к боту. Для совладельца email обязателен. Совладелец управляет компанией, но не может изменить или удалить основного владельца и других совладельцев.</small>
          <button type="submit" disabled={busy === "staff" || !assignableRoles.length}>{busy === "staff" ? "Добавляю…" : "Добавить участника"}</button>
        </form>

        <form className="panel role-form" onSubmit={createRole}>
          <div><p className="eyebrow">Своя роль</p><h3>Настроить полномочия</h3></div>
          <label>Название<input name="name" placeholder="Например: Логист" required /></label>
          <div className="permission-grid">{permissionOptions.map(([code, label]) => <label className={code === "DELETE_RECORDS" ? "permission-danger" : ""} key={code}><input type="checkbox" name="permissions" value={code} defaultChecked={code === "VIEW_DASHBOARD"} disabled={code === "VIEW_DASHBOARD"} />{label}{code === "VIEW_DASHBOARD" ? <input type="hidden" name="permissions" value={code} /> : null}</label>)}</div>
          <small className="muted">Удаление и управление командой выдаются отдельно. Системные роли защищены от изменения.</small>
          <button type="submit" disabled={busy === "role"}>{busy === "role" ? "Создаю…" : "Создать роль"}</button>
        </form>
      </div>

      <article className="panel team-roster">
        <div className="panel-title"><div><p className="eyebrow">Команда</p><h3>{staff.length} участник(а)</h3></div><span>Доступ и Telegram</span></div>
        <ul className="entity-list">{staff.map((person) => <li key={person.id} className="staff-row">
          {editingId === person.id && !person.isOwner && (!person.isCoOwner || canManageCoOwners) ? <form className="staff-edit-form" onSubmit={(event) => updateStaff(event, person.id)}>
            <input name="display_name" defaultValue={person.displayName} required />
            <input type="email" name="email" defaultValue={person.email ?? ""} placeholder="employee@company.kz" />
            <input name="telegram_username" defaultValue={person.telegramUsername ? `@${person.telegramUsername}` : ""} placeholder="@username" />
            <select name="access_role_id" defaultValue={person.accessRoleId ?? ""} required>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
            <select name="status" defaultValue={person.status}><option value="ACTIVE">Активен</option><option value="INVITED">Приглашён</option><option value="SUSPENDED">Приостановлен</option></select>
            <div><button type="submit" className="tiny-button" disabled={busy === person.id}>Сохранить</button><button type="button" className="tiny-button" onClick={() => setEditingId(null)}>Отмена</button></div>
          </form> : <>
            <span><b>{person.displayName}{person.isOwner ? <span className="owner-driver-mark">Основной владелец</span> : person.isCoOwner ? <span className="owner-driver-mark">Совладелец</span> : null}</b><small>{person.email ?? "без email"} · {person.telegramUsername ? `@${person.telegramUsername}` : "без Telegram-тега"} · {person.telegramLinked ? "Telegram ID подтверждён" : "Telegram не подтверждён"}</small></span>
            <span className="staff-actions"><span className="badge">{person.roleName} · {statusLabel(person.status)}</span>{!person.isOwner && (!person.isCoOwner || canManageCoOwners) ? <div><button type="button" className="tiny-button" onClick={() => setEditingId(person.id)}>Изменить</button>{person.telegramUsername && !person.telegramLinked ? <button type="button" className="tiny-button" disabled={busy === `invite-${person.id}`} onClick={() => createTelegramLink(person.id)}>{busy === `invite-${person.id}` ? "Готовлю…" : "Telegram-ссылка"}</button> : null}{canDeleteRecords ? <button type="button" className="tiny-button danger-button" disabled={busy === `delete-${person.id}`} onClick={() => removeStaff(person)}>Удалить</button> : null}</div> : null}</span>
          </>}
        </li>)}</ul>
      </article>
    </section>
  );
}
