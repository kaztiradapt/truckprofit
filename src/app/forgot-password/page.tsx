import { requestPasswordReset } from "@/app/actions/auth";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Восстановление доступа</p>
        <h1>Сбросить пароль</h1>
        <p className="lead">Укажите email аккаунта. Мы отправим безопасную ссылку для создания нового пароля.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <form action={requestPasswordReset} className="stack-form">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit">Отправить ссылку</button>
        </form>
        <p className="muted"><a href="/login">Вернуться ко входу</a></p>
      </section>
    </main>
  );
}
