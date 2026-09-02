"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DashboardRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <button
    type="button"
    className="dashboard-refresh-button"
    disabled={pending}
    onClick={() => startTransition(() => router.refresh())}
  >
    <span aria-hidden="true">↻</span>
    {pending ? "Обновляю…" : "Обновить"}
  </button>;
}
