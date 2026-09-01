import { z } from "zod";

import { authenticatedTeamRequest } from "@/server/team-access";

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
  loadState: z.enum(["LOADED", "EMPTY", "UNKNOWN"]),
  startedAt: z.string().date(),
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
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
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
    p_load_state: parsed.data.loadState,
    p_started_at: `${parsed.data.startedAt}T00:00:00.000Z`,
  });
  if (error) return Response.json({ error: tripError(error.message) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
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
