import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  ActiveTrip,
  DriverBotRepository,
  DriverIdentity,
  PreliminaryCompensation,
  ReceiptUpload,
  RecordExpenseInput,
  RecordStatusInput,
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

  async findActiveTrip(driver: DriverIdentity): Promise<ActiveTrip | null> {
    const { data, error } = await this.client
      .from("trips")
      .select("id, organization_id, driver_id, vehicle_id, title")
      .eq("organization_id", driver.organizationId)
      .eq("driver_id", driver.driverId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError(error);
    if (!data) return null;
    return {
      id: data.id,
      organizationId: data.organization_id,
      driverId: data.driver_id,
      vehicleId: data.vehicle_id,
      title: data.title,
      currency: driver.baseCurrency,
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
