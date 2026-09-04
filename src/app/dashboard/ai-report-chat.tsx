"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  status: "ANSWER" | "OUT_OF_SCOPE" | "INSUFFICIENT_DATA" | "ERROR";
  createdAt: string;
  evidence?: string[];
};

type ChatResponse = {
  status: ChatMessage["status"];
  answer: string;
  evidence: string[];
  error?: string;
  failureReason?: string;
};

const suggestions = [
  "Какая машина принесла больше прибыли?",
  "Сравни расходы по водителям",
  "Что ухудшилось за последние месяцы?",
  "Каких данных не хватает для точного отчёта?",
];

function makeTemporaryMessage(role: ChatMessage["role"], content: string, status: ChatMessage["status"] = "ANSWER"): ChatMessage {
  return { id: `temporary-${role}-${Date.now()}-${Math.random()}`, role, content, status, createdAt: new Date().toISOString() };
}

export function AiReportChat({ organizationId, driverId, vehicleId, tripStatus, dateFrom, dateTo }: {
  organizationId: string;
  driverId: string;
  vehicleId: string;
  tripStatus: string;
  dateFrom: string;
  dateTo: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const response = await fetch(`/api/reports/ai-chat?organizationId=${encodeURIComponent(organizationId)}`);
        const payload = await response.json() as { messages?: ChatMessage[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить историю.");
        if (active) setMessages(payload.messages ?? []);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Не удалось загрузить историю.");
      } finally {
        if (active) setLoadingHistory(false);
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [busy, messages]);

  async function ask(event?: FormEvent, suggestedQuestion?: string) {
    event?.preventDefault();
    const message = (suggestedQuestion ?? question).trim();
    if (message.length < 2 || busy) return;
    setQuestion("");
    setError("");
    setBusy(true);
    setMessages((current) => [...current, makeTemporaryMessage("USER", message)]);
    try {
      const response = await fetch("/api/reports/ai-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          message,
          filters: { driverId, vehicleId, tripStatus, dateFrom, dateTo },
        }),
      });
      const payload = await response.json() as ChatResponse;
      if (!response.ok) throw new Error(payload.error ?? "ИИ‑помощник временно не ответил.");
      setMessages((current) => [...current, {
        ...makeTemporaryMessage("ASSISTANT", payload.answer, payload.status),
        evidence: payload.evidence,
      }]);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "ИИ‑помощник временно не ответил.";
      setError(messageText);
      setMessages((current) => [...current, makeTemporaryMessage("ASSISTANT", messageText, "ERROR")]);
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!messages.length) return;
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setError("");
    const response = await fetch(`/api/reports/ai-chat?organizationId=${encodeURIComponent(organizationId)}`, { method: "DELETE" });
    if (response.ok) setMessages([]);
    else setError("Не удалось очистить историю.");
    setConfirmingClear(false);
  }

  return <section className="ai-report-chat" aria-label="ИИ-помощник TruckProfit">
    <div className="ai-chat-heading">
      <div>
        <p className="eyebrow">Закрытый помощник</p>
        <h3>Спросить ИИ о компании</h3>
        <p>Отвечает только по данным и функциям TruckProfit. Внешние и посторонние темы, например погода и новости, недоступны.</p>
      </div>
      {messages.length ? <button type="button" className={`tiny-button clear-chat-button${confirmingClear ? " confirming" : ""}`} onClick={clearHistory} disabled={busy}>{confirmingClear ? "Подтвердить удаление" : "Очистить чат"}</button> : null}
    </div>

    <div className="ai-chat-scope"><span aria-hidden="true">🔒</span><p><b>Текущая область:</b> выбранные выше период, водитель, автомобиль и статус рейса. Для ответа обработчику OpenAI передаются вопрос, финансовые агрегаты и рабочие названия из отчёта с отключённым хранением ответа. Чеки, контакты, Telegram‑ID, адреса и геопозиции не передаются.</p></div>

    <div className="ai-chat-messages" aria-live="polite">
      {loadingHistory ? <p className="ai-chat-empty">Загружаю историю…</p> : null}
      {!loadingHistory && !messages.length ? <div className="ai-chat-empty"><b>Задайте вопрос своими словами</b><span>Например, сравните прибыльность машин или спросите, почему выросли расходы.</span></div> : null}
      {messages.map((message) => <article className={`ai-chat-message ${message.role.toLocaleLowerCase()} status-${message.status.toLocaleLowerCase()}`} key={message.id}>
        <small>{message.role === "USER" ? "Вы" : message.status === "OUT_OF_SCOPE" ? "Вне области TruckProfit" : message.status === "INSUFFICIENT_DATA" ? "Недостаточно данных" : "ИИ‑помощник"}</small>
        <p>{message.content}</p>
        {message.evidence?.length ? <ul>{message.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      </article>)}
      {busy ? <article className="ai-chat-message assistant pending"><small>ИИ‑помощник</small><p><span className="ai-chat-dots">Анализирую данные TruckProfit…</span></p></article> : null}
      <div ref={endRef} />
    </div>

    {!messages.length ? <div className="ai-chat-suggestions" aria-label="Примеры вопросов">
      {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(undefined, suggestion)} disabled={busy || loadingHistory}>{suggestion}</button>)}
    </div> : null}

    <form className="ai-chat-form" onSubmit={(event) => void ask(event)}>
      <label htmlFor="ai-chat-question">Ваш вопрос</label>
      <div>
        <textarea id="ai-chat-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={800} rows={2} placeholder="Например: какая машина была самой прибыльной за период?" disabled={busy} />
        <button type="submit" disabled={busy || question.trim().length < 2}>{busy ? "Отвечаю…" : "Отправить"}</button>
      </div>
      <small>{question.length}/800 · Помощник ничего не изменяет в учёте.</small>
    </form>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
