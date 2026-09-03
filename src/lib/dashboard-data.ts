import { normalizeRouteGeometry } from "@/domain/route-geometry";
import { createClient } from "@/lib/supabase/server";
import { permissionCodes } from "@/server/team-access";

export type MembershipRole = "OWNER" | "MANAGER" | "DRIVER";

export type DashboardData = {
  organization: { id: string; name: string; baseCurrency: string };
  role: MembershipRole;
  permissions: string[];
  accessRoleName: string;
  ownerTelegramLinked: boolean;
  accessRoles: Array<{ id: string; name: string; permissions: string[]; isSystem: boolean }>;
  staff: Array<{
    id: string;
    displayName: string;
    email: string | null;
    telegramUsername: string | null;
    telegramLinked: boolean;
    status: "INVITED" | "ACTIVE" | "SUSPENDED";
    accessRoleId: string | null;
    roleName: string;
    isOwner: boolean;
  }>;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string; makeModel: string | null; fuelNorm: number | null; status: string }>;
  drivers: Array<{
    id: string;
    displayName: string;
    status: string;
    telegramLinked: boolean;
    pendingInviteExpiresAt: string | null;
    isOwnerDriver: boolean;
    assignedVehicleId: string | null;
    assignedVehicleName: string | null;
  }>;
  driverReports: Array<{
    driverId: string;
    displayName: string;
    status: string;
    assignedVehicleName: string | null;
    totalTrips: number;
    activeTrips: number;
    completedTrips: number;
    totalKm: number;
    loadedKm: number;
    emptyKm: number;
    driverCompensationMinor: number;
    managementProfitMinor: number;
    latestTripAt: string | null;
  }>;
  trips: Array<{
    id: string;
    title: string;
    status: string;
    vehicleId: string;
    driverId: string | null;
    vehicleName: string;
    driverName: string | null;
    startedAt: string | null;
    originCity: string;
    destinationCity: string;
    originAddress: string;
    destinationAddress: string;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
    distanceKm: number | null;
    routeGeometry: Array<[number, number]> | null;
    loadState: string;
    driverStatus: {
      code: string;
      loadState: string;
      locationText: string | null;
      recordedAt: string;
    } | null;
    driverStatusHistory: Array<{
      id: string;
      code: string;
      loadState: string;
      locationText: string | null;
      recordedAt: string;
    }>;
    lastLocation: {
      latitude: number;
      longitude: number;
      horizontalAccuracyM: number | null;
      recordedAt: string;
    } | null;
    locationHistory: Array<{
      id: string;
      latitude: number;
      longitude: number;
      horizontalAccuracyM: number | null;
      recordedAt: string;
      eventType: "CHECKPOINT" | "REST" | "LOADING" | "UNLOADING" | "OTHER";
      note: string | null;
    }>;
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
  recentExpenses: Array<{
    id: string;
    tripId: string | null;
    categoryName: string;
    tripTitle: string | null;
    driverName: string | null;
    amount: number;
    currency: string;
    occurredAt: string;
    source: string;
    locationText: string | null;
    comment: string | null;
    receipt: {
      id: string;
      originalFilename: string | null;
      contentType: string | null;
    } | null;
  }>;
  incomes: Array<{
    id: string;
    tripId: string;
    customerName: string | null;
    amount: number;
    currency: string;
    reportingCurrency: string;
    reportingAmountMinor: number;
    fxRateToReporting: number;
    expectedPaymentAt: string | null;
    paymentStatus: string;
    comment: string | null;
  }>;
  supportTickets: Array<{
    id: string;
    ticketNumber: number;
    category: string;
    priority: string;
    status: string;
    subject: string;
    description: string;
    stepsToReproduce: string | null;
    contact: string | null;
    responseText: string | null;
    respondedAt: string | null;
    attachmentFilename: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  totals: { revenue: number; expenses: number; profit: number; totalKm: number; emptyMileagePct: number | null };
};

export type DashboardLoadResult = DashboardData | "UNAUTHENTICATED" | "NO_ORGANIZATION";

type MembershipRow = {
  organization_id: string;
  role: MembershipRole;
  access_role_id: string | null;
  organization_access_roles: { name: string; permissions: string[] } | { name: string; permissions: string[] }[] | null;
  organizations: { name: string; base_currency: string } | { name: string; base_currency: string }[] | null;
};

type StaffRow = {
  id: string;
  profile_id: string | null;
  access_role_id: string | null;
  display_name: string;
  email: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  organization_access_roles: { name: string } | { name: string }[] | null;
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

type DriverRow = {
  id: string;
  profile_id: string | null;
  display_name: string;
  status: string;
  telegram_user_id: number | null;
  assigned_vehicle_id: string | null;
};

type TripRow = {
  id: string;
  title: string;
  status: string;
  vehicle_id: string;
  driver_id: string | null;
  started_at: string | null;
  vehicles: { display_name: string } | { display_name: string }[] | null;
  drivers: { display_name: string } | { display_name: string }[] | null;
  trip_legs: Array<{
    id: string;
    sequence_no: number;
    origin_city: string;
    destination_city: string;
    origin_address: string;
    destination_address: string;
    origin_latitude: number | string | null;
    origin_longitude: number | string | null;
    destination_latitude: number | string | null;
    destination_longitude: number | string | null;
    load_state: string;
    start_odometer_km: number | string | null;
    end_odometer_km: number | string | null;
    distance_km: number | string | null;
    route_geometry: unknown;
  }>;
};

type LocationRow = {
  id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  horizontal_accuracy_m: number | string | null;
  recorded_at: string;
  event_type: "CHECKPOINT" | "REST" | "LOADING" | "UNLOADING" | "OTHER";
  note: string | null;
};

type VehicleStatusRow = {
  id: string;
  trip_id: string | null;
  status_code: string;
  load_state: string;
  location_text: string | null;
  recorded_at: string;
};

type SupportTicketRow = {
  id: string;
  ticket_number: number | string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  steps_to_reproduce: string | null;
  contact: string | null;
  response_text: string | null;
  responded_at: string | null;
  attachment_filename: string | null;
  created_at: string;
  updated_at: string;
};

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getDashboardData(): Promise<DashboardLoadResult> {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return "UNAUTHENTICATED";

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, access_role_id, organizations(name, base_currency), organization_access_roles(name, permissions)")
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
  const accessRole = asOne(membership.organization_access_roles);
  const permissions = membership.role === "OWNER" ? [...permissionCodes] : accessRole?.permissions ?? [];

  const [profileResult, vehiclesResult, driversResult, tripsResult, summariesResult, recentExpensesResult, incomesResult, pnlResult, invitesResult, accessRolesResult, staffResult, locationsResult, vehicleStatusesResult, supportTicketsResult] = await Promise.all([
    supabase.from("profiles").select("telegram_user_id, telegram_username").eq("id", userId).maybeSingle(),
    supabase.from("vehicles").select("id, display_name, plate_number, make_model, fuel_norm_l_per_100km, status").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("drivers").select("id, profile_id, display_name, status, telegram_user_id, assigned_vehicle_id").eq("organization_id", membership.organization_id).is("deleted_at", null).order("display_name"),
    supabase.from("trips").select("id, title, status, vehicle_id, driver_id, started_at, vehicles(display_name), drivers(display_name), trip_legs(id, sequence_no, origin_city, destination_city, origin_address, destination_address, origin_latitude, origin_longitude, destination_latitude, destination_longitude, load_state, start_odometer_km, end_odometer_km, distance_km, route_geometry)").eq("organization_id", membership.organization_id).is("deleted_at", null).order("started_at", { ascending: false }).limit(500),
    supabase.from("trip_financial_summary").select("revenue, expenses, operating_profit, total_km, empty_km").eq("organization_id", membership.organization_id),
    supabase.from("expenses").select("id, trip_id, amount, currency, occurred_at, source, location_text, comment, expense_categories(display_name), trips(title), drivers(display_name), attachments(id, original_filename, content_type)").eq("organization_id", membership.organization_id).neq("review_status", "REJECTED").eq("status", "RECORDED").is("deleted_at", null).order("occurred_at", { ascending: false }).limit(500),
    supabase.from("incomes").select("id, trip_id, customer_name, amount, currency, reporting_currency, reporting_amount_minor, fx_rate_to_reporting, expected_payment_at, payment_status, comment").eq("organization_id", membership.organization_id).neq("payment_status", "VOIDED").is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    supabase.from("pnl_snapshots").select("trip_id, revenue_minor, total_expenses_minor, driver_compensation_minor, management_profit_minor, total_km, loaded_km, empty_km").eq("organization_id", membership.organization_id).eq("is_current", true),
    supabase.from("telegram_driver_invites").select("driver_id, expires_at").eq("organization_id", membership.organization_id).is("used_at", null).gt("expires_at", new Date().toISOString()),
    supabase.from("organization_access_roles").select("id, name, permissions, is_system").eq("organization_id", membership.organization_id).order("is_system", { ascending: false }).order("name"),
    supabase.from("organization_staff").select("id, profile_id, access_role_id, display_name, email, telegram_username, telegram_user_id, status, organization_access_roles(name)").eq("organization_id", membership.organization_id).is("deleted_at", null).order("created_at"),
    supabase.from("trip_location_points").select("id, trip_id, latitude, longitude, horizontal_accuracy_m, recorded_at, event_type, note").eq("organization_id", membership.organization_id).order("recorded_at", { ascending: false }).limit(500),
    supabase.from("vehicle_status_records").select("id, trip_id, status_code, load_state, location_text, recorded_at").eq("organization_id", membership.organization_id).not("trip_id", "is", null).order("recorded_at", { ascending: false }).limit(1000),
    supabase.from("support_tickets").select("id, ticket_number, category, priority, status, subject, description, steps_to_reproduce, contact, response_text, responded_at, attachment_filename, created_at, updated_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const result of [profileResult, vehiclesResult, driversResult, tripsResult, summariesResult, incomesResult, accessRolesResult, staffResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  // The web release may reach Vercel a few moments before the additive SQL migration.
  // Keep the current owner dashboard readable during that short window; any other
  // error still surfaces instead of being hidden.
  for (const result of [recentExpensesResult, pnlResult, invitesResult, locationsResult, vehicleStatusesResult, supportTicketsResult]) {
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
  const locationsByTrip = new Map<string, LocationRow[]>();
  for (const point of (locationsResult.data as LocationRow[] ?? [])) {
    const points = locationsByTrip.get(point.trip_id) ?? [];
    points.push(point);
    locationsByTrip.set(point.trip_id, points);
  }
  const statusesByTrip = new Map<string, VehicleStatusRow[]>();
  for (const status of (vehicleStatusesResult.data as VehicleStatusRow[] ?? [])) {
    if (!status.trip_id) continue;
    const statuses = statusesByTrip.get(status.trip_id) ?? [];
    statuses.push(status);
    statusesByTrip.set(status.trip_id, statuses);
  }
  const totalKm = summaries.reduce((sum, item) => sum + Number(item.total_km ?? 0), 0);
  const emptyKm = summaries.reduce((sum, item) => sum + Number(item.empty_km ?? 0), 0);
  const vehicleNames = new Map((vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, `${vehicle.display_name} · ${vehicle.plate_number}`]));
  const driverRows = (driversResult.data as DriverRow[] | null) ?? [];
  const driverReports = new Map(driverRows.map((driver) => [driver.id, {
    driverId: driver.id,
    displayName: driver.display_name,
    status: driver.status,
    assignedVehicleName: driver.assigned_vehicle_id ? vehicleNames.get(driver.assigned_vehicle_id) ?? null : null,
    totalTrips: 0,
    activeTrips: 0,
    completedTrips: 0,
    totalKm: 0,
    loadedKm: 0,
    emptyKm: 0,
    driverCompensationMinor: 0,
    managementProfitMinor: 0,
    latestTripAt: null as string | null,
  }]));
  for (const trip of ((tripsResult.data ?? []) as unknown as TripRow[])) {
    if (!trip.driver_id) continue;
    const report = driverReports.get(trip.driver_id);
    if (!report) continue;
    const legs = trip.trip_legs ?? [];
    const pnl = pnlByTrip.get(trip.id);
    const legTotalKm = legs.reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0);
    const legLoadedKm = legs.filter((leg) => leg.load_state === "LOADED").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0);
    const legEmptyKm = legs.filter((leg) => leg.load_state === "EMPTY").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0);
    report.totalTrips += 1;
    if (trip.status === "ACTIVE") report.activeTrips += 1;
    if (trip.status === "COMPLETED") report.completedTrips += 1;
    report.totalKm += pnl?.totalKm ?? legTotalKm;
    report.loadedKm += pnl?.loadedKm ?? legLoadedKm;
    report.emptyKm += pnl?.emptyKm ?? legEmptyKm;
    report.driverCompensationMinor += pnl?.driverCompensationMinor ?? 0;
    report.managementProfitMinor += pnl?.managementProfitMinor ?? 0;
    if (trip.started_at && (!report.latestTripAt || trip.started_at > report.latestTripAt)) report.latestTripAt = trip.started_at;
  }

  return {
    organization: { id: membership.organization_id, name: organization.name, baseCurrency: organization.base_currency },
    role: membership.role,
    permissions,
    accessRoleName: membership.role === "OWNER" ? "Владелец" : accessRole?.name ?? membership.role,
    ownerTelegramLinked: profileResult.data?.telegram_user_id !== null && profileResult.data?.telegram_user_id !== undefined,
    accessRoles: (accessRolesResult.data ?? []).map((role) => ({ id: role.id, name: role.name, permissions: role.permissions ?? [], isSystem: role.is_system })),
    staff: ((staffResult.data ?? []) as unknown as StaffRow[]).map((person) => ({
      id: person.id,
      displayName: person.display_name,
      email: person.email,
      telegramUsername: person.access_role_id === null
        ? profileResult.data?.telegram_username ?? person.telegram_username
        : person.telegram_username,
      telegramLinked: person.access_role_id === null
        ? profileResult.data?.telegram_user_id !== null && profileResult.data?.telegram_user_id !== undefined
        : person.telegram_user_id !== null,
      status: person.status,
      accessRoleId: person.access_role_id,
      roleName: person.access_role_id ? asOne(person.organization_access_roles)?.name ?? "Сотрудник" : "Владелец",
      isOwner: person.access_role_id === null,
    })),
    vehicles: (vehiclesResult.data ?? []).map((vehicle) => ({
      id: vehicle.id,
      displayName: vehicle.display_name,
      plateNumber: vehicle.plate_number,
      makeModel: vehicle.make_model,
      fuelNorm: vehicle.fuel_norm_l_per_100km === null ? null : Number(vehicle.fuel_norm_l_per_100km),
      status: vehicle.status,
    })),
    drivers: driverRows.map((driver) => ({
      id: driver.id,
      displayName: driver.display_name,
      status: driver.status,
      telegramLinked: driver.telegram_user_id !== null,
      pendingInviteExpiresAt: pendingInvitesByDriver.get(driver.id) ?? null,
      isOwnerDriver: driver.profile_id === userId,
      assignedVehicleId: driver.assigned_vehicle_id,
      assignedVehicleName: driver.assigned_vehicle_id ? vehicleNames.get(driver.assigned_vehicle_id) ?? null : null,
    })),
    driverReports: [...driverReports.values()].sort((left, right) => right.totalKm - left.totalKm || left.displayName.localeCompare(right.displayName, "ru")),
    trips: ((tripsResult.data ?? []) as unknown as TripRow[]).map((trip) => {
      const legs = (trip.trip_legs ?? []).sort((left, right) => left.sequence_no - right.sequence_no);
      const firstLeg = legs[0];
      const locationHistory = (locationsByTrip.get(trip.id) ?? []).map((point) => ({
        id: point.id,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        horizontalAccuracyM: point.horizontal_accuracy_m === null ? null : Number(point.horizontal_accuracy_m),
        recordedAt: point.recorded_at,
        eventType: point.event_type,
        note: point.note,
      }));
      const lastLocation = locationHistory[0] ?? null;
      return {
      id: trip.id,
      title: trip.title,
      status: trip.status,
      vehicleId: trip.vehicle_id,
      driverId: trip.driver_id,
      vehicleName: asOne(trip.vehicles)?.display_name ?? "Без машины",
      driverName: asOne(trip.drivers)?.display_name ?? null,
      startedAt: trip.started_at,
      originCity: firstLeg?.origin_city ?? "",
      destinationCity: firstLeg?.destination_city ?? "",
      originAddress: firstLeg?.origin_address ?? firstLeg?.origin_city ?? "",
      destinationAddress: firstLeg?.destination_address ?? firstLeg?.destination_city ?? "",
      originLatitude: firstLeg?.origin_latitude === null || firstLeg?.origin_latitude === undefined ? null : Number(firstLeg.origin_latitude),
      originLongitude: firstLeg?.origin_longitude === null || firstLeg?.origin_longitude === undefined ? null : Number(firstLeg.origin_longitude),
      destinationLatitude: firstLeg?.destination_latitude === null || firstLeg?.destination_latitude === undefined ? null : Number(firstLeg.destination_latitude),
      destinationLongitude: firstLeg?.destination_longitude === null || firstLeg?.destination_longitude === undefined ? null : Number(firstLeg.destination_longitude),
      distanceKm: firstLeg?.distance_km === null || firstLeg?.distance_km === undefined ? null : Number(firstLeg.distance_km),
      routeGeometry: normalizeRouteGeometry(firstLeg?.route_geometry),
      loadState: firstLeg?.load_state ?? "UNKNOWN",
      driverStatus: (() => {
        const status = statusesByTrip.get(trip.id)?.[0];
        return status ? {
          code: status.status_code,
          loadState: status.load_state,
          locationText: status.location_text,
          recordedAt: status.recorded_at,
        } : null;
      })(),
      driverStatusHistory: (statusesByTrip.get(trip.id) ?? []).map((status) => ({
        id: status.id,
        code: status.status_code,
        loadState: status.load_state,
        locationText: status.location_text,
        recordedAt: status.recorded_at,
      })),
      lastLocation: lastLocation ? {
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        horizontalAccuracyM: lastLocation.horizontalAccuracyM,
        recordedAt: lastLocation.recordedAt,
      } : null,
      locationHistory,
      legs: legs.map((leg) => ({
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
    }; }),
    recentExpenses: (recentExpensesResult.data ?? []).map((expense) => {
      const receipt = asOne(expense.attachments);
      return {
        id: expense.id,
        tripId: expense.trip_id,
        categoryName: asOne(expense.expense_categories)?.display_name ?? "Расход",
        tripTitle: asOne(expense.trips)?.title ?? null,
        driverName: asOne(expense.drivers)?.display_name ?? null,
        amount: Number(expense.amount),
        currency: expense.currency,
        occurredAt: expense.occurred_at,
        source: expense.source,
        locationText: expense.location_text,
        comment: expense.comment,
        receipt: receipt ? {
          id: receipt.id,
          originalFilename: receipt.original_filename,
          contentType: receipt.content_type,
        } : null,
      };
    }),
    incomes: (incomesResult.data ?? []).map((income) => ({
      id: income.id,
      tripId: income.trip_id,
      customerName: income.customer_name,
      amount: Number(income.amount),
      currency: income.currency,
      reportingCurrency: income.reporting_currency,
      reportingAmountMinor: Number(income.reporting_amount_minor),
      fxRateToReporting: Number(income.fx_rate_to_reporting),
      expectedPaymentAt: income.expected_payment_at,
      paymentStatus: income.payment_status,
      comment: income.comment,
    })),
    supportTickets: ((supportTicketsResult.data ?? []) as SupportTicketRow[]).map((ticket) => ({
      id: ticket.id,
      ticketNumber: Number(ticket.ticket_number),
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      subject: ticket.subject,
      description: ticket.description,
      stepsToReproduce: ticket.steps_to_reproduce,
      contact: ticket.contact,
      responseText: ticket.response_text,
      respondedAt: ticket.responded_at,
      attachmentFilename: ticket.attachment_filename,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    })),
    totals: {
      revenue: summaries.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0),
      expenses: summaries.reduce((sum, item) => sum + Number(item.expenses ?? 0), 0),
      profit: summaries.reduce((sum, item) => sum + Number(item.operating_profit ?? 0), 0),
      totalKm,
      emptyMileagePct: totalKm > 0 ? Number(((emptyKm / totalKm) * 100).toFixed(2)) : null,
    },
  };
}
