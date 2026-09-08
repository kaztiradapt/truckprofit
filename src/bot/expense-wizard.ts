export const expenseCurrencies = ["KZT", "RUB", "USD", "CNY", "UZS"] as const;
export type ExpenseWizardStep = "CATEGORY" | "CURRENCY" | "AMOUNT" | "RATE" | "FUEL_LITRES" | "ODOMETER" | "CONFIRM";
export type ExpenseWizardDraft = {
  tripId: string;
  categoryCode?: string;
  amountMinor?: number;
  currency: string;
  originalCurrency?: string;
  exchangeRate?: number;
  fuelLitres?: number;
  odometerKm?: number;
};
export type ExpenseWizardState = { step: ExpenseWizardStep; draft: ExpenseWizardDraft; editing?: boolean };
export type ExpenseWizardResult = { kind: "NEXT" | "CONFIRM" | "ERROR"; state: ExpenseWizardState; prompt: string };
const categories: Record<string, string> = { FUEL: "Топливо", TOLL: "Дорога", REPAIR: "Ремонт", PARKING: "Стоянка", DAILY_ALLOWANCE: "Суточные", OTHER: "Прочее" };

function positive(value: string, max: number, decimals = 2): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!new RegExp("^\\d+(?:\\.\\d{1," + decimals + "})?$").test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 && number <= max ? number : null;
}

export function expensePrompt(state: ExpenseWizardState): string {
  const d = state.draft;
  switch (state.step) {
    case "CATEGORY": return "Выберите категорию расхода.";
    case "CURRENCY": return "Выберите валюту чека. Валюта учёта компании: " + d.currency + ".";
    case "AMOUNT": return "Укажите сумму по чеку в " + (d.originalCurrency ?? d.currency) + ", например 1500,50.";
    case "RATE": return "Укажите курс на дату расхода: 1 " + d.originalCurrency + " = сколько " + d.currency + "? Курс вводится вручную.";
    case "FUEL_LITRES": return "Сколько литров топлива?";
    case "ODOMETER": return "Укажите текущий одометр в километрах.";
    case "CONFIRM": return [
      "Проверьте расход:", categories[d.categoryCode ?? ""] ?? "Расход",
      "По чеку: " + (d.amountMinor ?? 0) / 100 + " " + (d.originalCurrency ?? d.currency),
      ...(d.originalCurrency && d.originalCurrency !== d.currency ? [
        "Курс: 1 " + d.originalCurrency + " = " + d.exchangeRate + " " + d.currency,
        "В учёте: " + Math.round((d.amountMinor ?? 0) * (d.exchangeRate ?? 1)) / 100 + " " + d.currency,
      ] : []),
      ...(d.fuelLitres ? ["Топливо: " + d.fuelLitres + " л"] : []),
      ...(d.odometerKm ? ["Одометр: " + d.odometerKm + " км"] : []),
      state.editing ? "Изменение сохранится в истории. Одометр и категория не меняются." : "Сохраните или исправьте нужное поле кнопками ниже.",
    ].join("\n");
  }
}
function result(state: ExpenseWizardState): ExpenseWizardResult {
  return { kind: state.step === "CONFIRM" ? "CONFIRM" : "NEXT", state, prompt: expensePrompt(state) };
}
export function beginExpenseWizard(tripId: string, currency = "KZT"): ExpenseWizardResult {
  return result({ step: "CATEGORY", draft: { tripId, currency } });
}
export function expenseSteps(state: ExpenseWizardState): ExpenseWizardStep[] {
  return [...(state.editing ? [] : ["CATEGORY" as const]), "CURRENCY", "AMOUNT",
    ...((state.draft.originalCurrency ?? state.draft.currency) !== state.draft.currency ? ["RATE" as const] : []),
    ...(state.draft.categoryCode === "FUEL" ? ["FUEL_LITRES" as const] : []),
    ...(state.editing ? [] : ["ODOMETER" as const]), "CONFIRM"];
}
export function backExpenseWizard(state: ExpenseWizardState): ExpenseWizardResult {
  const steps = expenseSteps(state);
  return result({ ...state, step: steps[Math.max(0, steps.indexOf(state.step) - 1)] });
}
export function editExpenseWizard(state: ExpenseWizardState, step: string): ExpenseWizardResult {
  if (state.step !== "CONFIRM" || step === "CONFIRM" || !expenseSteps(state).includes(step as ExpenseWizardStep)) return result(state);
  return result({ ...state, step: step as ExpenseWizardStep });
}
export function advanceExpenseWizard(state: ExpenseWizardState, input: string): ExpenseWizardResult {
  const draft = { ...state.draft };
  const text = input.trim().toUpperCase();
  const error = (prompt: string): ExpenseWizardResult => ({ kind: "ERROR", state, prompt });
  switch (state.step) {
    case "CATEGORY":
      if (!Object.hasOwn(categories, text)) return error("Выберите категорию кнопкой ниже.");
      draft.categoryCode = text;
      if (text !== "FUEL") draft.fuelLitres = undefined;
      break;
    case "CURRENCY":
      if (!(expenseCurrencies as readonly string[]).includes(text)) return error("Выберите валюту кнопкой ниже.");
      draft.originalCurrency = text;
      draft.exchangeRate = text === draft.currency ? 1 : undefined;
      break;
    case "AMOUNT": {
      const amount = positive(input, 999_999_999);
      if (amount === null) return error("Введите положительную сумму до 999 999 999, максимум два знака после запятой.");
      draft.amountMinor = Math.round(amount * 100);
      break;
    }
    case "RATE": {
      const rate = positive(input, 1_000_000, 8);
      if (rate === null || (draft.amountMinor ?? 0) * rate > 99_999_999_900 || Math.round((draft.amountMinor ?? 0) * rate) < 1) return error("Проверьте курс: итог должен быть от 0,01 до 999 999 999 в валюте компании. До 8 знаков после запятой.");
      draft.exchangeRate = rate;
      break;
    }
    case "FUEL_LITRES": {
      const litres = positive(input, 100_000, 3);
      if (litres === null) return error("Введите количество литров от 0,001 до 100 000.");
      draft.fuelLitres = litres;
      break;
    }
    case "ODOMETER": {
      const odometer = positive(input, 9_999_999, 1);
      if (odometer === null) return error("Введите одометр от 0,1 до 9 999 999 км.");
      draft.odometerKm = odometer;
      break;
    }
    case "CONFIRM": return error("Нажмите «Сохранить» или выберите поле для исправления.");
  }
  const next = { ...state, draft };
  const steps = expenseSteps(next);
  next.step = steps[steps.indexOf(state.step) + 1];
  return result(next);
}
