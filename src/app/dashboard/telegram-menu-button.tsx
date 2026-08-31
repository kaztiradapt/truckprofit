"use client";

import { useState } from "react";

export function TelegramMenuButton({ organizationId }: { organizationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);

  async function configure() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/telegram/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json() as { configured?: boolean; error?: string };
      if (!response.ok || !payload.configured) throw new Error(payload.error ?? "Не удалось включить кнопку.");
      setConfigured(true);
      setMessage("Кнопка включена");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось включить кнопку.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sidebar-mini-app-control">
      <button className="sidebar-mini-app" type="button" onClick={configure} disabled={busy}>
        {busy ? "Настраиваю…" : configured ? "Кабинет в Telegram ✓" : "Кнопка Telegram"}
      </button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
