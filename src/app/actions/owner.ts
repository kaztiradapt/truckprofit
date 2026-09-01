"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { supportedCurrencies } from "@/domain/currencies";
import type { PermissionCode } from "@/server/team-access";
import { calculateAndPublishTripPnl } from "@/server/trip-pnl-service";

const uuid = z.uuid();
const money = z.coerce.number().positive().finite().max(999_999_999);
const text = (min: number, max = 160) => z.string().trim().min(min).max(max);
const optionalCoordinate = (minimum: number, maximum: number) => z.preprocess(
  (value) => value === null || value === undefined || String(value).trim() === "" ? null : Number(String(value).replace(",", ".")),
  z.number().finite().min(minimum).max(maximum).nullable(),
);
const organizationInput = z.object({
  name: text(2),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  currency: z.enum(supportedCurrencies),
  ownerDriver: z.boolean(),
});

function dashboardError(message: string): never {
  redirect(`/dashboard?error=${encodeURIComponent(message)}`);
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");
  return { supabase, userId };
}

async function requirePermission(organizationId: string, permission: PermissionCode) {
  const { supabase, userId } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role, status, organization_access_roles(permissions)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  const nestedRole = data?.organization_access_roles;
  const accessRole = Array.isArray(nestedRole) ? nestedRole[0] : nestedRole;
  if (error || !data || (data.role !== "OWNER" && !accessRole?.permissions?.includes(permission))) {
    dashboardError("Недостаточно прав для этого действия.");
  }
  return supabase;
}

async function requireOwner(organizationId: string) {
  const { supabase, userId } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data || data.role !== "OWNER") dashboardError("Только владелец может включить этот режим.");
  return { supabase, userId };
}

