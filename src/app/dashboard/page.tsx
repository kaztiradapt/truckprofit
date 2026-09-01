import { DashboardScreen } from "./dashboard-screen";

export const dynamic = "force-dynamic";

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  return <DashboardScreen section="overview" searchParams={searchParams} />;
}
