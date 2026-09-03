import { createAdminClient } from "@/lib/supabase/admin";

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  throw new Error("User directory is too large to scan safely");
}

export type PreparedTeamAccount =
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; status: 409; error: string };

export async function prepareTeamWebAccount(input: {
  email: string;
  displayName: string;
  organizationId: string;
  origin: string;
}): Promise<PreparedTeamAccount> {
  const admin = createAdminClient();
  let userId = await findUserIdByEmail(input.email);
  let invited = false;

  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: { full_name: input.displayName },
      redirectTo: `${input.origin}/auth/confirm?next=/update-password`,
    });
    if (error || !data.user) throw error ?? new Error("Invitation user was not created");
    userId = data.user.id;
    invited = true;
  }

  const { data: memberships, error: membershipLookupError } = await admin
    .from("organization_memberships")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");
  if (membershipLookupError) throw membershipLookupError;
  if ((memberships ?? []).some((membership) => membership.organization_id === input.organizationId && membership.role === "OWNER")) {
    return { ok: false, status: 409, error: "Этот аккаунт уже является основным владельцем компании." };
  }
  if ((memberships ?? []).some((membership) => membership.organization_id !== input.organizationId)) {
    return { ok: false, status: 409, error: "Этот email уже используется в другой компании. Переключение между компаниями пока не поддерживается." };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    display_name: input.displayName,
  }, { onConflict: "id" });
  if (profileError) throw profileError;
  return { ok: true, userId, invited };
}
