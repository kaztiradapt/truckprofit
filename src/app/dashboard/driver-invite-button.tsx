"use client";

import { useState } from "react";

type Invitation = { driverName: string; expiresAt: string; token: string; link: string | null };

export function DriverInviteButton({ driverId }: { driverId: string }) {
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("");

  async function createInvitation() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drivers/${driverId}/telegram-link`, { method: "POST" });
      const payload = await response.json() as Invitation & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать ссылку.");
      setInvitation(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать ссылку.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvitation() {
    if (!invitation) return;
    await navigator.clipboard.writeText(invitation.link ?? invitation.token);
    setMessage("Ссылка скопирована.");
  }

  if (invitation) {
    return (
      <div className="driver-invite-result">
        {invitation.link ? (
          <a className="telegram-open-link" href={invitation.link} target="_blank" rel="noreferrer">
            Открыть Telegram
          </a>
        ) : null}
        <code>{invitation.link ?? invitation.token}</code>
        <button type="button" className="tiny-button" onClick={copyInvitation}>Скопировать ссылку</button>
        <small>Действует до {new Intl.DateTimeFormat("ru-KZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(invitation.expiresAt))}</small>
        {message ? <span className="inline-message">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="driver-invite-control">
      <button type="button" className="tiny-button" disabled={busy} onClick={createInvitation}>
        {busy ? "Создаю…" : "Ссылка Telegram"}
      </button>
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  );
}
