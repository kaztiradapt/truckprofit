import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  ActiveTrip,
  DriverBotRepository,
  DriverIdentity,
  OwnerDriverSummary,
  OwnerExpenseSummary,
  OwnerIdentity,
  OwnerSummary,
  OwnerTripSummary,
  OrganizationScope,
  PreliminaryCompensation,
  ReceiptUpload,
  RecordExpenseInput,
  RecordLocationInput,
  RecordStatusInput,
  StaffIdentity,
} from "../bot/repository";
import type { BotEnvironment } from "./env";

type RawDriver = {
  id: string;
  organization_id: string;
  display_name: string;
  organizations: { base_currency: string } | { base_currency: string }[] | null;
};

type ClaimedInvitation = {
  organization_id: string;
  driver_id: string;
  driver_name: string;
  base_currency: string;
};

type ClaimedOwnerInvitation = {
  organization_id: string;
  profile_id: string;
  owner_name: string;
  organization_name: string;
  base_currency: string;
};

type RawStaff = {
  id: string;
  organization_id: string;
  display_name: string;
  organizations: { name: string; base_currency: string } | { name: string; base_currency: string }[] | null;
  organization_access_roles: { name: string; permissions: string[] } | { name: string; permissions: string[] }[] | null;
};

type RawOwnerMembership = {
  organization_id: string;
  organizations: { name: string; base_currency: string } | { name: string; base_currency: string }[] | null;
};

type RawOwnerTrip = {
  id: string;
  title: string;
  started_at: string | null;
  vehicles: { display_name: string; plate_number: string } | { display_name: string; plate_number: string }[] | null;
  drivers: { display_name: string } | { display_name: string }[] | null;
};

type RawOwnerExpense = {
  id: string;
  amount: number | string;
  currency: string;
  occurred_at: string;
  expense_categories: { display_name: string } | { display_name: string }[] | null;
  trips: { title: string } | { title: string }[] | null;
  drivers: { display_name: string } | { display_name: string }[] | null;
};

type RawActiveTrip = {
  id: string;
  organization_id: string;
  driver_id: string;
  vehicle_id: string;
  title: string;
  trip_legs: Array<{
    origin_city: string;
    destination_city: string;
    origin_address: string;
    destination_address: string;
    origin_latitude: number | string | null;
    origin_longitude: number | string | null;
    destination_latitude: number | string | null;
    destination_longitude: number | string | null;
  }>;
};

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function toIdentity(driver: RawDriver): DriverIdentity {
  const organization = Array.isArray(driver.organizations) ? driver.organizations[0] : driver.organizations;
  if (!organization?.base_currency) throw new Error("Driver organization is missing a base currency");
  return {
    organizationId: driver.organization_id,
    driverId: driver.id,
    driverName: driver.display_name,
    baseCurrency: organization.base_currency,
  };
}

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function moneyToMinor(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("Invalid monetary value returned by database");
  return Math.round(amount * 100);
}

function toAmount(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Amount must be a positive safe integer in minor units");
  return amountMinor / 100;
}

export class SupabaseDriverBotRepository implements DriverBotRepository {
  private readonly client: SupabaseClient;

  constructor(environment: Pick<BotEnvironment, "supabaseUrl" | "supabaseServiceRoleKey">) {
    this.client = createClient(environment.supabaseUrl, environment.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async loadConversation(conversationKey: string): Promise<object | undefined> {
    const { data, error } = await this.client
      .from("telegram_conversations")
      .select("state, expires_at")
      .eq("conversation_key", conversationKey)
      .maybeSingle();
    throwOnError(error);
    if (!data) return undefined;
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await this.deleteConversation(conversationKey);
      return undefined;
    }
    return data.state as object;
  }

  async saveConversation(conversationKey: string, state: object): Promise<void> {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error } = await this.client.from("telegram_conversations").upsert({
      conversation_key: conversationKey,
      state,
      expires_at: expiresAt,
    });
    throwOnError(error);
  }

