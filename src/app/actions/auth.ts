"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveBetaInvite, validateBetaInviteForSignup } from "@/server/beta-access";

const credentialsSchema = z.object({
  email: z.email("Введите корректный email").trim().toLowerCase(),
  password: z.string().min(12, "Пароль должен содержать минимум 12 символов"),
});

const emailSchema = z.object({
  email: z.email("Введите корректный email").trim().toLowerCase(),
});

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

function registerError(message: string, inviteCode = ""): never {
  const invite = inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : "";
  redirect(`/register?error=${encodeURIComponent(message)}${invite}`);
}

function resendConfirmationPage(email: string, message: string): never {
  redirect(`/resend-confirmation?email=${encodeURIComponent(email)}&message=${encodeURIComponent(message)}`);
}

function passwordResetPage(message: string, kind: "error" | "message" = "message"): never {
  redirect(`/forgot-password?${kind}=${encodeURIComponent(message)}`);
}

function updatePasswordPage(message: string): never {
  redirect(`/update-password?error=${encodeURIComponent(message)}`);
}

function confirmationRedirectTo(origin: string | null): string | undefined {
  return origin ? `${origin}/auth/confirm` : undefined;
}

function passwordResetRedirectTo(origin: string | null): string | undefined {
  return origin ? `${origin}/auth/recovery` : undefined;
}

function isUnconfirmedEmailError(message: string): boolean {
  return /email not confirmed|email_not_confirmed/i.test(message);
}

function isExistingUserError(message: string): boolean {
  return /already (?:registered|exists)|user_already_exists/i.test(message);
}

function resendErrorMessage(message: string): string {
  if (/rate limit|email.*limit|too many requests/i.test(message)) {
    return "Supabase временно ограничил отправку писем. Подождите до часа или настройте корпоративную почту для сервиса.";
  }
  return "Supabase не смог отправить письмо. Повторите попытку чуть позже.";
}

export async function signIn(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) loginError("Проверьте email и пароль.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isUnconfirmedEmailError(error.message)) {
      resendConfirmationPage(parsed.data.email, "Email ещё не подтверждён. Отправьте новое письмо и откройте ссылку из него.");
    }
    loginError("Не удалось войти. Проверьте email и пароль.");
  }
  redirect("/dashboard");
}

export async function signUp(formData: FormData): Promise<void> {
  const inviteCode = String(formData.get("invite_code") ?? "").trim();
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!parsed.success || displayName.length < 2 || displayName.length > 160) {
    registerError("Укажите имя, корректный email и пароль от 12 символов.", inviteCode);
  }
  if (!await validateBetaInviteForSignup(inviteCode, parsed.data.email)) {
    registerError("Приглашение недействительно, уже использовано или выдано на другой email.", inviteCode);
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      data: { full_name: displayName, beta_invite_token: inviteCode },
      emailRedirectTo: confirmationRedirectTo(origin),
    },
  });
  if (error) {
    if (isExistingUserError(error.message)) {
      resendConfirmationPage(parsed.data.email, "Аккаунт уже создан. Если email ещё не подтверждён, отправьте новое письмо.");
    }
    registerError("Не удалось создать аккаунт. Попробуйте ещё раз.", inviteCode);
  }

  if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
    registerError("Аккаунт с таким email уже существует. Войдите или попросите новое приглашение на другой email.", inviteCode);
  }

  if (!data.user || !await reserveBetaInvite(inviteCode, data.user.id, parsed.data.email)) {
    if (data.user) await createAdminClient().auth.admin.deleteUser(data.user.id).catch(() => undefined);
    registerError("Аккаунт создан, но приглашение уже занято. Обратитесь к администратору беты.", inviteCode);
  }

  if (!data.session) {
    redirect("/login?message=Подтвердите%20email%2C%20затем%20войдите.");
  }
  redirect("/onboarding");
}

export async function resendConfirmation(formData: FormData): Promise<void> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) resendConfirmationPage("", "Введите корректный email.");

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: confirmationRedirectTo(origin) },
  });
  if (error) resendConfirmationPage(parsed.data.email, resendErrorMessage(error.message));

  redirect("/login?message=Если%20аккаунт%20существует%2C%20письмо%20для%20подтверждения%20отправлено.%20Проверьте%20Входящие%20и%20Спам.");
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) passwordResetPage("Введите корректный email.", "error");

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: passwordResetRedirectTo(origin),
  });
  if (error) {
    if (/rate limit|too many requests/i.test(error.message)) {
      passwordResetPage("Письмо уже запрошено. Подождите минуту и проверьте Входящие и Спам.", "error");
    }
    passwordResetPage("Не удалось отправить письмо. Попробуйте ещё раз немного позже.", "error");
  }

  passwordResetPage("Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.");
}

export async function updatePassword(formData: FormData): Promise<void> {
  const parsed = z.object({
    password: z.string().min(12).max(128),
    passwordConfirmation: z.string().min(12).max(128),
  }).safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("password_confirmation"),
  });
  if (!parsed.success || parsed.data.password !== parsed.data.passwordConfirmation) {
    updatePasswordPage("Пароли должны совпадать и содержать минимум 12 символов.");
  }

  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsResult?.claims?.sub) {
    updatePasswordPage("Ссылка недействительна или истекла. Запросите новое письмо.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) updatePasswordPage("Не удалось изменить пароль. Выберите другой пароль или запросите новую ссылку.");

  await supabase.auth.signOut();
  redirect("/login?message=Пароль%20изменён.%20Теперь%20войдите%20с%20новым%20паролем.");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
