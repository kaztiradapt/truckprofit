"use client";

import { useState, type MouseEvent } from "react";
import { DeviceDateTime } from "./device-date-time";

type Invitation = { driverName: string; expiresAt: string; token: string; link: string | null };

export function DriverInviteButton({ driverId, driverName, pendingInviteExpiresAt, selfService = false }: { driverId: string; driverName: string; pendingInviteExpiresAt: string | null; selfService?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("");

  function openTelegram(link: string) {
    const telegramWebApp = window.Telegram?.WebApp;
    if (telegramWebApp?.openTelegramLink) {
      telegramWebApp.openTelegramLink(link);
      return;
    }
    window.location.assign(link);
  }

  async function createInvitation(openForSelf = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drivers/${driverId}/telegram-link`, { method: "POST" });
      const payload = await response.json() as Invitation & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать ссылку.");
      setInvitation(payload);
      if (openForSelf && payload.link) openTelegram(payload.link);
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
        <span className="invite-ready">{selfService ? "Подключение готово" : "Приглашение готово"}</span>
        {selfService && invitation.link ? (
          <a className="telegram-share-link" href={invitation.link} onClick={(event) => { event.preventDefault(); openTelegram(invitation.link!); }}>
            Открыть моего бота
          </a>
        ) : shareUrl ? (
          <a className="telegram-share-link" href={shareUrl} target="_blank" rel="noreferrer" onClick={(event) => shareInvitation(event, shareUrl)}>
            Отправить водителю
          </a>
        ) : null}
        {!selfService ? <code>{inviteUrl}</code> : null}
        <div className="invite-buttons">{!selfService ? <button type="button" className="tiny-button" onClick={copyInvitation}>Скопировать</button> : null}<button type="button" className="tiny-button" onClick={() => createInvitation(false)} disabled={busy}>{busy ? "Обновляю…" : selfService ? "Обновить подключение" : "Новая ссылка"}</button></div>
        <small>Действует до <DeviceDateTime value={invitation.expiresAt} /></small>
        {message ? <span className="inline-message">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="driver-invite-control">
      <button type="button" className="tiny-button" disabled={busy} onClick={() => createInvitation(selfService)}>
        {busy ? "Подключаю…" : selfService ? "Подключить мой Telegram" : pendingInviteExpiresAt ? "Создать новую ссылку" : "Создать приглашение"}
      </button>
      {selfService ? <small>Откроется бот — останется нажать START.</small> : pendingInviteExpiresAt ? <small>Есть активное до <DeviceDateTime value={pendingInviteExpiresAt} /></small> : null}
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  );
}