  async deleteConversation(conversationKey: string): Promise<void> {
    const { error } = await this.client.from("telegram_conversations").delete().eq("conversation_key", conversationKey);
    throwOnError(error);
  }

  async reserveIncomingUpdate(updateId: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("reserve_telegram_update", { p_telegram_update_id: updateId });
    throwOnError(error);
    return data === true;
  }

  async finishIncomingUpdate(updateId: number, outcome: "PROCESSED" | "FAILED", safeErrorSummary?: string): Promise<void> {
    const { error } = await this.client.rpc("finish_telegram_update", {
      p_telegram_update_id: updateId,
      p_status: outcome,
      p_error_summary: safeErrorSummary ?? null,
    });
    throwOnError(error);
  }

  async claimInvitation(invitationCode: string, telegramUserId: number): Promise<DriverIdentity> {
    const { data, error } = await this.client.rpc("claim_driver_telegram_invite", {
      p_invitation_code: invitationCode,
      p_telegram_user_id: telegramUserId,
    }).single();
    throwOnError(error);
    const invitation = data as ClaimedInvitation;
    return {
      organizationId: invitation.organization_id,
      driverId: invitation.driver_id,
      driverName: invitation.driver_name,
      baseCurrency: invitation.base_currency,
    };
  }

  async claimOwnerInvitation(invitationCode: string, telegramUserId: number): Promise<OwnerIdentity> {
    const { data, error } = await this.client.rpc("claim_owner_telegram_invite", {
      p_invitation_code: invitationCode,
      p_telegram_user_id: telegramUserId,
    }).single();
    throwOnError(error);
    const invitation = data as ClaimedOwnerInvitation;
    return {
      organizationId: invitation.organization_id,
      profileId: invitation.profile_id,
      ownerName: invitation.owner_name,
      organizationName: invitation.organization_name,
      baseCurrency: invitation.base_currency,
    };
  }

  async claimStaffInvitation(invitationCode: string, telegramUserId: number, telegramUsername: string | null): Promise<StaffIdentity> {
    const { error } = await this.client.rpc("claim_staff_telegram_invite", {
      p_invitation_code: invitationCode,
      p_telegram_user_id: telegramUserId,
      p_telegram_username: telegramUsername,
    }).single();
    throwOnError(error);
    const staff = await this.findStaffByTelegramUserId(telegramUserId);
    if (!staff) throw new Error("Claimed staff identity is unavailable");
    return staff;
  }

  async syncTelegramUsername(telegramUserId: number, telegramUsername: string | null): Promise<void> {
    const { error } = await this.client.rpc("sync_telegram_username", {
      p_telegram_user_id: telegramUserId,
      p_telegram_username: telegramUsername,
    });
    throwOnError(error);
  }

