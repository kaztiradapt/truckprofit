import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeInternalRedirectPath } from "@/domain/security/internal-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const isPasswordRecovery = type === "recovery";
  const requestedNext = url.searchParams.get("next");
  const safeNext = safeInternalRedirectPath(requestedNext);
  const successPath = isPasswordRecovery ? "/update-password" : safeNext ?? (type === "invite" ? "/dashboard" : "/onboarding");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(successPath, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(new URL(successPath, url.origin));
  }

  if (isPasswordRecovery) {
    return NextResponse.redirect(new URL("/forgot-password?error=Ссылка%20недействительна%20или%20истекла.%20Запросите%20новую.", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=Не%20удалось%20подтвердить%20email.", url.origin));
}
