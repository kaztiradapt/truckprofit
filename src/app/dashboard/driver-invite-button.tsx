"use client";

import { useState, type MouseEvent } from "react";

type Invitation = { driverName: string; expiresAt: string; token: string; link: string | null };

function expiryLabel(value: string) {
  return new Intl.DateTimeFormat("ru-KZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function DriverInviteButton({ driverId, driverName, pendingInviteExpiresAt }: { driverId: string; driverName: string; pendingInviteExpiresAt: string | null }) {
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

  function shareInvitation(event: MouseEvent<HTMLAnchorElement>, shareUrl: string) {
    const telegramWebApp = window.Telegram?.WebApp;
    if (!telegramWebApp?.openTelegramLink) return;
    event.preventDefault();
    telegramWebApp.openTelegramLink(shareUrl);
    setMessage("Выберите водителя в Telegram и отправьте сообщение.");
  }

  if (invitation) {
    const inviteUrl = invitation.link ?? invitation.token;
    const shareText = `Здравствуйте, ${driverName}. Это персональное приглашение в TruckProfit. Откройте ссылку и нажмите START, чтобы подключить Telegram к вашему профилю водителя.`;
    const shareUrl = invitation.link ? `https://t.me/share/url?url=${encodeURIComponent(invitation.link)}&text=${encodeURIComponent(shareText)}` : null;
    return (
      <div className="driver-invite-result">
        <span className="invite-ready">Приглашение готово</span>
        {shareUrl ? (
          <a className="telegram-share-link" href={shareUrl} target="_blank" rel="noreferrer" onClick={(event) => shareInvitation(event, shareUrl)}>
            Отправить водителю
          </a>
        ) : null}
        <code>{inviteUrl}</code>
        <div className="invite-buttons"><button type="button" className="tiny-button" onClick={copyInvitation}>Скопировать</button><button type="button" className="tiny-button" onClick={createInvitation} disabled={busy}>{busy ? "Обновляю…" : "Новая ссылка"}</button></div>
        <small>Действует до {expiryLabel(invitation.expiresAt)}</small>
        {message ? <span className="inline-message">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="driver-invite-control">
      <button type="button" className="tiny-button" disabled={busy} onClick={createInvitation}>
        {busy ? "Создаю…" : pendingInviteExpiresAt ? "Создать новую ссылку" : "Создать приглашение"}
      </button>
      {pendingInviteExpiresAt ? <small>Есть активное до {expiryLabel(pendingInviteExpiresAt)}</small> : null}
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  );
}
