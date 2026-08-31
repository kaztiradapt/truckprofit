import { resendConfirmation } from "@/app/actions/auth";

export default async function ResendConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; message?: string }>;
}) {
  const { email, message } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Подтверждение email</p>
        <h1>Отправить письмо повторно</h1>
        <p className="lead">Укажите email, с которым регистрировались. Мы отправим новую ссылку, если аккаунт ожидает подтверждения.</p>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <form action={resendConfirmation} className="stack-form">
          <label>Email<input name="email" type="email" autoComplete="email" defaultValue={email} required /></label>
          <button type="submit">Отправить письмо</button>
        </form>
        <p className="muted"><a href="/login">Вернуться ко входу</a></p>
      </section>
    </main>
  );
}
