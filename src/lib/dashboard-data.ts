import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type MembershipRole = "OWNER" | "MANAGER" | "DRIVER";

export type DashboardData = {
  organization: { id: string; name: string; baseCurrency: string };
  role: MembershipRole;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string; status: string }>;
  drivers: Array<{ id: string; displayName: string; status: string }>;
  trips: Array<{ id: string; title: string; status: string; vehicleName: string; driverName: string | null; startedAt: string | null }>;
  totals: { revenue: number; expenses: number; profit: number; totalKm: number; emptyMileagePct: number | null };
};

export type DashboardLoadResult = DashboardData | "UNAUTHENTICATED" | "NO_ORGANIZATION";

type MembershipRow = {
  organization_id: string;
  role: MembershipRole;
  organizations: { name: string; base_currency: string } | { name: string; base_currency: string }[] | null;
};

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getDashboardData = cache(async (): Promise<DashboardLoadResult> => {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return "UNAUTHENTICATED";

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations(name, base_currency)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membershipData) return "NO_ORGANIZATION";

  const membership = membershipData as unknown as MembershipRow;
  const organization = asOne(membership.organizations);
  if (!organization) throw new Error("Active membership has no organization");

  const [vehiclesResult, driversResult, tripsResult, summariesResult] = await Promise.all([
    supabase.from("vehicles").select("id, display_name, plate_number, status").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("drivers").select("id, display_name, status").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("trips").select("id, title, status, started_at, vehicles(display_name), drivers(display_name)").eq("organization_id", membership.organization_id).is("deleted_at", null).order("started_at", { ascending: false }).limit(12),
    supabase.from("trip_financial_summary").select("revenue, expenses, operating_profit, total_km, empty_km").eq("organization_id", membership.organization_id),
  ]);
  for (const result of [vehiclesResult, driversResult, tripsResult, summariesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const summaries = summariesResult.data ?? [];
  const totalKm = summaries.reduce((sum, item) => sum + Number(item.total_km ?? 0), 0);
  const emptyKm = summaries.reduce((sum, item) => sum + Number(item.empty_km ?? 0), 0);

  return {
    organization: { id: membership.organization_id, name: organization.name, baseCurrency: organization.base_currency },
    role: membership.role,
    vehicles: (vehiclesResult.data ?? []).map((vehicle) => ({ id: vehicle.id, displayName: vehicle.display_name, plateNumber: vehicle.plate_number, status: vehicle.status })),
    drivers: (driversResult.data ?? []).map((driver) => ({ id: driver.id, displayName: driver.display_name, status: driver.status })),
    trips: (tripsResult.data ?? []).map((trip) => ({
      id: trip.id,
      title: trip.title,
      status: trip.status,
      vehicleName: asOne(trip.vehicles)?.display_name ?? "Без машины",
      driverName: asOne(trip.drivers)?.display_name ?? null,
      startedAt: trip.started_at,
    })),
    totals: {
      revenue: summaries.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0),
      expenses: summaries.reduce((sum, item) => sum + Number(item.expenses ?? 0), 0),
      profit: summaries.reduce((sum, item) => sum + Number(item.operating_profit ?? 0), 0),
      totalKm,
      emptyMileagePct: totalKm > 0 ? Number(((emptyKm / totalKm) * 100).toFixed(2)) : null,
    },
  };
});
