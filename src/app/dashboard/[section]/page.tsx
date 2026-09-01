import { notFound } from "next/navigation";

import { DashboardScreen, dashboardSections, type DashboardSection } from "../dashboard-screen";

export const dynamic = "force-dynamic";

export default async function DashboardSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { section } = await params;
  if (!dashboardSections.includes(section as DashboardSection) || section === "overview") notFound();
  return <DashboardScreen section={section as DashboardSection} searchParams={searchParams} />;
}
