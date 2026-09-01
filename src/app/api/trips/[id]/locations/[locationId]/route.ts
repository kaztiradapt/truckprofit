import { z } from "zod";

import { authenticatedTeamRequest } from "@/server/team-access";

const updateSchema = z.object({
  organizationId: z.uuid(),
  eventType: z.enum(["CHECKPOINT", "REST", "LOADING", "UNLOADING", "OTHER"]),
  note: z.string().trim().max(300),
});

function locationError(message: string): { message: string; status: number } {
  if (message.includes("permission")) return { message: "Нет права редактировать отметки рейса.", status: 403 };
  if (message.includes("not found")) return { message: "Отметка не найдена.", status: 404 };
  if (message.includes("too long") || message.includes("Invalid")) return { message: "Проверьте тип и комментарий отметки.", status: 400 };
  return { message: "Не удалось сохранить подпись отметки.", status: 409 };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; locationId: string }> },
): Promise<Response> {
  const { id, locationId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success || !z.uuid().safeParse(locationId).success) {
    return Response.json({ error: "Проверьте данные отметки." }, { status: 400 });
  }

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const { data: point, error: pointError } = await auth.supabase
    .from("trip_location_points")
    .select("id")
    .eq("id", locationId)
    .eq("trip_id", id)
    .eq("organization_id", parsed.data.organizationId)
    .maybeSingle();
  if (pointError || !point) return Response.json({ error: "Отметка рейса не найдена." }, { status: 404 });

  const { error } = await auth.supabase.rpc("update_trip_location_annotation", {
    p_organization_id: parsed.data.organizationId,
    p_location_id: locationId,
    p_event_type: parsed.data.eventType,
    p_note: parsed.data.note,
  });
  if (error) {
    const friendly = locationError(error.message);
    return Response.json({ error: friendly.message }, { status: friendly.status });
  }
  return Response.json({ ok: true });
}
