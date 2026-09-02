"use client";

import { useSyncExternalStore } from "react";

type DisplayMode = "date" | "date-time";

const subscribeTimeZone = () => () => undefined;
const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => "";

export function formatDeviceDateTime(value: string, mode: DisplayMode, timeZone?: string) {
  const isCalendarOnly = mode === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const calendarDate = isCalendarOnly
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  if (Number.isNaN(calendarDate.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-KZ", {
    dateStyle: "medium",
    ...(mode === "date-time" ? { timeStyle: "short" as const } : {}),
    ...(isCalendarOnly ? { timeZone: "UTC" } : timeZone ? { timeZone } : {}),
  }).format(calendarDate);
}

export function DeviceDateTime({ value, mode = "date-time", fallback = "—" }: {
  value: string | null;
  mode?: DisplayMode;
  fallback?: string;
}) {
  const timeZone = useSyncExternalStore(
    subscribeTimeZone,
    getDeviceTimeZone,
    getServerTimeZone,
  );
  if (!value) return <>{fallback}</>;
  const label = timeZone ? formatDeviceDateTime(value, mode, timeZone) : "…";
  return <time dateTime={value} title={timeZone ? `Время устройства: ${timeZone}` : undefined}>{label}</time>;
}