export async function createOrganization(formData: FormData): Promise<void> {
  const parsed = organizationInput.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    currency: formData.get("currency"),
    ownerDriver: formData.get("owner_driver") === "yes",
  });
  if (!parsed.success) redirect("/onboarding?error=Проверьте%20название%2C%20код%20и%20валюту.");

  const { supabase } = await getAuthenticatedUser();
  const { error } = await supabase.rpc("bootstrap_organization_with_owner", {
    input_name: parsed.data.name,
    input_slug: parsed.data.slug,
    input_currency: parsed.data.currency,
    input_timezone: "Asia/Qostanay",
    input_create_owner_driver: parsed.data.ownerDriver,
  });
  if (error) redirect("/onboarding?error=Не%20удалось%20создать%20организацию.%20Возможно%2C%20код%20уже%20занят.");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function enableOwnerDriverMode(formData: FormData): Promise<void> {
  const parsed = z.object({ organizationId: uuid }).safeParse({ organizationId: formData.get("organization_id") });
  if (!parsed.success) dashboardError("Не удалось включить режим владельца-водителя.");

  const { supabase } = await requireOwner(parsed.data.organizationId);
  const { error } = await supabase.rpc("enable_owner_driver_mode", {
    p_organization_id: parsed.data.organizationId,
  });
  if (error) dashboardError("Не удалось создать ваш профиль водителя.");

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard?message=${encodeURIComponent("Режим «владелец-водитель» включён. Теперь добавьте автомобиль.")}`);
}

export async function createVehicle(formData: FormData): Promise<void> {
  const parsed = z.object({
    organizationId: uuid,
    displayName: text(2),
    plateNumber: text(3, 32),
    makeModel: z.string().trim().max(160),
    fuelNorm: z.string().trim(),
  }).safeParse({
    organizationId: formData.get("organization_id"), displayName: formData.get("display_name"), plateNumber: formData.get("plate_number"), makeModel: formData.get("make_model"), fuelNorm: formData.get("fuel_norm"),
  });
  if (!parsed.success) dashboardError("Проверьте данные машины.");
  const fuelNorm = parsed.data.fuelNorm ? Number(parsed.data.fuelNorm.replace(",", ".")) : null;
  if (fuelNorm !== null && (!Number.isFinite(fuelNorm) || fuelNorm <= 0 || fuelNorm > 200)) dashboardError("Норма топлива должна быть от 0 до 200 л/100 км.");

  const supabase = await requirePermission(parsed.data.organizationId, "MANAGE_VEHICLES");
  const { error } = await supabase.from("vehicles").insert({
    organization_id: parsed.data.organizationId,
    display_name: parsed.data.displayName,
    plate_number: parsed.data.plateNumber.toUpperCase(),
    make_model: parsed.data.makeModel || null,
    fuel_norm_l_per_100km: fuelNorm,
  });
  if (error) dashboardError("Не удалось сохранить машину. Проверьте, не повторяется ли госномер.");
  revalidatePath("/dashboard", "layout");
}

export async function createDriver(formData: FormData): Promise<void> {
  const parsed = z.object({ organizationId: uuid, displayName: text(2) }).safeParse({
    organizationId: formData.get("organization_id"), displayName: formData.get("display_name"),
  });
  if (!parsed.success) dashboardError("Введите имя водителя.");
  const supabase = await requirePermission(parsed.data.organizationId, "MANAGE_DRIVERS");
  const { error } = await supabase.from("drivers").insert({
    organization_id: parsed.data.organizationId,
    display_name: parsed.data.displayName,
    status: "ACTIVE",
  });
  if (error) dashboardError("Не удалось сохранить водителя.");
  revalidatePath("/dashboard", "layout");
}

export async function createTrip(formData: FormData): Promise<void> {
  const parsed = z.object({
    organizationId: uuid,
    vehicleId: uuid,
    driverId: z.string().trim(),
    title: text(3),
    originCity: text(2),
    destinationCity: text(2),
    originAddress: text(2, 300),
    destinationAddress: text(2, 300),
    originLatitude: optionalCoordinate(-90, 90),
    originLongitude: optionalCoordinate(-180, 180),
    destinationLatitude: optionalCoordinate(-90, 90),
    destinationLongitude: optionalCoordinate(-180, 180),
    loadState: z.enum(["LOADED", "EMPTY", "UNKNOWN"]),
    startedAt: z.string().date(),
  }).safeParse({
    organizationId: formData.get("organization_id"), vehicleId: formData.get("vehicle_id"), driverId: formData.get("driver_id"), title: formData.get("title"),
    originCity: formData.get("origin_city"), destinationCity: formData.get("destination_city"), originAddress: formData.get("origin_address"), destinationAddress: formData.get("destination_address"),
    originLatitude: formData.get("origin_latitude"), originLongitude: formData.get("origin_longitude"), destinationLatitude: formData.get("destination_latitude"), destinationLongitude: formData.get("destination_longitude"),
    loadState: formData.get("load_state"), startedAt: formData.get("started_at"),
  });
  if (!parsed.success) dashboardError("Проверьте данные рейса.");
  if ((parsed.data.originLatitude === null) !== (parsed.data.originLongitude === null)
    || (parsed.data.destinationLatitude === null) !== (parsed.data.destinationLongitude === null)) {
    dashboardError("Для геометки нужны и широта, и долгота.");
  }
  const driverId = parsed.data.driverId ? uuid.safeParse(parsed.data.driverId) : null;
  if (driverId && !driverId.success) dashboardError("Выберите водителя из списка.");

  const supabase = await requirePermission(parsed.data.organizationId, "MANAGE_TRIPS");
  const { error } = await supabase.rpc("create_trip_with_first_leg", {
    p_organization_id: parsed.data.organizationId,
    p_vehicle_id: parsed.data.vehicleId,
    p_driver_id: driverId?.data ?? null,
    p_title: parsed.data.title,
    p_origin_city: parsed.data.originCity,
    p_destination_city: parsed.data.destinationCity,
    p_origin_address: parsed.data.originAddress,
    p_destination_address: parsed.data.destinationAddress,
    p_origin_latitude: parsed.data.originLatitude,
    p_origin_longitude: parsed.data.originLongitude,
    p_destination_latitude: parsed.data.destinationLatitude,
    p_destination_longitude: parsed.data.destinationLongitude,
    p_load_state: parsed.data.loadState,
    p_started_at: `${parsed.data.startedAt}T00:00:00.000Z`,
  });
  if (error) dashboardError("Не удалось создать рейс. Проверьте машину, водителя и точки маршрута.");
  revalidatePath("/dashboard", "layout");
}

export async function createIncome(formData: FormData): Promise<void> {
  const parsed = z.object({
    organizationId: uuid,
    tripId: uuid,
    customerName: z.string().trim().max(160),
    amount: money,
    currency: z.enum(supportedCurrencies),
    fxRate: z.coerce.number().positive().finite().max(1_000_000_000).optional(),
    expectedPaymentAt: z.string().trim(),
    comment: z.string().trim().max(1000),
  }).safeParse({
    organizationId: formData.get("organization_id"), tripId: formData.get("trip_id"), customerName: formData.get("customer_name"), amount: String(formData.get("amount") ?? "").replace(",", "."),
    currency: formData.get("currency"), fxRate: formData.get("fx_rate") ? String(formData.get("fx_rate")).replace(",", ".") : undefined, expectedPaymentAt: formData.get("expected_payment_at"), comment: formData.get("comment"),
  });
  if (!parsed.success || (parsed.data.expectedPaymentAt && !z.string().date().safeParse(parsed.data.expectedPaymentAt).success)) {
    dashboardError("Проверьте сумму и дату ожидаемой оплаты.");
  }
  const supabase = await requirePermission(parsed.data.organizationId, "MANAGE_FINANCE");
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("base_currency")
    .eq("id", parsed.data.organizationId)
    .single();
  if (organizationError || !organization) dashboardError("Не удалось определить базовую валюту компании.");
  if (parsed.data.currency !== organization.base_currency && !parsed.data.fxRate) {
    dashboardError(`Для ${parsed.data.currency} укажите курс к ${organization.base_currency}.`);
  }
  const { error } = await supabase.rpc("record_owner_income", {
    p_organization_id: parsed.data.organizationId,
    p_trip_id: parsed.data.tripId,
    p_customer_name: parsed.data.customerName || null,
    p_amount: parsed.data.amount,
    p_currency: parsed.data.currency,
    p_expected_payment_at: parsed.data.expectedPaymentAt || null,
    p_comment: parsed.data.comment || null,
    p_fx_rate_to_reporting: parsed.data.currency === organization.base_currency ? 1 : parsed.data.fxRate,
  });
  if (error) dashboardError("Не удалось сохранить доход. Проверьте сумму, валюту и курс.");
  revalidatePath("/dashboard", "layout");
}

export async function reviewExpense(formData: FormData): Promise<void> {
  const parsed = z.object({
    organizationId: uuid,
    expenseId: uuid,
    decision: z.enum(["APPROVED", "REJECTED"]),
  }).safeParse({
    organizationId: formData.get("organization_id"),
    expenseId: formData.get("expense_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) dashboardError("Проверьте решение по расходу.");
  const supabase = await requirePermission(parsed.data.organizationId, "REVIEW_EXPENSES");
  const { error } = await supabase.rpc("review_expense", {
    p_organization_id: parsed.data.organizationId,
    p_expense_id: parsed.data.expenseId,
    p_decision: parsed.data.decision,
    p_note: null,
  });
  if (error) dashboardError("Не удалось проверить расход. Возможно, он уже обработан.");
  revalidatePath("/dashboard", "layout");
}

export async function completeTrip(formData: FormData): Promise<void> {
  const parsed = z.object({ organizationId: uuid, tripId: uuid }).safeParse({
    organizationId: formData.get("organization_id"),
    tripId: formData.get("trip_id"),
  });
  if (!parsed.success) dashboardError("Выберите рейс для закрытия.");
  const supabase = await requirePermission(parsed.data.organizationId, "MANAGE_TRIPS");
  const { error } = await supabase.rpc("complete_trip_from_facts", {
    p_organization_id: parsed.data.organizationId,
    p_trip_id: parsed.data.tripId,
  });
  if (error) dashboardError("Рейс нельзя закрыть: завершите все плечи с одометром и статусом груза.");
  revalidatePath("/dashboard", "layout");
}

export async function recalculateTripPnl(formData: FormData): Promise<void> {
  const parsed = z.object({ organizationId: uuid, tripId: uuid }).safeParse({
    organizationId: formData.get("organization_id"),
    tripId: formData.get("trip_id"),
  });
  if (!parsed.success) dashboardError("Выберите рейс для расчёта.");
  await requirePermission(parsed.data.organizationId, "MANAGE_FINANCE");
  try {
    await calculateAndPublishTripPnl({ organizationId: parsed.data.organizationId, tripId: parsed.data.tripId });
  } catch {
    dashboardError("P&L пока не рассчитан: проверьте утверждение расходов, плечи рейса и настройку сервера.");
  }
  revalidatePath("/dashboard", "layout");
}
