export type ExpenseAmount = {
  amount: number;
  currency: string;
};

export type ExpenseCurrencyTotal = {
  currency: string;
  amount: number;
};

export function groupExpensesByCurrency(
  expenses: readonly ExpenseAmount[],
  baseCurrency: string,
): ExpenseCurrencyTotal[] {
  const totalsMinor = new Map<string, number>();

  for (const expense of expenses) {
    const currency = expense.currency.trim().toUpperCase();
    if (!currency || !Number.isFinite(expense.amount)) continue;
    const amountMinor = Math.round(expense.amount * 100);
    totalsMinor.set(currency, (totalsMinor.get(currency) ?? 0) + amountMinor);
  }

  const reportingCurrency = baseCurrency.trim().toUpperCase();
  return [...totalsMinor.entries()]
    .sort(([left], [right]) => {
      if (left === reportingCurrency) return -1;
      if (right === reportingCurrency) return 1;
      return left.localeCompare(right);
    })
    .map(([currency, amountMinor]) => ({ currency, amount: amountMinor / 100 }));
}
