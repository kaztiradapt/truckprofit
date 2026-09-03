import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BetaInviteAdmin, type BetaInviteListItem } from "./beta-invite-admin";

export const dynamic = "force-dynamic";

export default async function BetaAdminPage() {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) redirect("/login");

  const { data: platformAdmin, error: adminError } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (adminError || !platformAdmin) redirect("/dashboard");

  const { data, error } = await supabase
    .from("beta_access_invites")
    .select("id, invite_type, email, telegram_username, telegram_username_last, display_name, status, expires_at, claimed_at, reserved_at, used_at, used_organization_id, note, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return (
    <main className="beta-admin-page">
      <header className="beta-admin-topbar">
        <div>
          <p className="eyebrow">TruckProfit · служебный раздел</p>
          <h1>Закрытая бета</h1>
          <p>Выдавайте одноразовый доступ будущим владельцам компаний.</p>
        </div>
        <Link className="secondary-link" href="/dashboard">← В кабинет</Link>
      </header>
      <BetaInviteAdmin initialInvites={(data ?? []) as BetaInviteListItem[]} />
    </main>
  );
}