  async findDriverByTelegramUserId(telegramUserId: number): Promise<DriverIdentity | null> {
    const { data, error } = await this.client
      .from("drivers")
      .select("id, organization_id, display_name, organizations(base_currency)")
      .eq("telegram_user_id", telegramUserId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .maybeSingle();
    throwOnError(error);
    return data ? toIdentity(data as unknown as RawDriver) : null;
  }

  async findOwnerByTelegramUserId(telegramUserId: number): Promise<OwnerIdentity | null> {
    const { data: profile, error: profileError } = await this.client
      .from("profiles")
      .select("id, display_name")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    throwOnError(profileError);
    if (!profile) return null;

    const { data: membershipData, error: membershipError } = await this.client
      .from("organization_memberships")
      .select("organization_id, organizations(name, base_currency)")
      .eq("user_id", profile.id)
      .eq("role", "OWNER")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    throwOnError(membershipError);
    if (!membershipData) return null;
    const membership = membershipData as unknown as RawOwnerMembership;
    const organization = asOne(membership.organizations);
    if (!organization) throw new Error("Owner organization is unavailable");
    return {
      organizationId: membership.organization_id,
      profileId: profile.id,
      ownerName: profile.display_name || "Владелец",
      organizationName: organization.name,
      baseCurrency: organization.base_currency,
    };
  }

  async findStaffByTelegramUserId(telegramUserId: number): Promise<StaffIdentity | null> {
    const { data, error } = await this.client
      .from("organization_staff")
      .select("id, organization_id, display_name, organizations(name, base_currency), organization_access_roles(name, permissions)")
      .eq("telegram_user_id", telegramUserId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    throwOnError(error);
    if (!data) return null;
    const staff = data as unknown as RawStaff;
    const organization = asOne(staff.organizations);
    const role = asOne(staff.organization_access_roles);
    if (!organization) throw new Error("Staff organization is unavailable");
    return {
      organizationId: staff.organization_id,
      staffId: staff.id,
      staffName: staff.display_name,
      organizationName: organization.name,
      baseCurrency: organization.base_currency,
      roleName: role?.name ?? "Сотрудник",
      permissions: role?.permissions ?? [],
    };
  }

  async getOwnerSummary(owner: OrganizationScope): Promise<OwnerSummary> {
    const today = new Date().toISOString().slice(0, 10);
    const [vehicles, drivers, activeTrips, overdueIncomes, financials] = await Promise.all([
      this.client.from("vehicles").select("id", { count: "exact", head: true }).eq("organization_id", owner.organizationId).eq("status", "ACTIVE").is("deleted_at", null),
      this.client.from("drivers").select("id", { count: "exact", head: true }).eq("organization_id", owner.organizationId).eq("status", "ACTIVE").is("deleted_at", null),
      this.client.from("trips").select("id", { count: "exact", head: true }).eq("organization_id", owner.organizationId).eq("status", "ACTIVE").is("deleted_at", null),
      this.client.from("incomes").select("id", { count: "exact", head: true }).eq("organization_id", owner.organizationId).in("payment_status", ["PLANNED", "INVOICED", "PARTIAL", "OVERDUE"]).lt("expected_payment_at", today).is("deleted_at", null),
      this.client.from("trip_financial_summary").select("revenue, expenses, operating_profit").eq("organization_id", owner.organizationId),
    ]);
    for (const result of [vehicles, drivers, activeTrips, overdueIncomes, financials]) throwOnError(result.error);

    const financialRows = financials.data ?? [];
    return {
      vehicleCount: vehicles.count ?? 0,
      driverCount: drivers.count ?? 0,
      activeTripCount: activeTrips.count ?? 0,
      overdueIncomeCount: overdueIncomes.count ?? 0,
      revenueMinor: financialRows.reduce((sum, item) => sum + moneyToMinor(item.revenue), 0),
      expensesMinor: financialRows.reduce((sum, item) => sum + moneyToMinor(item.expenses), 0),
      profitMinor: financialRows.reduce((sum, item) => sum + moneyToMinor(item.operating_profit), 0),
    };
  }

  async listOwnerActiveTrips(owner: OrganizationScope): Promise<OwnerTripSummary[]> {
    const { data, error } = await this.client
      .from("trips")
      .select("id, title, started_at, vehicles(display_name, plate_number), drivers(display_name)")
      .eq("organization_id", owner.organizationId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(10);
    throwOnError(error);
    return ((data ?? []) as unknown as RawOwnerTrip[]).map((trip) => {
      const vehicle = asOne(trip.vehicles);
      return {
        id: trip.id,
        title: trip.title,
        vehicleName: vehicle ? `${vehicle.display_name} · ${vehicle.plate_number}` : "Машина не указана",
        driverName: asOne(trip.drivers)?.display_name ?? null,
        startedAt: trip.started_at,
      };
    });
  }

  async listOwnerDrivers(owner: OrganizationScope): Promise<OwnerDriverSummary[]> {
    const { data, error } = await this.client
      .from("drivers")
      .select("id, display_name, status, telegram_user_id")
      .eq("organization_id", owner.organizationId)
      .is("deleted_at", null)
      .order("display_name")
      .limit(20);
    throwOnError(error);
    return (data ?? []).map((driver) => ({
      id: driver.id,
      displayName: driver.display_name,
      status: driver.status,
      telegramLinked: driver.telegram_user_id !== null,
    }));
  }

  async listOwnerRecentExpenses(owner: OrganizationScope): Promise<OwnerExpenseSummary[]> {
    const { data, error } = await this.client
      .from("expenses")
      .select("id, amount, currency, occurred_at, expense_categories(display_name), trips(title), drivers(display_name)")
      .eq("organization_id", owner.organizationId)
      .neq("review_status", "REJECTED")
      .eq("status", "RECORDED")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(10);
    throwOnError(error);
    return ((data ?? []) as unknown as RawOwnerExpense[]).map((expense) => ({
      id: expense.id,
      categoryName: asOne(expense.expense_categories)?.display_name ?? "Расход",
      tripTitle: asOne(expense.trips)?.title ?? null,
      driverName: asOne(expense.drivers)?.display_name ?? null,
      amountMinor: moneyToMinor(expense.amount),
      currency: expense.currency,
      occurredAt: expense.occurred_at,
    }));
  }

  async findActiveTrip(driver: DriverIdentity): Promise<ActiveTrip | null> {
    const { data, error } = await this.client
      .from("trips")
      .select("id, organization_id, driver_id, vehicle_id, title, trip_legs(origin_city, destination_city, origin_address, destination_address, origin_latitude, origin_longitude, destination_latitude, destination_longitude)")
      .eq("organization_id", driver.organizationId)
      .eq("driver_id", driver.driverId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError(error);
    if (!data) return null;
    const trip = data as unknown as RawActiveTrip;
    const firstLeg = trip.trip_legs[0];
    if (!firstLeg) throw new Error("Active trip has no route");
    const { data: latestStatus, error: statusError } = await this.client
      .from("vehicle_status_records")
      .select("status_code")
      .eq("organization_id", driver.organizationId)
      .eq("trip_id", trip.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError(statusError);
    return {
      id: trip.id,
      organizationId: trip.organization_id,
      driverId: trip.driver_id,
      vehicleId: trip.vehicle_id,
      title: trip.title,
      currency: driver.baseCurrency,
      originCity: firstLeg.origin_city,
      destinationCity: firstLeg.destination_city,
      originAddress: firstLeg.origin_address,
      destinationAddress: firstLeg.destination_address,
      originLatitude: firstLeg.origin_latitude === null ? null : Number(firstLeg.origin_latitude),
      originLongitude: firstLeg.origin_longitude === null ? null : Number(firstLeg.origin_longitude),
      destinationLatitude: firstLeg.destination_latitude === null ? null : Number(firstLeg.destination_latitude),
      destinationLongitude: firstLeg.destination_longitude === null ? null : Number(firstLeg.destination_longitude),
      latestStatusCode: latestStatus?.status_code as ActiveTrip["latestStatusCode"] ?? null,
    };
  }

  async recordExpense(input: RecordExpenseInput): Promise<{ expenseId: string }> {
    const fuelPricePerLitre = input.fuelLitres ? toAmount(input.amountMinor) / input.fuelLitres : null;
    const { data, error } = await this.client.rpc("record_telegram_expense", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_category_code: input.categoryCode,
      p_amount: toAmount(input.amountMinor),
      p_currency: input.currency,
      p_occurred_at: input.occurredAt.toISOString(),
      p_odometer_km: input.odometerKm ?? null,
      p_quantity: input.fuelLitres ?? null,
      p_unit: input.fuelLitres ? "L" : null,
      p_price_per_unit: fuelPricePerLitre,
      p_location_text: null,
      p_comment: null,
    });
    throwOnError(error);
    return { expenseId: String(data) };
  }

  async recordOdometer(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm" | "occurredAt">): Promise<void> {
    if (input.odometerKm === undefined) throw new Error("Odometer value is required");
    const { error } = await this.client.rpc("record_telegram_odometer", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_value_km: input.odometerKm,
      p_recorded_at: input.occurredAt.toISOString(),
    });
    throwOnError(error);
  }

  async startAssignedLeg(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm"> & { loadState: "LOADED" | "EMPTY" }): Promise<void> {
    if (input.odometerKm === undefined || !Number.isInteger(input.odometerKm)) throw new Error("A whole-kilometre odometer value is required");
    const { error } = await this.client.rpc("driver_start_assigned_leg", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_odometer_km: input.odometerKm,
      p_load_state: input.loadState,
    });
    throwOnError(error);
  }

  async finishAssignedLeg(input: Pick<RecordExpenseInput, "organizationId" | "driverId" | "tripId" | "odometerKm">): Promise<void> {
    if (input.odometerKm === undefined || !Number.isInteger(input.odometerKm)) throw new Error("A whole-kilometre odometer value is required");
    const { error } = await this.client.rpc("driver_finish_assigned_leg", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_odometer_km: input.odometerKm,
    });
    throwOnError(error);
  }

  async recordStatus(input: RecordStatusInput): Promise<void> {
    const { error } = await this.client.rpc("record_telegram_vehicle_status", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_status_code: input.statusCode,
      p_load_state: input.loadState,
      p_location_text: input.locationText,
      p_recorded_at: input.occurredAt.toISOString(),
    });
    throwOnError(error);
  }

