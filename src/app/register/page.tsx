import { signUp } from "@/app/actions/auth";
import { getBetaInvitePreview } from "@/server/beta-access";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const { error, invite = "" } = await searchParams;
  const invitation = invite ? await getBetaInvitePreview(invite) : null;

  if (!invite) return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">Закрытая бета</p>
    <h1>Вход по приглашению</h1>
    <p className="lead">Новые компании подключаются вручную командой TruckProfit. После согласования мы отправим одноразовое приглашение на email или в Telegram.</p>
    <p className="muted">Уже есть аккаунт? <a href="/login">Войти</a></p>
  </section></main>;

  if (!invitation || invitation.status === "EXPIRED" || invitation.status === "REVOKED" || invitation.status === "USED") {
    return <main className="auth-page"><section className="auth-card">
      <p className="eyebrow">Закрытая бета</p>
      <h1>Приглашение недоступно</h1>
      <p className="lead">Ссылка истекла, была использована или отозвана. Попросите команду TruckProfit создать новую.</p>
      <p className="muted"><a href="/login">Вернуться ко входу</a></p>
    </section></main>;
  }

  if (!invitation.canRegister) return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">Beta-приглашение</p>
    <h1>{invitation.type === "EMAIL" ? "Проверьте почту" : "Подтвердите Telegram"}</h1>
    <p className="lead">{invitation.type === "EMAIL"
      ? `Доступ зарезервирован для ${invitation.maskedContact}. Откройте письмо от TruckProfit и установите пароль.`
      : `Сначала откройте персональную ссылку в Telegram под аккаунтом ${invitation.maskedContact} и нажмите START.`}</p>
    <p className="muted">После подтверждения вернитесь по ссылке приглашения. <a href="/login">Войти</a></p>
  </section></main>;

  return <main className="auth-page">
    <section className="auth-card">
      <p className="eyebrow">Закрытая бета · {invitation.maskedContact}</p>
      <h1>Создайте защищённый вход</h1>
      <p className="lead">После подтверждения email вы создадите первую транспортную компанию и выберете её основную валюту учёта.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <form action={signUp} className="stack-form">
        <input type="hidden" name="invite_code" value={invite} />
        <label>Ваше имя<input name="display_name" autoComplete="name" minLength={2} required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Пароль<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
        <button type="submit">Создать аккаунт</button>
      </form>
      <p className="muted">Уже есть аккаунт? <a href="/login">Войти</a>.</p>
    </section>
  </main>;
}
