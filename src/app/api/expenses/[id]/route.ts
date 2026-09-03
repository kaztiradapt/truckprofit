import { z } from "zod";

import { expenseBehaviors } from "@/domain/reports/management-report";
import { authenticatedTeamRequest } from "@/server/team-access";

const updateSchema = z.object({
  organizationId: z.uuid(),
  costBehavior: z.enum(expenseBehaviors),
  includeInNormalizedCost: z.boolean(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) {
    return Response.json({ error: "Проверьте классификацию расхода." }, { status: 400 });
  }

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("expenses")
    .update({
      cost_behavior: parsed.data.costBehavior,
      include_in_normalized_cost: parsed.data.includeInNormalizedCost,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .eq("organization_id", parsed.data.organizationId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return Response.json({ error: "Нет права изменить расход или база ещё не обновлена." }, { status: 403 });
  if (!data) return Response.json({ error: "Расход не найден." }, { status: 404 });
  return Response.json({ ok: true });
}

