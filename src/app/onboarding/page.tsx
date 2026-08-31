import { createOrganization } from "@/app/actions/owner";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Шаг 1 из 1</p>
        <h1>Создайте компанию</h1>
        <p className="lead">Она станет отдельным защищённым контуром данных вашего автопарка.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <form action={createOrganization} className="stack-form">
          <label>Название компании<input name="name" placeholder="ТОО Demo Transport" minLength={2} required /></label>
          <label>Код в ссылке<input name="slug" placeholder="demo-transport" pattern="[a-z0-9][a-z0-9-]{1,62}" required /></label>
          <label>Базовая валюта<select name="currency" defaultValue="KZT"><option value="KZT">KZT — тенге</option><option value="RUB">RUB — рубль</option><option value="USD">USD — доллар</option></select></label>
          <button type="submit">Создать компанию</button>
        </form>
      </section>
    </main>
  );
}
