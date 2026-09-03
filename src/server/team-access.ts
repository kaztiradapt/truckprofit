import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export const permissionCodes = [
  "VIEW_DASHBOARD",
  "VIEW_FINANCE",
  "MANAGE_VEHICLES",
  "MANAGE_DRIVERS",
  "MANAGE_TRIPS",
  "MANAGE_FINANCE",
  "REVIEW_EXPENSES",
  "MANAGE_TEAM",
  "DELETE_RECORDS",
] as const;

export type PermissionCode = typeof permissionCodes[number];

export type TeamRequestContext = {
  supabase: SupabaseClient;
  userId: string;
};

export async function authenticatedTeamRequest(): Promise<TeamRequestContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return error || !userId ? null : { supabase, userId };
}

export async function isOrganizationOwner(
  context: TeamRequestContext,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await context.supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId)
    .eq("role", "OWNER")
    .eq("status", "ACTIVE")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function getOrganizationTeamAccess(
  context: TeamRequestContext,
  organizationId: string,
): Promise<{ canManageTeam: boolean; isPrimaryOwner: boolean }> {
  const { data, error } = await context.supabase
    .from("organization_memberships")
    .select("role, organization_access_roles(permissions)")
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) return { canManageTeam: false, isPrimaryOwner: false };
  const nestedRole = data.organization_access_roles;
  const accessRole = Array.isArray(nestedRole) ? nestedRole[0] : nestedRole;
  const isPrimaryOwner = data.role === "OWNER";
  return {
    isPrimaryOwner,
    canManageTeam: isPrimaryOwner || Boolean(accessRole?.permissions?.includes("MANAGE_TEAM")),
  };
}

export function normalizeTelegramUsername(value: unknown): string | null {
  const normalized = String(value ?? "").trim().replace(/^@/, "");
  return normalized || null;
}
