import { z } from "zod";

import { authenticatedTeamRequest } from "@/server/team-access";

const updateSchema = z.object({
  organizationId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  plateNumber: z.string().trim().min(3).max(32),
  makeModel: z.string().trim().max(160),
  fuelNorm: z.union([z.number().positive().max(200), z.null()]),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE", "ARCHIVED"]),
});

const deleteSchema = z.object({ organizationId: z.uuid() });

function vehicleError(message: string, deleting = false): string {
  if (message.includes("active trip")) return "Сначала закройте или удалите активный рейс этой машины.";
  if (message.includes("permission")) return deleting ? "Нет права на удаление машин." : "Нет права на редактирование машин.";
  if (message.includes("duplicate") || message.includes("unique")) return "Машина с таким госномером уже существует.";
  return deleting ? "Не удалось удалить машину." : "Не удалось обновить машину.";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте данные машины." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { error } = await auth.supabase.rpc("update_vehicle_record", {
    p_organization_id: parsed.data.organizationId,
    p_vehicle_id: id,
    p_display_name: parsed.data.displayName,
    p_plate_number: parsed.data.plateNumber,
    p_make_model: parsed.data.makeModel,
    p_fuel_norm: parsed.data.fuelNorm,
    p_status: parsed.data.status,
  });
  if (error) return Response.json({ error: vehicleError(error.message) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте машину." }, { status: 400 });
  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { error } = await auth.supabase.rpc("archive_vehicle_record", { p_organization_id: parsed.data.organizationId, p_vehicle_id: id });
  if (error) return Response.json({ error: vehicleError(error.message, true) }, { status: error.message.includes("permission") ? 403 : 409 });
  return Response.json({ ok: true });
}

