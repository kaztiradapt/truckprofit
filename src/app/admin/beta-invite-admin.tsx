"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { DeviceDateTime } from "@/app/dashboard/device-date-time";

export type BetaInviteListItem = {
  id: string;
  invite_type: "EMAIL" | "TELEGRAM";
  email: string | null;
  telegram_username: string | null;
  telegram_username_last: string | null;
  display_name: string | null;
  status: "PENDING" | "CLAIMED" | "RESERVED" | "USED" | "REVOKED";
  expires_at: string;
  claimed_at: string | null;
  reserved_at: string | null;
  used_at: string | null;
  used_organization_id: string | null;
  note: string | null;
  created_at: string;
};

type CreatedInvitation = {
  id: string;
  expiresAt: string;
  emailSent: boolean;
  telegramLink: string | null;
};

const statusLabels: Record<BetaInviteListItem["status"] | "EXPIRED", string> = {
  PENDING: "Ожидает подтверждения",
  CLAIMED: "Telegram подтверждён",
  RESERVED: "Доступ зарезервирован",
  USED: "Компания создана",
  REVOKED: "Отозвано",
  EXPIRED: "Истекло",
};

function actualStatus(invite: BetaInviteListItem): keyof typeof statusLabels {
  return invite.status !== "USED" && invite.status !== "REVOKED" && new Date(invite.expires_at).getTime() <= Date.now()
    ? "EXPIRED"
    : invite.status;
}

export function BetaInviteAdmin({ initialInvites }: { initialInvites: BetaInviteListItem[] }) {
  const router = useRouter();
  const [type, setType] = useState<"EMAIL" | "TELEGRAM">("EMAIL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const activeCount = useMemo(() => initialInvites.filter((invite) => ["PENDING", "CLAIMED", "RESERVED"].includes(actualStatus(invite))).length, [initialInvites]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData(formElement);
    const response = await fetch("/api/admin/beta-invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        contact: form.get("contact"),
        displayName: form.get("display_name"),
        expiresInDays: form.get("expires_in_days"),
        note: form.get("note"),
      }),
    });
    const payload = await response.json().catch(() => ({})) as CreatedInvitation & { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "Не удалось создать приглашение.");
      return;
    }
    setResult(payload);
    formElement.reset();
    router.refresh();
  }

  async function copyTelegramLink() {
    if (!result?.telegramLink) return;
    await navigator.clipboard.writeText(result.telegramLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function revoke(id: string) {
    if (!window.confirm("Отозвать это приглашение? Ссылка перестанет работать.")) return;
    const response = await fetch(`/api/admin/beta-invites/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "REVOKED" }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Не удалось отозвать приглашение.");
      return;
    }
    router.refresh();
  }

  return <>
    <section className="beta-admin-grid">
      <form className="beta-invite-form" onSubmit={submit}>
        <div className="beta-section-heading">
          <div><p className="eyebrow">Новое приглашение</p><h2>Кому открыть доступ</h2></div>
          <span>{activeCount} активных</span>
        </div>
        <fieldset className="beta-type-choice">
          <legend>Способ приглашения</legend>
          <label><input checked={type === "EMAIL"} name="type" onChange={() => setType("EMAIL")} type="radio" /> Email</label>
          <label><input checked={type === "TELEGRAM"} name="type" onChange={() => setType("TELEGRAM")} type="radio" /> Telegram @тег</label>
        </fieldset>
        <label>{type === "EMAIL" ? "Email владельца" : "Telegram-тег владельца"}
          <input key={type} name="contact" type={type === "EMAIL" ? "email" : "text"} placeholder={type === "EMAIL" ? "owner@company.kz" : "@owner_example"} required />
        </label>
        <label>Имя владельца <small>необязательно</small><input name="display_name" placeholder="Например: Алексей" /></label>
        <label>Срок действия, дней<input defaultValue="14" max="90" min="1" name="expires_in_days" type="number" required /></label>
        <label>Заметка <small>видна только администраторам</small><textarea maxLength={500} name="note" placeholder="Компания, источник обращения или договорённость" /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button disabled={busy} type="submit">{busy ? "Создаём…" : type === "EMAIL" ? "Отправить приглашение" : "Создать Telegram-ссылку"}</button>
      </form>

      <aside className="beta-flow-card">
        <p className="eyebrow">Как работает доступ</p>
        <h2>{type === "EMAIL" ? "Приглашение по email" : "Приглашение по Telegram"}</h2>
        {type === "EMAIL" ? <ol>
          <li>Пользователь получает письмо от TruckProfit.</li>
          <li>Устанавливает пароль и входит в кабинет.</li>
          <li>Создаёт одну компанию — приглашение закрывается.</li>
        </ol> : <ol>
          <li>Отправьте персональную ссылку указанному @аккаунту.</li>
          <li>Пользователь нажимает START; бот сверяет тег и запоминает Telegram ID.</li>
          <li>Бот выдаёт кнопку регистрации. После создания компании ссылка закрывается.</li>
        </ol>}
        <p>Смена @тега после подтверждения не отнимет доступ: учётная запись закрепляется за неизменяемым Telegram ID.</p>
      </aside>
    </section>

    {result ? <section className="beta-result" role="status">
      {result.emailSent ? <><b>Письмо отправлено.</b><span>Доступ уже зарезервирован за этим email.</span></> : result.telegramLink ? <>
        <b>Telegram-ссылка готова.</b>
        <span>Отправьте её только приглашённому владельцу. Ссылка содержит секретный одноразовый код.</span>
        <div><input aria-label="Telegram-ссылка" readOnly value={result.telegramLink} /><button onClick={copyTelegramLink} type="button">{copied ? "Скопировано" : "Копировать"}</button></div>
      </> : <><b>Приглашение создано.</b><span>Telegram-бот пока не настроен — отзовите приглашение и проверьте токен бота.</span></>}
    </section> : null}

    <section className="beta-invite-list">
      <div className="beta-section-heading"><div><p className="eyebrow">Журнал доступа</p><h2>Приглашения</h2></div><span>{initialInvites.length} всего</span></div>
      {initialInvites.length ? <div className="beta-table-wrap"><table>
        <thead><tr><th>Контакт</th><th>Статус</th><th>Создано / срок</th><th>Заметка</th><th /></tr></thead>
        <tbody>{initialInvites.map((invite) => {
          const status = actualStatus(invite);
          const contact = invite.invite_type === "EMAIL" ? invite.email : invite.telegram_username;
          const canRevoke = ["PENDING", "CLAIMED", "RESERVED"].includes(invite.status);
          return <tr key={invite.id}>
            <td><b>{invite.invite_type === "TELEGRAM" ? "@" : ""}{contact}</b><small>{invite.display_name ?? (invite.invite_type === "EMAIL" ? "Email" : "Telegram")}</small></td>
            <td><span className={`beta-status ${status.toLowerCase()}`}>{statusLabels[status]}</span></td>
            <td><small>Создано: <DeviceDateTime value={invite.created_at} /></small><small>До: <DeviceDateTime value={invite.expires_at} /></small></td>
            <td><span>{invite.note || "—"}</span></td>
            <td>{canRevoke ? <button className="tiny-button subtle" onClick={() => revoke(invite.id)} type="button">Отозвать</button> : null}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="beta-empty">Приглашений пока нет.</p>}
    </section>
  </>;
}
