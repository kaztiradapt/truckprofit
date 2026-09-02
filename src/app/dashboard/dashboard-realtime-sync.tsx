"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

const realtimeTables = [
  "vehicle_status_records",
  "trip_location_points",
  "expenses",
  "attachments",
  "incomes",
  "trips",
  "trip_legs",
  "pnl_snapshots",
] as const;

type ConnectionState = "connecting" | "online" | "offline";

export function DashboardRealtimeSync({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refreshDashboard = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    };
    const subscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase.channel(`dashboard:${organizationId}`);
      for (const table of realtimeTables) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
          refreshDashboard,
        );
      }
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnectionState("online");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnectionState("offline");
      });
    };
    void subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDashboard();
    };
    window.addEventListener("online", refreshDashboard);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      window.removeEventListener("online", refreshDashboard);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const label = connectionState === "online"
    ? "Обновления онлайн"
    : connectionState === "connecting"
      ? "Подключение…"
      : "Обновление вручную";
  return <span className={`realtime-indicator ${connectionState}`} role="status" aria-live="polite" title="Статусы, геопозиции, расходы, чеки, рейсы и доходы обновляются автоматически">
    <i aria-hidden="true" />{label}
  </span>;
}
