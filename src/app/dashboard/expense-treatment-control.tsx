"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { ExpenseBehavior } from "@/domain/reports/management-report";

const behaviorLabels: Record<ExpenseBehavior, string> = {
  VARIABLE: "Переменный",
  FIXED: "Постоянный",
  RESERVE: "Резерв / норматив",
  ONE_OFF: "Разовый",
  CAPITAL: "Капитальный",
};

export function ExpenseTreatmentControl({ expenseId, organizationId, initialBehavior, initialIncluded }: {
  expenseId: string;
  organizationId: string;
  initialBehavior: ExpenseBehavior;
  initialIncluded: boolean;
}) {
  const router = useRouter();
  const [behavior, setBehavior] = useState(initialBehavior);
  const [included, setIncluded] = useState(initialIncluded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, costBehavior: behavior, includeInNormalizedCost: included }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить.");
    } finally { setBusy(false); }
  }

  return <details className="expense-treatment">
    <summary>{behaviorLabels[behavior]}{!included ? " · вне нормы" : ""}</summary>
    <form onSubmit={submit}>
      <label>Тип затрат<select value={behavior} onChange={(event) => {
        const next = event.target.value as ExpenseBehavior;
        setBehavior(next);
        if (next === "ONE_OFF" || next === "CAPITAL") setIncluded(false);
      }}><option value="VARIABLE">Переменный</option><option value="FIXED">Постоянный</option><option value="RESERVE">Резерв / норматив</option><option value="ONE_OFF">Разовый</option><option value="CAPITAL">Капитальный</option></select></label>
      <label className="expense-normalized-choice"><input type="checkbox" checked={included} onChange={(event) => setIncluded(event.target.checked)} />Учитывать в нормальной себестоимости</label>
      <button type="submit" className="tiny-button" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  </details>;
}

