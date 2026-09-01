"use client";

import { useState } from "react";

type OwnerLink = { expiresAt: string; link: string | null; error?: string };

function openTelegram(link: string) {
  const telegramWebApp = window.Telegram?.WebApp;
  if (telegramWebApp?.openTelegramLink) {
    telegramWebApp.openTelegramLink(link);
    return;
  }
  window.location.assign(link);
}

export function OwnerTelegramConnectButton({ organizationId, linked }: { organizationId: string; linked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/telegram/owner-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json() as OwnerLink;
      if (!response.ok) throw new Error(payload.error ?? "Не удалось подключить Telegram.");
      if (!payload.link) throw new Error("Бот временно недоступен. Попробуйте ещё раз.");
      openTelegram(payload.link);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось подключить Telegram.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="owner-telegram-control">
      <button className={linked ? "button-secondary" : "primary-action"} type="button" onClick={connect} disabled={linked || busy}>
        {linked ? "Telegram владельца подключён ✓" : busy ? "Подключаю…" : "Подключить мой Telegram"}
      </button>
      <small>{linked ? "Сводка и управление доступны в чате с ботом." : "Откроется бот — нажмите START один раз."}</small>
      {message ? <span className="inline-error">{message}</span> : null}
    </div>
  );
}
