import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type MembershipRole = "OWNER" | "MANAGER" | "DRIVER";

export type DashboardData = {
  organization: { id: string; name: string; baseCurrency: string };
  role: MembershipRole;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string; status: string }>;
  drivers: Array<{ id: string; displayName: string; status: string; telegramLinked: boolean; pendingInviteExpiresAt: string | null; isOwnerDriver: boolean }>;
  trips: Array<{
    id: string;
    title: string;
    status: string;
    vehicleName: string;
    driverName: string | null;
    startedAt: string | null;
    legs: Array<{
      id: string;
      sequenceNo: number;
      originCity: string;
      destinationCity: string;
      loadState: string;
      startOdometerKm: number | null;
      endOdometerKm: number | null;
      distanceKm: number | null;
    }>;
    pnl: {
      revenueMinor: number;
      totalExpensesMinor: number;
      driverCompensationMinor: number;
      managementProfitMinor: number;
      totalKm: number;
      loadedKm: number;
      emptyKm: number;
    } | null;
  }>;
  pendingExpenses: Array<{ id: string; categoryName: string; tripTitle: string | null; amount: number; currency: string; occurredAt: string; comment: string | null }>;
  totals: { revenue: number; expenses: number; profit: number; totalKm: number; emptyMileagePct: number | null };
};

export type DashboardLoadResult = DashboardData | "UNAUTHENTICATED" | "NO_ORGANIZATION";

type MembershipRow = {
  organization_id: string;
  role: MembershipRole;
  organizations: { name: string; base_currency: string } | { name: string; base_currency: string }[] | null;
};

type PnlRow = {
  trip_id: string;
  revenue_minor: number | string;
  total_expenses_minor: number | string;
  driver_compensation_minor: number | string;
  management_profit_minor: number | string;
  total_km: number;
  loaded_km: number;
  empty_km: number;
};

type TripRow = {
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  vehicles: { display_name: string } | { display_name: string }[] | null;
  drivers: { display_name: string } | { display_name: string }[] | null;
  trip_legs: Array<{
    id: string;
    sequence_no: number;
    origin_city: string;
    destination_city: string;
    load_state: string;
    start_odometer_km: number | string | null;
    end_odometer_km: number | string | null;
    distance_km: number | string | null;
  }>;
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

  const [vehiclesResult, driversResult, tripsResult, summariesResult, pendingExpensesResult, pnlResult, invitesResult] = await Promise.all([
    supabase.from("vehicles").select("id, display_name, plate_number, status").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("drivers").select("id, profile_id, display_name, status, telegram_user_id").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("trips").select("id, title, status, started_at, vehicles(display_name), drivers(display_name), trip_legs(id, sequence_no, origin_city, destination_city, load_state, start_odometer_km, end_odometer_km, distance_km)").eq("organization_id", membership.organization_id).is("deleted_at", null).order("started_at", { ascending: false }).limit(12),
    supabase.from("trip_financial_summary").select("revenue, expenses, operating_profit, total_km, empty_km").eq("organization_id", membership.organization_id),
    supabase.from("expenses").select("id, amount, currency, occurred_at, comment, expense_categories(display_name), trips(title)").eq("organization_id", membership.organization_id).eq("review_status", "PENDING").eq("status", "RECORDED").is("deleted_at", null).order("occurred_at", { ascending: false }).limit(12),
    supabase.from("pnl_snapshots").select("trip_id, revenue_minor, total_expenses_minor, driver_compensation_minor, management_profit_minor, total_km, loaded_km, empty_km").eq("organization_id", membership.organization_id).eq("is_current", true),
    supabase.from("telegram_driver_invites").select("driver_id, expires_at").eq("organization_id", membership.organization_id).is("used_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  for (const result of [vehiclesResult, driversResult, tripsResult, summariesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  // The web release may reach Vercel a few moments before the additive SQL migration.
  // Keep the current owner dashboard readable during that short window; any other
  // error still surfaces instead of being hidden.
  for (const result of [pendingExpensesResult, pnlResult, invitesResult]) {
    if (result.error && !["42P01", "42703"].includes(result.error.code ?? "")) throw new Error(result.error.message);
  }

  const pnlByTrip = new Map((pnlResult.data as PnlRow[] ?? []).map((item) => [item.trip_id, {
    revenueMinor: Number(item.revenue_minor),
    totalExpensesMinor: Number(item.total_expenses_minor),
    driverCompensationMinor: Number(item.driver_compensation_minor),
    managementProfitMinor: Number(item.management_profit_minor),
    totalKm: Number(item.total_km),
    loadedKm: Number(item.loaded_km),
    emptyKm: Number(item.empty_km),
  }]));

  const summaries = summariesResult.data ?? [];
  const pendingInvitesByDriver = new Map((invitesResult.data ?? []).map((invite) => [invite.driver_id, invite.expires_at]));
  const totalKm = summaries.reduce((sum, item) => sum + Number(item.total_km ?? 0), 0);
  const emptyKm = summaries.reduce((sum, item) => sum + Number(item.empty_km ?? 0), 0);

  return {
    organization: { id: membership.organization_id, name: organization.name, baseCurrency: organization.base_currency },
    role: membership.role,
    vehicles: (vehiclesResult.data ?? []).map((vehicle) => ({ id: vehicle.id, displayName: vehicle.display_name, plateNumber: vehicle.plate_number, status: vehicle.status })),
    drivers: (driversResult.data ?? []).map((driver) => ({
      id: driver.id,
      displayName: driver.display_name,
      status: driver.status,
      telegramLinked: driver.telegram_user_id !== null,
      pendingInviteExpiresAt: pendingInvitesByDriver.get(driver.id) ?? null,
      isOwnerDriver: driver.profile_id === userId,
    })),
    trips: ((tripsResult.data ?? []) as unknown as TripRow[]).map((trip) => ({
      id: trip.id,
      title: trip.title,
      status: trip.status,
      vehicleName: asOne(trip.vehicles)?.display_name ?? "Без машины",
      driverName: asOne(trip.drivers)?.display_name ?? null,
      startedAt: trip.started_at,
      legs: (trip.trip_legs ?? []).sort((left, right) => left.sequence_no - right.sequence_no).map((leg) => ({
        id: leg.id,
        sequenceNo: leg.sequence_no,
        originCity: leg.origin_city,
        destinationCity: leg.destination_city,
        loadState: leg.load_state,
        startOdometerKm: leg.start_odometer_km === null ? null : Number(leg.start_odometer_km),
        endOdometerKm: leg.end_odometer_km === null ? null : Number(leg.end_odometer_km),
        distanceKm: leg.distance_km === null ? null : Number(leg.distance_km),
      })),
      pnl: pnlByTrip.get(trip.id) ?? null,
    })),
    pendingExpenses: (pendingExpensesResult.data ?? []).map((expense) => ({
      id: expense.id,
      categoryName: asOne(expense.expense_categories)?.display_name ?? "Расход",
      tripTitle: asOne(expense.trips)?.title ?? null,
      amount: Number(expense.amount),
      currency: expense.currency,
      occurredAt: expense.occurred_at,
      comment: expense.comment,
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
