import { z } from "zod";

import { authenticatedTeamRequest, getOrganizationTeamAccess, permissionCodes } from "@/server/team-access";

const inputSchema = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.enum(permissionCodes)).max(permissionCodes.length),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Проверьте название и права роли." }, { status: 400 });
  const context = await authenticatedTeamRequest();
  if (!context) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const teamAccess = await getOrganizationTeamAccess(context, parsed.data.organizationId);
  if (!teamAccess.canManageTeam) return Response.json({ error: "Недостаточно прав для управления ролями." }, { status: 403 });
  if (["совладелец", "управляющий", "диспетчер", "наблюдатель"].includes(parsed.data.name.toLocaleLowerCase("ru-RU"))) {
    return Response.json({ error: "Это название зарезервировано для системной роли." }, { status: 409 });
  }

  const permissions = Array.from(new Set(["VIEW_DASHBOARD", ...parsed.data.permissions]));
  const { data, error } = await context.supabase.from("organization_access_roles").insert({
    organization_id: parsed.data.organizationId,
    name: parsed.data.name,
    permissions,
    is_system: false,
    system_code: null,
    created_by: context.userId,
  }).select("id, name, permissions").single();
  if (error || !data) return Response.json({ error: "Роль с таким названием уже существует." }, { status: 409 });
  return Response.json(data);
}
