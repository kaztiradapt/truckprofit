export type DriverTripStatusTone = "waiting" | "active" | "complete" | "attention" | "neutral";

const driverTripStatuses: Record<string, { label: string; tone: DriverTripStatusTone }> = {
  WAITING_LOADING: { label: "Ожидаю погрузку", tone: "waiting" },
  AT_LOADING: { label: "Погрузка", tone: "active" },
  LOADED: { label: "Загружен", tone: "active" },
  IN_TRANSIT: { label: "В пути", tone: "active" },
  WAITING_UNLOADING: { label: "Ожидаю выгрузку", tone: "waiting" },
  AT_UNLOADING: { label: "Выгрузка", tone: "active" },
  UNLOADED: { label: "Выгружен", tone: "complete" },
  IDLE: { label: "Простой", tone: "attention" },
  DELAY: { label: "Задержка", tone: "attention" },
};

export function getDriverTripStatus(code: string | null | undefined) {
  if (!code) return { label: "Статус не передан", tone: "neutral" as const };
  return driverTripStatuses[code] ?? { label: code, tone: "neutral" as const };
}
