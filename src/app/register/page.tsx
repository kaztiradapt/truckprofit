import { signUp } from "@/app/actions/auth";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Первый собственник</p>
        <h1>Создайте защищённый вход</h1>
        <p className="lead">После подтверждения email вы создадите первую транспортную компанию.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <form action={signUp} className="stack-form">
          <label>Ваше имя<input name="display_name" autoComplete="name" minLength={2} required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Пароль<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button type="submit">Создать аккаунт</button>
        </form>
        <p className="muted">Уже есть аккаунт? <a href="/login">Войти</a> или <a href="/resend-confirmation">отправить подтверждение повторно</a>.</p>
      </section>
    </main>
  );
}
