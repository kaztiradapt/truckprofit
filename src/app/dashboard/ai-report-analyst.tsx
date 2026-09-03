"use client";

import { useState } from "react";

type SignalSeverity = "POSITIVE" | "INFO" | "WARNING" | "CRITICAL";

type AnalysisResponse = {
  summary: string;
  insights: Array<{ signalId: string; title: string; explanation: string; checks: string[] }>;
  dataQuality: string;
  signals: Array<{ id: string; severity: SignalSeverity }>;
  mode: "AI" | "RULES";
  model: string | null;
  generatedAt: string;
  cached: boolean;
  fallbackReason?: "NOT_CONFIGURED" | "TIMEOUT" | "AUTH" | "QUOTA" | "MODEL" | "UPSTREAM" | "INVALID_RESPONSE" | null;
  period: { start: string; end: string };
  comparisonPeriod: { start: string; end: string };
  currentMetrics: {
    trips: number;
    totalKm: number;
    fuelLiters: number;
    fuelPer100Km: number | null;
    emptyMileagePct: number | null;
  };
};

const fallbackLabels: Record<NonNullable<AnalysisResponse["fallbackReason"]>, string> = {
  NOT_CONFIGURED: "API‑ключ модели не подключён.",
  TIMEOUT: "Модель не успела ответить; показаны точные расчётные сигналы.",
  AUTH: "Ключ OpenAI не принят. Проверьте ключ проекта.",
  QUOTA: "OpenAI отклонил запрос по балансу или лимиту проекта.",
  MODEL: "Выбранная модель недоступна этому API‑проекту.",
  UPSTREAM: "Сервис модели временно недоступен.",
  INVALID_RESPONSE: "Ответ модели не прошёл безопасную проверку формата.",
};

const severityLabels: Record<SignalSeverity, string> = {
  POSITIVE: "Улучшение",
  INFO: "Справка",
  WARNING: "Обратите внимание",
  CRITICAL: "Требует проверки",
};

function formatPeriod(period: { start: string; end: string }) {
  const format = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
  return `${format(period.start)} — ${format(period.end)}`;
}

export function AiReportAnalyst({ organizationId, driverId, vehicleId, tripStatus, dateFrom, dateTo }: {
  organizationId: string;
  driverId: string;
  vehicleId: string;
  tripStatus: string;
  dateFrom: string;
  dateTo: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  async function runAnalysis() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reports/ai-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, driverId, vehicleId, tripStatus, dateFrom, dateTo }),
      });
      const payload = await response.json() as AnalysisResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось проанализировать отчёт.");
      setAnalysis(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось проанализировать отчёт.");
    } finally {
      setBusy(false);
    }
  }

  const severityBySignal = new Map(analysis?.signals.map((signal) => [signal.id, signal.severity]) ?? []);

  return <section className="ai-report-analyst" aria-live="polite">
    <div className="ai-report-heading">
      <div><p className="eyebrow">Управленческая справка</p><h3>ИИ‑аналитик отчёта</h3><p>Система сама считает отклонения, а ИИ кратко объясняет, на что обратить внимание и что проверить.</p></div>
      <button type="button" onClick={runAnalysis} disabled={busy}>{busy ? "Анализирую…" : analysis ? "Обновить анализ" : "Проанализировать отчёт"}</button>
    </div>
    {!analysis && !error ? <div className="ai-report-placeholder"><span>✦</span><p>Будут проверены топливо, стоимость километра, порожний пробег, ремонты и прибыльность — по текущим фильтрам отчёта.</p></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {analysis ? <>
      <div className="ai-report-summary">
        <div><b>{analysis.summary}</b><small>Период: {formatPeriod(analysis.period)} · сравнение: {formatPeriod(analysis.comparisonPeriod)}</small></div>
        <span className={`ai-mode ${analysis.mode.toLocaleLowerCase()}`}>{analysis.mode === "AI" ? "ИИ + расчёты" : "Расчётные правила"}</span>
      </div>
      <div className="ai-report-metrics">
        <span><small>Рейсы</small><b>{analysis.currentMetrics.trips}</b></span>
        <span><small>Пробег</small><b>{Math.round(analysis.currentMetrics.totalKm).toLocaleString("ru-RU")} км</b></span>
        <span><small>Топливо</small><b>{analysis.currentMetrics.fuelLiters.toLocaleString("ru-RU")} л</b></span>
        <span><small>Расход</small><b>{analysis.currentMetrics.fuelPer100Km === null ? "—" : `${analysis.currentMetrics.fuelPer100Km} л/100 км`}</b></span>
      </div>
      <div className="ai-insight-grid">{analysis.insights.map((insight) => {
        const severity = severityBySignal.get(insight.signalId) ?? "INFO";
        return <article className={`ai-insight ${severity.toLocaleLowerCase()}`} key={insight.signalId}>
          <span>{severityLabels[severity]}</span>
          <h4>{insight.title}</h4>
          <p>{insight.explanation}</p>
          {insight.checks.length ? <ul>{insight.checks.map((check) => <li key={check}>{check}</li>)}</ul> : null}
        </article>;
      })}</div>
      <p className="ai-data-quality"><b>Качество данных:</b> {analysis.dataQuality}</p>
      <small className="ai-report-footnote">Справка не изменяет учётные записи. {analysis.cached ? "Показан сохранённый анализ." : "Анализ сформирован сейчас."}{analysis.mode === "RULES" ? ` ${analysis.fallbackReason ? fallbackLabels[analysis.fallbackReason] : "Подключение модели временно недоступно, точные расчётные сигналы сохранены."}` : ""}</small>
    </> : null}
  </section>;
}
