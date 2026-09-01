"use client";

import { useState } from "react";

import { createIncome } from "@/app/actions/owner";
import { currencyLabels, isSupportedCurrency, supportedCurrencies, type SupportedCurrency } from "@/domain/currencies";

type IncomeFormProps = {
  organizationId: string;
  baseCurrency: string;
  trips: { id: string; title: string }[];
};

export function IncomeForm({ organizationId, baseCurrency, trips }: IncomeFormProps) {
  const initialCurrency: SupportedCurrency = isSupportedCurrency(baseCurrency) ? baseCurrency : "KZT";
  const [currency, setCurrency] = useState<SupportedCurrency>(initialCurrency);
  const needsFxRate = currency !== baseCurrency;

  return (
    <form action={createIncome} className="flow-card">
      <div className="flow-card-heading"><span className="flow-step">3</span><span><b>Доход</b><small>Оплата от заказчика</small></span></div>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div className="flow-fields income-fields">
        <label className="flow-field"><span>Рейс</span><select name="trip_id" required disabled={!trips.length}><option value="">Выберите рейс</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="flow-field"><span>Заказчик</span><input name="customer_name" placeholder="Название компании" /></label>
        <label className="flow-field"><span>Сумма</span><input name="amount" inputMode="decimal" placeholder="0" required /></label>
        <label className="flow-field"><span>Валюта</span><select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}>{supportedCurrencies.map((item) => <option key={item} value={item}>{currencyLabels[item]}</option>)}</select></label>
        {needsFxRate ? <label className="flow-field flow-field-wide fx-rate-field"><span>Курс к {baseCurrency}</span><input name="fx_rate" inputMode="decimal" placeholder={`1 ${currency} = сколько ${baseCurrency}`} aria-describedby="income-fx-help" required /><small id="income-fx-help">Введите курс на дату договорённости с заказчиком.</small></label> : <input type="hidden" name="fx_rate" value="1" />}
        <label className="flow-field"><span>Ожидаемая оплата</span><input name="expected_payment_at" type="date" /></label>
        <label className="flow-field flow-field-wide"><span>Комментарий</span><input name="comment" placeholder="Необязательно" /></label>
      </div>
      <div className="flow-card-action"><button type="submit" disabled={!trips.length}>Добавить доход</button></div>
    </form>
  );
}