  async recordLocation(input: RecordLocationInput): Promise<{ locationId: string }> {
    const { data, error } = await this.client.rpc("record_telegram_trip_location", {
      p_organization_id: input.organizationId,
      p_driver_id: input.driverId,
      p_trip_id: input.tripId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_horizontal_accuracy_m: input.horizontalAccuracyM,
      p_event_type: input.eventType,
      p_note: input.note,
      p_recorded_at: input.occurredAt.toISOString(),
      p_telegram_message_id: input.telegramMessageId,
    });
    throwOnError(error);
    if (!data) throw new Error("Location was not recorded");
    return { locationId: String(data) };
  }

  async findPreliminaryCompensation(driver: DriverIdentity, tripId: string): Promise<PreliminaryCompensation | null> {
    const { data, error } = await this.client
      .from("driver_compensation_calculations")
      .select("amount, currency, calculation_status")
      .eq("organization_id", driver.organizationId)
      .eq("driver_id", driver.driverId)
      .eq("trip_id", tripId)
      .in("calculation_status", ["PRELIMINARY", "APPROVED"])
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError(error);
    if (!data) return null;
    return {
      amountMinor: Math.round(Number(data.amount) * 100),
      currency: data.currency,
      status: data.calculation_status,
    };
  }

  async uploadReceipt(upload: ReceiptUpload): Promise<void> {
    if (upload.content.byteLength > 10 * 1024 * 1024) throw new Error("Receipt image is larger than 10 MB");
    const { data: expense, error: expenseError } = await this.client
      .from("expenses")
      .select("organization_id, driver_id")
      .eq("id", upload.expenseId)
      .eq("organization_id", upload.organizationId)
      .eq("driver_id", upload.driverId)
      .is("deleted_at", null)
      .maybeSingle();
    throwOnError(expenseError);
    if (!expense) throw new Error("Expense is unavailable for this driver");

    const extension = upload.contentType === "image/png" ? "png" : "jpg";
    const storagePath = `${upload.organizationId}/${upload.expenseId}/receipt-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await this.client.storage
      .from("expense-receipts")
      .upload(storagePath, upload.content, { contentType: upload.contentType, upsert: false });
    throwOnError(uploadError);

    const { data: attachment, error: attachmentError } = await this.client.from("attachments").insert({
      organization_id: upload.organizationId,
      expense_id: upload.expenseId,
      storage_bucket: "expense-receipts",
      storage_path: storagePath,
      original_filename: upload.originalFilename,
      content_type: upload.contentType,
      size_bytes: upload.content.byteLength,
    }).select("id").single();
    if (attachmentError) {
      await this.client.storage.from("expense-receipts").remove([storagePath]);
      throw new Error(attachmentError.message);
    }

    const { error: auditError } = await this.client.from("audit_events").insert({
      organization_id: upload.organizationId,
      entity_type: "attachment",
      entity_id: attachment.id,
      action: "RECEIPT_ATTACHED",
      source: "TELEGRAM",
    });
    throwOnError(auditError);
  }
}
