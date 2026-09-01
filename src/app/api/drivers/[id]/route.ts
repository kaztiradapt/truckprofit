import { z } from "zod";

import { authenticatedTeamRequest } from "@/server/team-access";

const updateSchema = z.object({
  organizationId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  status: z.enum(["INVITED", "ACTIVE", "INACTIVE"]),
  assignedVehicleId: z.union([z.uuid(), z.null()]),
});
const deleteSchema = z.object({ organizationId: z.uuid() });

function driverError(message: string, deleting = false): string {
  if (message.includes("uses another vehicle")) return "В активном рейсе водителя указана другая машина. Сначала завершите или измените рейс.";
  if (message.includes("active trip")) return "Сначала закройте или переназначьте активный рейс водителя.";
  if (message.includes("already assigned")) return "Этот автомобиль уже закреплён за другим активным водителем.";
  if (message.includes("unavailable")) return "Выбранный автомобиль недоступен.";
  if (message.includes("permission")) return deleting ? "Нет права на удаление водителей." : "Нет права на редактирование водителей.";
  return deleting ? "Не удалось удалить водителя." : "Не удалось обновить водителя.";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте данные водителя." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { error } = await auth.supabase.rpc("update_driver_record", {
    p_organization_id: parsed.data.organizationId,
    p_driver_id: id,
    p_display_name: parsed.data.displayName,
    p_status: parsed.data.status,
    p_assigned_vehicle_id: parsed.data.assignedVehicleId,
  });
  if (error) return Response.json({ error: driverError(error.message) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте водителя." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { error } = await auth.supabase.rpc("archive_driver_record", { p_organization_id: parsed.data.organizationId, p_driver_id: id });
  if (error) return Response.json({ error: driverError(error.message, true) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
}
