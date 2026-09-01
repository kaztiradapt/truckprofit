import { createOrganization } from "@/app/actions/owner";
import { currencyLabels, supportedCurrencies } from "@/domain/currencies";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Настройка учёта</p>
        <h1>Создайте своё хозяйство</h1>
        <p className="lead">Подойдёт и для компании с автопарком, и для владельца одной машины.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <form action={createOrganization} className="stack-form">
          <label>Название<input name="name" placeholder="ИП Арман / Demo Transport" minLength={2} required /></label>
          <label>Короткий код латиницей<input name="slug" placeholder="arman-transport" pattern="[a-z0-9][a-z0-9-]{1,62}" required /></label>
          <label>Базовая валюта<select name="currency" defaultValue="KZT">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyLabels[currency]}</option>)}</select></label>
          <label className="choice-card"><input name="owner_driver" type="checkbox" value="yes" /><span><b>Я владелец и сам вожу автомобиль</b><small>Создадим ваш профиль водителя автоматически.</small></span></label>
          <button type="submit">Начать учёт</button>
        </form>
      </section>
    </main>
  );
}
