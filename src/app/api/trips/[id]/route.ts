import { z } from "zod";

import { normalizeRouteGeometry } from "@/domain/route-geometry";
import { authenticatedTeamRequest } from "@/server/team-access";
import { sendTripAssignmentNotification, type TripAssignmentNotificationStatus } from "@/server/trip-assignment-notification";

const updateSchema = z.object({
  organizationId: z.uuid(),
  vehicleId: z.uuid(),
  driverId: z.union([z.uuid(), z.null()]),
  title: z.string().trim().min(3).max(160),
  originCity: z.string().trim().min(2).max(160),
  destinationCity: z.string().trim().min(2).max(160),
  originAddress: z.string().trim().min(2).max(300),
  destinationAddress: z.string().trim().min(2).max(300),
  originLatitude: z.number().finite().min(-90).max(90).nullable(),
  originLongitude: z.number().finite().min(-180).max(180).nullable(),
  destinationLatitude: z.number().finite().min(-90).max(90).nullable(),
  destinationLongitude: z.number().finite().min(-180).max(180).nullable(),
  distanceKm: z.number().positive().finite().max(100_000),
  loadState: z.enum(["LOADED", "EMPTY", "UNKNOWN"]),
  startedAt: z.string().date(),
  routeGeometry: z.unknown().optional(),
});
const deleteSchema = z.object({ organizationId: z.uuid() });

function tripError(message: string, deleting = false): string {
  if (message.includes("facts already exist")) return "У рейса уже есть фактические данные. Можно исправить название и маршрут, но нельзя менять машину, водителя, дату или тип пробега.";
  if (message.includes("unavailable")) return "Выбранная машина или водитель сейчас недоступны.";
  if (message.includes("permission")) return deleting ? "Нет права на удаление рейсов." : "Нет права на редактирование рейсов.";
  return deleting ? "Не удалось удалить рейс." : "Не удалось обновить рейс.";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success
    || (parsed.data.originLatitude === null) !== (parsed.data.originLongitude === null)
    || (parsed.data.destinationLatitude === null) !== (parsed.data.destinationLongitude === null)) {
    return Response.json({ error: "Проверьте данные рейса." }, { status: 400 });
  }
  const routeGeometry = parsed.data.routeGeometry === undefined ? undefined : normalizeRouteGeometry(parsed.data.routeGeometry);
  if (parsed.data.routeGeometry !== undefined && !routeGeometry) {
    return Response.json({ error: "Проверьте выбранную линию маршрута." }, { status: 400 });
  }
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { data: existingTrip, error: existingTripError } = await auth.supabase
    .from("trips")
    .select("driver_id")
    .eq("organization_id", parsed.data.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (existingTripError || !existingTrip) return Response.json({ error: "Не удалось проверить текущее назначение рейса." }, { status: 409 });
  const { error } = await auth.supabase.rpc("update_trip_record", {
    p_organization_id: parsed.data.organizationId,
    p_trip_id: id,
    p_vehicle_id: parsed.data.vehicleId,
    p_driver_id: parsed.data.driverId,
    p_title: parsed.data.title,
    p_origin_city: parsed.data.originCity,
    p_destination_city: parsed.data.destinationCity,
    p_origin_address: parsed.data.originAddress,
    p_destination_address: parsed.data.destinationAddress,
    p_origin_latitude: parsed.data.originLatitude,
    p_origin_longitude: parsed.data.originLongitude,
    p_destination_latitude: parsed.data.destinationLatitude,
    p_destination_longitude: parsed.data.destinationLongitude,
    p_distance_km: parsed.data.distanceKm,
    p_load_state: parsed.data.loadState,
    p_started_at: `${parsed.data.startedAt}T00:00:00.000Z`,
  });
  if (error) return Response.json({ error: tripError(error.message) }, { status: error.message.includes("permission") ? 403 : 409 });
  if (routeGeometry) {
    const { error: routeGeometryError } = await auth.supabase.rpc("set_trip_route_geometry", {
      p_organization_id: parsed.data.organizationId,
      p_trip_id: id,
      p_route_geometry: routeGeometry,
    });
    if (routeGeometryError) return Response.json({ error: "Данные рейса обновлены, но линию маршрута сохранить не удалось." }, { status: 409 });
  }
  let notification: TripAssignmentNotificationStatus | null = null;
  if (parsed.data.driverId && parsed.data.driverId !== existingTrip.driver_id) {
    const [driverResult, vehicleResult] = await Promise.all([
      auth.supabase.from("drivers").select("display_name, telegram_user_id").eq("organization_id", parsed.data.organizationId).eq("id", parsed.data.driverId).maybeSingle(),
      auth.supabase.from("vehicles").select("display_name, plate_number").eq("organization_id", parsed.data.organizationId).eq("id", parsed.data.vehicleId).maybeSingle(),
    ]);
    const driver = driverResult.data;
    const vehicle = vehicleResult.data;
    notification = driver && vehicle
      ? await sendTripAssignmentNotification({
        telegramUserId: driver.telegram_user_id,
        driverName: driver.display_name,
        tripTitle: parsed.data.title,
        vehicleName: `${vehicle.display_name} · ${vehicle.plate_number}`,
        originCity: parsed.data.originCity,
        destinationCity: parsed.data.destinationCity,
        originAddress: parsed.data.originAddress,
        destinationAddress: parsed.data.destinationAddress,
        startedAt: parsed.data.startedAt,
      })
      : "FAILED";
  }
  return Response.json({ ok: true, notification });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте рейс." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { error } = await auth.supabase.rpc("archive_trip_record", { p_organization_id: parsed.data.organizationId, p_trip_id: id });
  if (error) return Response.json({ error: tripError(error.message, true) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
}
