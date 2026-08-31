export type ExpenseWizardStep =
  | "CATEGORY"
  | "AMOUNT"
  | "FUEL_LITRES"
  | "ODOMETER"
  | "CONFIRM";

export type ExpenseWizardDraft = {
  tripId: string;
  categoryCode?: string;
  amountMinor?: number;
  currency: string;
  fuelLitres?: number;
  odometerKm?: number;
};

export type ExpenseWizardState = {
  step: ExpenseWizardStep;
  draft: ExpenseWizardDraft;
};

export type ExpenseWizardResult =
  | { kind: "NEXT"; state: ExpenseWizardState; prompt: string }
  | { kind: "CONFIRM"; state: ExpenseWizardState; prompt: string }
  | { kind: "ERROR"; state: ExpenseWizardState; prompt: string };

const supportedCategories = new Set(["FUEL", "TOLL", "REPAIR", "PARKING", "DAILY_ALLOWANCE", "OTHER"]);

function parsePositiveNumber(value: string): number | null {
  const result = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function beginExpenseWizard(tripId: string, currency = "KZT"): ExpenseWizardResult {
  return {
    kind: "NEXT",
    state: { step: "CATEGORY", draft: { tripId, currency } },
    prompt: "Выберите категорию: топливо, дорога, ремонт, стоянка, суточные или прочее.",
  };
}

export function advanceExpenseWizard(state: ExpenseWizardState, input: string): ExpenseWizardResult {
  const text = input.trim().toUpperCase();
  if (state.step === "CATEGORY") {
    if (!supportedCategories.has(text)) {
      return { kind: "ERROR", state, prompt: "Категория не распознана. Используйте FUEL, TOLL, REPAIR, PARKING, DAILY_ALLOWANCE или OTHER." };
    }
    return {
      kind: "NEXT",
      state: { step: "AMOUNT", draft: { ...state.draft, categoryCode: text } },
      prompt: "Укажите сумму расхода в тенге.",
    };
  }

  if (state.step === "AMOUNT") {
    const amount = parsePositiveNumber(input);
    if (amount === null) return { kind: "ERROR", state, prompt: "Введите положительную сумму, например 167400." };
    const draft = { ...state.draft, amountMinor: Math.round(amount * 100) };
    if (draft.categoryCode === "FUEL") {
      return { kind: "NEXT", state: { step: "FUEL_LITRES", draft }, prompt: "Сколько литров топлива?" };
    }
    return { kind: "NEXT", state: { step: "ODOMETER", draft }, prompt: "Укажите текущий одометр в километрах." };
  }

  if (state.step === "FUEL_LITRES") {
    const litres = parsePositiveNumber(input);
    if (litres === null) return { kind: "ERROR", state, prompt: "Введите положительное число литров." };
    return {
      kind: "NEXT",
      state: { step: "ODOMETER", draft: { ...state.draft, fuelLitres: litres } },
      prompt: "Укажите текущий одометр в километрах.",
    };
  }

  if (state.step === "ODOMETER") {
    const odometer = parsePositiveNumber(input);
    if (odometer === null) return { kind: "ERROR", state, prompt: "Введите положительное значение одометра." };
    const next = { step: "CONFIRM" as const, draft: { ...state.draft, odometerKm: odometer } };
    return {
      kind: "CONFIRM",
      state: next,
      prompt: `Проверить: ${next.draft.categoryCode}, ${next.draft.amountMinor! / 100} ${next.draft.currency}, одометр ${odometer} км. Отправьте CONFIRM для сохранения.`,
    };
  }

  return { kind: "ERROR", state, prompt: "Сессия уже готова к подтверждению. Отправьте CONFIRM или отмените ввод." };
}

