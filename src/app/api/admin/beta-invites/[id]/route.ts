import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/server/beta-access";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const parsed = z.object({ status: z.literal("REVOKED") }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return Response.json({ error: "Проверьте приглашение." }, { status: 400 });
  const adminContext = await requirePlatformAdmin();
  if (!adminContext) return Response.json({ error: "Доступно только администратору TruckProfit." }, { status: 403 });
  const { data: invitation, error: invitationError } = await adminContext.supabase
    .from("beta_access_invites")
    .select("id, reserved_user_id")
    .eq("id", id)
    .in("status", ["PENDING", "CLAIMED", "RESERVED"])
    .maybeSingle();
  if (invitationError) return Response.json({ error: "Не удалось проверить приглашение." }, { status: 409 });
  if (!invitation) return Response.json({ error: "Приглашение уже использовано или отозвано." }, { status: 409 });
  const { data, error } = await adminContext.supabase
    .from("beta_access_invites")
    .update({ status: "REVOKED" })
    .eq("id", id)
    .in("status", ["PENDING", "CLAIMED", "RESERVED"])
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: "Не удалось отозвать приглашение." }, { status: 409 });
  if (!data) return Response.json({ error: "Приглашение уже использовано или отозвано." }, { status: 409 });
  if (invitation.reserved_user_id) {
    const service = createAdminClient();
    const { data: memberships } = await service
      .from("organization_memberships")
      .select("id")
      .eq("user_id", invitation.reserved_user_id)
      .limit(1);
    if (!memberships?.length) await service.auth.admin.deleteUser(invitation.reserved_user_id).catch(() => undefined);
  }
  return Response.json({ ok: true });
}
