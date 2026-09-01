import { redirect } from "next/navigation";

import { updatePassword } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data?.claims?.sub) redirect("/forgot-password?error=Ссылка%20недействительна%20или%20истекла.%20Запросите%20новую.");

  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Новый пароль</p>
        <h1>Защитите аккаунт</h1>
        <p className="lead">Придумайте новый пароль длиной не менее 12 символов.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <form action={updatePassword} className="stack-form">
          <label>Новый пароль<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label>Повторите пароль<input name="password_confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <button type="submit">Сохранить новый пароль</button>
        </form>
      </section>
    </main>
  );
}
