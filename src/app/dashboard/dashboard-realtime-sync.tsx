"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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
  "support_tickets",
] as const;

type ConnectionState = "connecting" | "online" | "offline";

export function DashboardRealtimeSync({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [hasUpdates, setHasUpdates] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const notifyAboutUpdates = () => setHasUpdates(true);
    const subscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase.channel(`dashboard:${organizationId}`);
      for (const table of realtimeTables) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
          notifyAboutUpdates,
        );
      }
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnectionState("online");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnectionState("offline");
      });
    };
    void subscribe();

    window.addEventListener("online", notifyAboutUpdates);
    return () => {
      disposed = true;
      window.removeEventListener("online", notifyAboutUpdates);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId]);

  function refreshDashboard() {
    startTransition(() => {
      router.refresh();
      setHasUpdates(false);
    });
  }

  const label = hasUpdates
    ? pending ? "Обновляю данные…" : "Есть новые данные — обновить"
    : connectionState === "online"
    ? "Обновления онлайн"
    : connectionState === "connecting"
      ? "Подключение…"
      : "Обновление вручную";
  return <button type="button" className={`realtime-indicator ${hasUpdates ? "updates" : connectionState}`} onClick={refreshDashboard} disabled={pending} aria-live="polite" title={hasUpdates ? "В системе появились изменения. Нажмите, чтобы загрузить свежие данные." : "Система сообщит, когда в CRM появятся новые данные"}>
    <i aria-hidden="true" />{label}
  </button>;
}
