import type { ManagementReportTotals } from "./management-report";

export type ReportMetricSnapshot = {
  trips: number;
  totalKm: number;
  fuelLiters: number;
  fuelSpendMinor: number;
  repairSpendMinor: number;
  actualExpensesMinor: number;
  revenueMinor: number;
  actualProfitMinor: number;
  fuelPer100Km: number | null;
  fuelCostPerKmMinor: number | null;
  averageFuelPriceMinor: number | null;
  emptyMileagePct: number | null;
  profitPerKmMinor: number | null;
};

export type ReportSignalSeverity = "POSITIVE" | "INFO" | "WARNING" | "CRITICAL";

export type ReportSignal = {
  id: string;
  severity: ReportSignalSeverity;
  title: string;
  detail: string;
  recommendation: string;
  currentValue: number | null;
  previousValue: number | null;
  changePct: number | null;
};

function rate(numerator: number, denominator: number, multiplier = 1): number | null {
  return denominator > 0 ? (numerator / denominator) * multiplier : null;
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function rounded(value: number | null, digits = 1): number | null {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

export function toReportMetricSnapshot(totals: ManagementReportTotals): ReportMetricSnapshot {
  const fuelSpendMinor = totals.expensesByGroupMinor.FUEL;
  return {
    trips: totals.trips,
    totalKm: rounded(totals.totalKm, 1) ?? 0,
    fuelLiters: rounded(totals.fuelLiters, 2) ?? 0,
    fuelSpendMinor,
    repairSpendMinor: totals.expensesByGroupMinor.REPAIR + totals.expensesByGroupMinor.MAINTENANCE,
    actualExpensesMinor: totals.actualExpensesMinor,
    revenueMinor: totals.revenueMinor,
    actualProfitMinor: totals.actualProfitMinor,
    fuelPer100Km: rounded(rate(totals.fuelLiters, totals.totalKm, 100), 1),
    fuelCostPerKmMinor: rounded(rate(fuelSpendMinor, totals.totalKm), 0),
    averageFuelPriceMinor: rounded(rate(fuelSpendMinor, totals.fuelLiters), 0),
    emptyMileagePct: rounded(rate(totals.emptyKm, totals.totalKm, 100), 1),
    profitPerKmMinor: rounded(rate(totals.actualProfitMinor, totals.totalKm), 0),
  };
}

export function buildReportSignals(
  current: ReportMetricSnapshot,
  previous: ReportMetricSnapshot,
  vehicleFuelNorm: number | null = null,
): ReportSignal[] {
  const signals: ReportSignal[] = [];
  const enoughCurrentFuelData = current.totalKm >= 500 && current.fuelLiters > 0;
  const enoughPreviousFuelData = previous.totalKm >= 500 && previous.fuelLiters > 0;

  if (!current.trips) {
    return [{
      id: "NO_TRIPS",
      severity: "INFO",
      title: "Нет рейсов для анализа",
      detail: "В выбранном периоде отсутствуют рейсы, поэтому сравнение выполнить нельзя.",
      recommendation: "Измените период или фильтры отчёта.",
      currentValue: 0,
      previousValue: previous.trips,
      changePct: null,
    }];
  }

  if (!enoughCurrentFuelData) {
    signals.push({
      id: "FUEL_DATA_QUALITY",
      severity: "INFO",
      title: "Недостаточно данных по топливу",
      detail: `Для устойчивого расчёта нужно не менее 500 км и расходы с указанными литрами. Сейчас: ${Math.round(current.totalKm)} км и ${current.fuelLiters} л.`,
      recommendation: "Проверьте, что водитель указывает литры в каждой топливной операции, а в рейсах заполнен километраж.",
      currentValue: current.fuelPer100Km,
      previousValue: previous.fuelPer100Km,
      changePct: null,
    });
  }

  if (enoughCurrentFuelData && enoughPreviousFuelData) {
    const change = rounded(percentChange(current.fuelPer100Km, previous.fuelPer100Km), 1);
    if (change !== null && Math.abs(change) >= 10) {
      const increased = change > 0;
      signals.push({
        id: "FUEL_CONSUMPTION_CHANGE",
        severity: increased ? (change >= 20 ? "CRITICAL" : "WARNING") : "POSITIVE",
        title: increased ? "Расход топлива увеличился" : "Расход топлива снизился",
        detail: `Расход изменился с ${previous.fuelPer100Km} до ${current.fuelPer100Km} л/100 км (${change > 0 ? "+" : ""}${change}%).`,
        recommendation: increased
          ? "Проверьте маршруты, загрузку, стиль вождения, простои с работающим двигателем и техническое состояние автомобиля."
          : "Зафиксируйте, какие маршруты, автомобили и водители дали улучшение, чтобы повторить практику.",
        currentValue: current.fuelPer100Km,
        previousValue: previous.fuelPer100Km,
        changePct: change,
      });
    }
  }

  if (vehicleFuelNorm && current.fuelPer100Km !== null && enoughCurrentFuelData) {
    const normChange = rounded(percentChange(current.fuelPer100Km, vehicleFuelNorm), 1);
    if (normChange !== null && normChange >= 10) {
      signals.push({
        id: "FUEL_NORM_EXCEEDED",
        severity: normChange >= 20 ? "CRITICAL" : "WARNING",
        title: "Превышена норма топлива автомобиля",
        detail: `Фактический расход ${current.fuelPer100Km} л/100 км против нормы ${vehicleFuelNorm} л/100 км (+${normChange}%).`,
        recommendation: "Сверьте километраж и чеки, затем проверьте давление в шинах, топливную систему и режим эксплуатации.",
        currentValue: current.fuelPer100Km,
        previousValue: vehicleFuelNorm,
        changePct: normChange,
      });
    }
  }

  const fuelCostChange = rounded(percentChange(current.fuelCostPerKmMinor, previous.fuelCostPerKmMinor), 1);
  if (fuelCostChange !== null && Math.abs(fuelCostChange) >= 15 && current.totalKm >= 500 && previous.totalKm >= 500) {
    signals.push({
      id: "FUEL_COST_PER_KM_CHANGE",
      severity: fuelCostChange > 0 ? "WARNING" : "POSITIVE",
      title: fuelCostChange > 0 ? "Топливо на километр подорожало" : "Стоимость топлива на километр снизилась",
      detail: `Изменение стоимости топлива на километр: ${fuelCostChange > 0 ? "+" : ""}${fuelCostChange}%.`,
      recommendation: "Разделите эффект цены литра и фактического расхода л/100 км; проверьте заправки с наибольшей ценой.",
      currentValue: current.fuelCostPerKmMinor,
      previousValue: previous.fuelCostPerKmMinor,
      changePct: fuelCostChange,
    });
  }

  if (current.emptyMileagePct !== null && previous.emptyMileagePct !== null) {
    const points = rounded(current.emptyMileagePct - previous.emptyMileagePct, 1);
    if (points !== null && Math.abs(points) >= 5) {
      signals.push({
        id: "EMPTY_MILEAGE_CHANGE",
        severity: points > 0 ? "WARNING" : "POSITIVE",
        title: points > 0 ? "Доля порожнего пробега выросла" : "Доля порожнего пробега снизилась",
        detail: `Порожний пробег изменился с ${previous.emptyMileagePct}% до ${current.emptyMileagePct}% (${points > 0 ? "+" : ""}${points} п.п.).`,
        recommendation: points > 0 ? "Проверьте обратные загрузки и стыковку рейсов." : "Сохраните текущую схему обратных загрузок и планирования.",
        currentValue: current.emptyMileagePct,
        previousValue: previous.emptyMileagePct,
        changePct: points,
      });
    }
  }

  const repairChange = rounded(percentChange(current.repairSpendMinor, previous.repairSpendMinor), 1);
  if (repairChange !== null && repairChange >= 30) {
    signals.push({
      id: "REPAIR_COST_CHANGE",
      severity: repairChange >= 75 ? "CRITICAL" : "WARNING",
      title: "Затраты на ремонт и ТО выросли",
      detail: `Рост относительно предыдущего периода: +${repairChange}%.`,
      recommendation: "Откройте расходы по ремонту, отделите разовые работы от повторяющихся неисправностей и проверьте автомобиль.",
      currentValue: current.repairSpendMinor,
      previousValue: previous.repairSpendMinor,
      changePct: repairChange,
    });
  }

  const profitChange = rounded(percentChange(current.profitPerKmMinor, previous.profitPerKmMinor), 1);
  if (current.profitPerKmMinor !== null && current.profitPerKmMinor < 0) {
    signals.push({
      id: "NEGATIVE_PROFIT_PER_KM",
      severity: "CRITICAL",
      title: "Выбранный период убыточен",
      detail: "Фактический результат на километр ниже нуля.",
      recommendation: "Проверьте ставки рейсов, топливную себестоимость, ремонты и оплату водителей по каждому убыточному рейсу.",
      currentValue: current.profitPerKmMinor,
      previousValue: previous.profitPerKmMinor,
      changePct: profitChange,
    });
  } else if (profitChange !== null && profitChange <= -15) {
    signals.push({
      id: "PROFIT_PER_KM_DECLINE",
      severity: profitChange <= -30 ? "CRITICAL" : "WARNING",
      title: "Прибыль на километр снизилась",
      detail: `Снижение относительно предыдущего периода: ${profitChange}%.`,
      recommendation: "Сравните ставку, загрузку, топливо и внеплановые расходы по рейсам с минимальной прибылью.",
      currentValue: current.profitPerKmMinor,
      previousValue: previous.profitPerKmMinor,
      changePct: profitChange,
    });
  }

  if (!signals.length) {
    signals.push({
      id: "NO_MATERIAL_DEVIATIONS",
      severity: "INFO",
      title: "Существенных отклонений не найдено",
      detail: "Проверяемые показатели не вышли за установленные пороги относительно предыдущего периода.",
      recommendation: "Продолжайте регулярно заполнять километраж, литры топлива и привязку расходов к рейсам.",
      currentValue: null,
      previousValue: null,
      changePct: null,
    });
  }

  return signals;
}
