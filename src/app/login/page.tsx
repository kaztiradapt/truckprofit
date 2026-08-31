import { signIn } from "@/app/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Fleet Economics</p>
        <h1>Экономика вашего парка</h1>
        <p className="lead">Войдите как собственник, менеджер или водитель.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <form action={signIn} className="stack-form">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Пароль<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
          <button type="submit">Войти</button>
        </form>
        <p className="muted">Не получили письмо для подтверждения? <a href="/resend-confirmation">Отправить повторно</a></p>
        <p className="muted">Первый раз здесь? <a href="/register">Создать аккаунт собственника</a></p>
      </section>
    </main>
  );
}
