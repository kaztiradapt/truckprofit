import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { maskBetaContact, type BetaInviteType } from "@/domain/beta-access";
import { authenticatedTeamRequest } from "@/server/team-access";

type BetaInviteRow = {
  id: string;
  invite_type: BetaInviteType;
  email: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  status: "PENDING" | "CLAIMED" | "RESERVED" | "USED" | "REVOKED";
  expires_at: string;
  reserved_user_id: string | null;
};

export type BetaInvitePreview = {
  type: BetaInviteType;
  maskedContact: string;
  status: BetaInviteRow["status"] | "EXPIRED";
  canRegister: boolean;
};

export function hashBetaInviteCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

async function findInvite(code: string): Promise<BetaInviteRow | null> {
  if (!/^beta_[A-Za-z0-9_-]{20,80}$/.test(code.trim())) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("beta_access_invites")
    .select("id, invite_type, email, telegram_username, telegram_user_id, status, expires_at, reserved_user_id")
    .eq("code_hash", hashBetaInviteCode(code))
    .maybeSingle();
  if (error || !data) return null;
  return data as BetaInviteRow;
}

export async function getBetaInvitePreview(code: string): Promise<BetaInvitePreview | null> {
  const invite = await findInvite(code);
  if (!invite) return null;
  const expired = new Date(invite.expires_at).getTime() <= Date.now();
  const contact = invite.invite_type === "EMAIL" ? invite.email : invite.telegram_username;
  if (!contact) return null;
  return {
    type: invite.invite_type,
    maskedContact: maskBetaContact(invite.invite_type, contact),
    status: expired ? "EXPIRED" : invite.status,
    canRegister: !expired && (
      (invite.invite_type === "EMAIL" && invite.status === "PENDING")
      || (invite.invite_type === "TELEGRAM" && invite.status === "CLAIMED" && Boolean(invite.telegram_user_id))
    ),
  };
}

export async function validateBetaInviteForSignup(code: string, email: string): Promise<boolean> {
  const invite = await findInvite(code);
  if (!invite || new Date(invite.expires_at).getTime() <= Date.now() || invite.reserved_user_id) return false;
  if (invite.invite_type === "EMAIL") return invite.status === "PENDING" && invite.email === email;
  return invite.status === "CLAIMED" && Boolean(invite.telegram_user_id);
}

export async function reserveBetaInvite(code: string, userId: string, email: string): Promise<boolean> {
  const invite = await findInvite(code);
  if (!invite || !await validateBetaInviteForSignup(code, email)) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("beta_access_invites")
    .update({ status: "RESERVED", reserved_user_id: userId, reserved_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("reserved_user_id", null)
    .in("status", invite.invite_type === "EMAIL" ? ["PENDING"] : ["CLAIMED"])
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function requirePlatformAdmin() {
  const context = await authenticatedTeamRequest();
  if (!context) return null;
  const { data, error } = await context.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  return error || !data ? null : context;
}
