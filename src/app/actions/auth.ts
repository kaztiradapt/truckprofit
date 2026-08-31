"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Введите корректный email").trim().toLowerCase(),
  password: z.string().min(12, "Пароль должен содержать минимум 12 символов"),
});

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

function registerError(message: string): never {
  redirect(`/register?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) loginError("Проверьте email и пароль.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) loginError("Не удалось войти. Проверьте email и пароль.");
  redirect("/dashboard");
}

export async function signUp(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!parsed.success || displayName.length < 2 || displayName.length > 160) {
    registerError("Укажите имя, корректный email и пароль от 12 символов.");
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  });
  if (error) registerError("Не удалось создать аккаунт. Возможно, этот email уже используется.");

  if (!data.session) {
    redirect("/login?message=Подтвердите%20email%2C%20затем%20войдите.");
  }
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
