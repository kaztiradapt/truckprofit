"use client";

import { useState } from "react";

export function ReportExportControls({ filters, disabled }: { filters: Record<string, string>; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function download(format: "csv" | "pdf", telegramOnly = false) {
    setBusy(true); setMessage(""); setFailed(false);
    const parameters = { ...filters, format, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const telegram = telegramOnly || Boolean(window.Telegram?.WebApp?.initData);
    try {
      const response = await fetch(telegram ? "/api/reports/export" : `/api/reports/export?${new URLSearchParams(parameters)}`, telegram
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parameters) }
        : { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Не удалось получить отчёт.");
      }
      if (telegram) {
        const payload = await response.json() as { message: string };
        setMessage(payload.message);
      } else {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `TruckProfit-report-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setMessage("Файл подготовлен. Если браузер не сохранил его, воспользуйтесь кнопкой «В Telegram».");
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Ошибка получения отчёта.");
    } finally { setBusy(false); }
  }

  return <div className="report-export-controls">
    <div className="report-export-actions">
      <button className="button-secondary" type="button" disabled={disabled || busy} onClick={() => void download("pdf")}>Скачать PDF</button>
      <button type="button" disabled={disabled || busy} onClick={() => void download("csv")}>Скачать CSV</button>
      <button className="button-secondary" type="button" disabled={disabled || busy} onClick={() => void download("pdf", true)}>PDF в Telegram</button>
      <button className="button-secondary" type="button" disabled={disabled || busy} onClick={() => void download("csv", true)}>CSV в Telegram</button>
    </div>
    {busy ? <p role="status">Формируем полный отчёт…</p> : null}
    {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
  </div>;
}
